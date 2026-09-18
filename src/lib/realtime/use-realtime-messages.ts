"use client";

/**
 * Live per-assignment chat.
 *
 * The socket carries a nudge, not the data. When an INSERT lands on
 * `public.messages` for this assignment — or when the tab wakes up, or the
 * network comes back, or the channel rejoins — the hook asks the server for
 * everything at or after the newest `created_at` it already holds, and merges
 * that in by id. Three reasons it is done this way rather than rendering the
 * WAL row straight from the payload:
 *
 *   1. Attachments. A chat photo lives in a private Storage bucket and needs a
 *      signed URL, which only the server can mint.
 *   2. Author names. `messages` carries `author_id`, not a display name.
 *   3. Gaps. A socket that was asleep buffers nothing. "Refetch since the last
 *      id I hold" is the only merge that is correct after an unknown outage,
 *      and using the same path for the happy case means the rare path is the
 *      one that runs constantly, so it cannot rot.
 *
 * Nothing here ever calls `router.refresh()`: a full RSC refresh would re-run
 * the whole page, throw away the composer's draft text and scroll position, and
 * take a visible beat. Messages are merged into local state instead.
 *
 * Optimistic send: `beginSend` puts the message on screen immediately with
 * state `sending`. `settleSend` records the id the Server Action returned, and
 * the local copy stops being rendered the instant the real row appears in the
 * merged list — same author, same text, same position, so there is nothing to
 * see. If the socket is dead the settle also triggers a resync, so the real row
 * still arrives promptly.
 */

import * as React from "react";

import type { ThreadMessage, ThreadSlice } from "@/features/messages/types";

import type { RealtimeStatus } from "./status";
import { useRealtimeChannel } from "./use-realtime-channel";

export type LiveMessageState = "sending" | "sent" | "failed";

export type LiveMessage = ThreadMessage & {
  /** Present only while this is an unconfirmed local copy. */
  localId?: string;
  state?: LiveMessageState;
  /** Object URLs for photos that are still being sent. */
  previewUrls?: string[];
};

type Pending = {
  localId: string;
  serverId: string | null;
  body: string | null;
  createdAt: string;
  previewUrls: string[];
  state: LiveMessageState;
};

export type SendDraft = {
  body: string | null;
  previewUrls?: string[];
};

export type UseRealtimeMessagesOptions = {
  assignmentId: string;
  viewerId: string;
  initialMessages: ThreadMessage[];
  initialUrls: Record<string, string>;
  /**
   * Server Action that returns the thread from `since` (inclusive) onwards,
   * with every attachment already signed. `null` means the caller may no
   * longer read the thread — treated as "keep what we have", never as "wipe
   * the screen".
   */
  fetchSince: (
    assignmentId: string,
    since: string | null,
  ) => Promise<ThreadSlice | null>;
  /** Set false to render a thread with no socket at all (tests, SSR-only). */
  enabled?: boolean;
};

export type UseRealtimeMessagesResult = {
  messages: LiveMessage[];
  urls: Record<string, string>;
  status: RealtimeStatus;
  /** Shows the message straight away. Returns the local id. */
  beginSend: (draft: SendDraft) => string;
  settleSend: (localId: string, serverId: string) => void;
  failSend: (localId: string) => void;
  discardSend: (localId: string) => void;
  resync: () => void;
};

function sortKey(message: { createdAt: string; id: string }): string {
  return `${message.createdAt}#${message.id}`;
}

/** Union by id, oldest first. The incoming server copy wins over a stale one. */
function mergeMessages(
  current: ThreadMessage[],
  incoming: ThreadMessage[],
): ThreadMessage[] {
  if (incoming.length === 0) return current;

  const byId = new Map(current.map((message) => [message.id, message]));
  let changed = false;

  for (const message of incoming) {
    const existing = byId.get(message.id);
    if (
      existing &&
      existing.body === message.body &&
      existing.isUnread === message.isUnread &&
      existing.attachments.length === message.attachments.length
    ) {
      continue;
    }
    byId.set(message.id, message);
    changed = true;
  }

  if (!changed) return current;

  return Array.from(byId.values()).sort((a, b) =>
    sortKey(a).localeCompare(sortKey(b)),
  );
}

/** Adds the signed URLs we did not already have, identity-stable otherwise. */
function mergeUrls(
  current: Record<string, string>,
  incoming: Record<string, string>,
): Record<string, string> {
  for (const [path, url] of Object.entries(incoming)) {
    if (current[path] !== url) return { ...current, ...incoming };
  }
  return current;
}

/**
 * Everything the merge owns, in ONE state object.
 *
 * Three separate `useState`s would need an effect to keep them in step with a
 * fresh server render, and a `setState` inside an effect is a cascading render
 * React (and this repo's lint config) rightly rejects. Holding the props the
 * state was derived from alongside it means the reconciliation is a comparison
 * during render — the documented "adjusting state when a prop changes" pattern
 * — instead of a second render pass.
 */
type MergeState = {
  fromMessages: ThreadMessage[];
  fromUrls: Record<string, string>;
  messages: ThreadMessage[];
  urls: Record<string, string>;
};

export function useRealtimeMessages({
  assignmentId,
  viewerId,
  initialMessages,
  initialUrls,
  fetchSince,
  enabled = true,
}: UseRealtimeMessagesOptions): UseRealtimeMessagesResult {
  const [merged, setMerged] = React.useState<MergeState>(() => ({
    fromMessages: initialMessages,
    fromUrls: initialUrls,
    messages: initialMessages,
    urls: initialUrls,
  }));

  // A new server render (a navigation, or a router.refresh() fired elsewhere on
  // the page) must not be thrown away, and must not clobber messages that only
  // the socket has seen. Reconciled during render, not in an effect.
  let state = merged;
  if (
    merged.fromMessages !== initialMessages ||
    merged.fromUrls !== initialUrls
  ) {
    state = {
      fromMessages: initialMessages,
      fromUrls: initialUrls,
      messages: mergeMessages(merged.messages, initialMessages),
      urls: mergeUrls(merged.urls, initialUrls),
    };
    setMerged(state);
  }

  const [pending, setPending] = React.useState<Pending[]>([]);

  const fetchRef = React.useRef(fetchSince);
  const cursorRef = React.useRef<string | null>(null);
  const knownIdsRef = React.useRef<Set<string>>(new Set());
  const aliveRef = React.useRef(true);
  const inFlightRef = React.useRef(false);
  const againRef = React.useRef(false);

  React.useEffect(() => {
    fetchRef.current = fetchSince;
  });

  // Refs are written in an effect, never during render.
  React.useEffect(() => {
    const list = state.messages;
    cursorRef.current =
      list.length > 0 ? list[list.length - 1].createdAt : null;
    knownIdsRef.current = new Set(list.map((message) => message.id));
  }, [state.messages]);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const resync = React.useCallback(() => {
    if (inFlightRef.current) {
      // Coalesce: a burst of five inserts is one extra read, not five.
      againRef.current = true;
      return;
    }
    inFlightRef.current = true;

    void (async () => {
      try {
        // Loops rather than recursing, so this callback has no reference to
        // itself and stays memoizable.
        do {
          againRef.current = false;
          const slice = await fetchRef.current(assignmentId, cursorRef.current);
          if (!aliveRef.current) return;
          if (!slice) break;

          const incoming = slice.messages;
          const incomingUrls = slice.urls;
          setMerged((current) => {
            const messages = mergeMessages(current.messages, incoming);
            const urls = mergeUrls(current.urls, incomingUrls);
            if (messages === current.messages && urls === current.urls) {
              return current;
            }
            return { ...current, messages, urls };
          });
        } while (againRef.current && aliveRef.current);
      } catch {
        // A failed catch-up is not an error the user can act on. The next
        // insert, the next wake-up or the fallback poll will try again.
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, [assignmentId]);

  const status = useRealtimeChannel({
    channelName: enabled ? `thread:${assignmentId}` : null,
    table: "messages",
    filter: `assignment_id=eq.${assignmentId}`,
    events: ["INSERT"],
    onChange: resync,
    onResync: resync,
  });

  // ---- optimistic send ------------------------------------------------------

  const prunePending = (current: Pending[]): Pending[] => {
    const known = knownIdsRef.current;
    const next = current.filter(
      (item) => !(item.serverId && known.has(item.serverId)),
    );
    return next.length === current.length ? current : next;
  };

  const beginSend = React.useCallback((draft: SendDraft): string => {
    const localId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `local-${Date.now()}-${Math.random()}`;

    setPending((current) => [
      ...prunePending(current),
      {
        localId,
        serverId: null,
        body: draft.body,
        createdAt: new Date().toISOString(),
        previewUrls: draft.previewUrls ?? [],
        state: "sending",
      },
    ]);

    return localId;
  }, []);

  const settleSend = React.useCallback(
    (localId: string, serverId: string) => {
      setPending((current) =>
        current.map((item) =>
          item.localId === localId
            ? { ...item, serverId, state: "sent" as const }
            : item,
        ),
      );
      // Pull the real row (and its signed photo URLs) even if the socket is
      // down. The local copy stops rendering the moment it lands.
      resync();
    },
    [resync],
  );

  const failSend = React.useCallback((localId: string) => {
    setPending((current) =>
      current.map((item) =>
        item.localId === localId
          ? { ...item, state: "failed" as const }
          : item,
      ),
    );
  }, []);

  const discardSend = React.useCallback((localId: string) => {
    setPending((current) => current.filter((item) => item.localId !== localId));
  }, []);

  const serverMessages = state.messages;

  const messages = React.useMemo<LiveMessage[]>(() => {
    if (pending.length === 0) return serverMessages;

    // A local copy stops rendering as soon as its server row is in the list.
    // Derived, not stored: nothing has to fire to make the swap happen, so
    // there is no frame in which both are on screen.
    const known = new Set(serverMessages.map((message) => message.id));
    const local: LiveMessage[] = pending
      .filter((item) => !(item.serverId && known.has(item.serverId)))
      .map((item) => ({
        id: item.serverId ?? item.localId,
        localId: item.localId,
        body: item.body,
        voicePath: null,
        createdAt: item.createdAt,
        authorId: viewerId,
        authorName: null,
        isMine: true,
        isUnread: false,
        attachments: [],
        previewUrls: item.previewUrls,
        state: item.state,
      }));

    return local.length === 0 ? serverMessages : [...serverMessages, ...local];
  }, [serverMessages, pending, viewerId]);

  return {
    messages,
    urls: state.urls,
    status,
    beginSend,
    settleSend,
    failSend,
    discardSend,
    resync,
  };
}
