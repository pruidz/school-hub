"use client";

/**
 * One Postgres-changes subscription, with the plumbing that makes it survive a
 * phone going in a pocket.
 *
 * Everything the app subscribes to goes through here, so the reconnect story is
 * written once:
 *
 *   * The channel is created inside an effect, never during render, and the
 *     browser client behind it is built once, in the browser only. Building it
 *     throws when the Supabase env vars are missing, which during a prerender
 *     would take the whole page down; here it degrades to `unavailable` and the
 *     caller carries on with its server-rendered data.
 *   * Every join is followed by `onResync`, EXCEPT the very first one — the
 *     first render already has fresh server data, so resyncing immediately
 *     would be a wasted round trip. Every join after that is a RE-join, and a
 *     rejoin means we were disconnected for an unknown length of time.
 *   * A drop schedules a reconnect with exponential backoff and jitter. The
 *     socket layer in supabase-js retries too; we recreate the channel so a
 *     channel that died on its own (rather than with the socket) also comes
 *     back.
 *   * `visibilitychange`, `focus` and `online` short-circuit the backoff. A
 *     phone that slept for an hour has a socket the OS killed without telling
 *     anyone; waiting out a 30-second backoff after the user is already looking
 *     at the screen is exactly the "silently dead thread" this exists to
 *     prevent. Those three also resync unconditionally, even when the channel
 *     still claims to be live, because a zombie socket claims that too.
 *   * While not live and visible, `onResync("poll")` fires on a slow timer.
 *     That is the floor: if the websocket never connects at all, the screen
 *     still catches up, just less promptly.
 *
 * The socket is never a source of truth. `onChange` hands over the raw row so a
 * caller can act on it, but every consumer in this app treats it as a nudge and
 * re-reads through a Server Action, because RLS, joins and signed URLs all live
 * on the server.
 */

import * as React from "react";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

import type { RealtimeStatus, ResyncReason } from "./status";

/** DELETE is never subscribed to in this app; see 0009 section 1. */
export type PostgresEvent = "INSERT" | "UPDATE";

export type ChangePayload = RealtimePostgresChangesPayload<
  Record<string, unknown>
>;

export type UseRealtimeChannelOptions = {
  /** Unique channel name. `null` means "nothing to subscribe to yet". */
  channelName: string | null;
  table: string;
  /**
   * PostgREST-style filter, e.g. `assignment_id=eq.<uuid>`. A filter is a
   * bandwidth optimisation, never a security boundary — Supabase Realtime runs
   * the table's RLS SELECT policies against every change before it is sent,
   * and that is what keeps other people's rows out.
   */
  filter?: string;
  events?: PostgresEvent[];
  onChange?: (payload: ChangePayload) => void;
  onResync?: (reason: ResyncReason) => void;
  /** Slow catch-up while the socket is down. 0 disables it. */
  fallbackPollMs?: number;
};

const FIRST_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
const MAX_BACKOFF_STEPS = 10;
const DEFAULT_FALLBACK_POLL_MS = 20_000;

function backoffMs(attempt: number): number {
  const base = Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** attempt);
  // Jitter so a hundred phones coming out of a tunnel do not reconnect in step.
  return base / 2 + Math.random() * (base / 2);
}

export function useRealtimeChannel({
  channelName,
  table,
  filter,
  events,
  onChange,
  onResync,
  fallbackPollMs = DEFAULT_FALLBACK_POLL_MS,
}: UseRealtimeChannelOptions): RealtimeStatus {
  // The socket's own state. What the caller sees is this, "idle" or
  // "unavailable", derived at the bottom — nothing is written to state just to
  // say "there is nothing to do here".
  const [socketStatus, setSocketStatus] =
    React.useState<RealtimeStatus>("connecting");

  // Built once, and never during a server render. `createBrowserClient` is a
  // singleton, so this is idempotent; it throws when the Supabase env vars are
  // missing, and a realtime hook is not a reason to take a page down.
  const [client] = React.useState<ReturnType<typeof createClient> | null>(
    () => {
      if (typeof window === "undefined") return null;
      try {
        return createClient();
      } catch {
        return null;
      }
    },
  );

  // Handlers live in refs so an inline arrow function in the caller does not
  // tear the channel down and rebuild it on every render.
  const onChangeRef = React.useRef(onChange);
  const onResyncRef = React.useRef(onResync);
  React.useEffect(() => {
    onChangeRef.current = onChange;
    onResyncRef.current = onResync;
  });

  // A primitive, so the effect below does not re-run on a new array identity.
  const eventKey = (events ?? ["INSERT"]).join(",");

  // Two components subscribing to the same thing must not collide on one
  // Phoenix topic — the bell and the kid tab badge both watch `notifications`,
  // and a page can hold two threads. `useId` is stable for the lifetime of the
  // component instance, so the channel is per-mount, not per-render.
  const instanceId = React.useId();
  const topic = channelName ? `${channelName}:${instanceId}` : null;

  React.useEffect(() => {
    if (!topic || !client) return;

    // Locals, so the closures below are not re-narrowing a captured variable.
    const supabase = client;
    const name = topic;

    let disposed = false;
    let channel: RealtimeChannel | null = null;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let hasJoined = false;
    let live = false;

    const resync = (reason: ResyncReason) => onResyncRef.current?.(reason);

    const clearRetry = () => {
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const teardown = () => {
      const doomed = channel;
      channel = null;
      if (!doomed) return;
      try {
        void supabase.removeChannel(doomed);
      } catch {
        // A channel that is already gone is exactly what we wanted.
      }
    };

    const scheduleRetry = () => {
      if (disposed || retryTimer !== null) return;
      const wait = backoffMs(attempt);
      attempt = Math.min(attempt + 1, MAX_BACKOFF_STEPS);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connect();
      }, wait);
    };

    function connect() {
      if (disposed) return;
      teardown();
      setSocketStatus("connecting");

      const next = supabase.channel(name);

      for (const event of eventKey.split(",") as PostgresEvent[]) {
        next.on<Record<string, unknown>>(
          "postgres_changes",
          filter
            ? { event, schema: "public", table, filter }
            : { event, schema: "public", table },
          (payload) => {
            if (disposed) return;
            onChangeRef.current?.(payload);
          },
        );
      }

      channel = next;

      next.subscribe((subscriptionStatus) => {
        if (disposed) return;

        if (subscriptionStatus === "SUBSCRIBED") {
          attempt = 0;
          clearRetry();
          live = true;
          setSocketStatus("live");
          // The first join follows a fresh server render; every later join
          // follows a gap of unknown length.
          if (hasJoined) resync("reconnect");
          hasJoined = true;
          return;
        }

        if (
          subscriptionStatus === "CHANNEL_ERROR" ||
          subscriptionStatus === "TIMED_OUT" ||
          subscriptionStatus === "CLOSED"
        ) {
          live = false;
          setSocketStatus("offline");
          scheduleRetry();
        }
      });
    }

    /** The tab came back, or the network did. Do not wait out the backoff. */
    const wakeUp = (reason: ResyncReason) => {
      if (disposed) return;
      // Ask the server first: even if the socket claims to be live, it may have
      // been a zombie for the whole time the tab was hidden.
      resync(reason);
      if (!live) {
        attempt = 0;
        clearRetry();
        connect();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") wakeUp("visible");
    };
    const onFocus = () => wakeUp("visible");
    const onOnline = () => wakeUp("online");

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);

    if (fallbackPollMs > 0) {
      pollTimer = setInterval(() => {
        if (disposed || live) return;
        if (document.visibilityState !== "visible") return;
        resync("poll");
      }, fallbackPollMs);
    }

    connect();

    return () => {
      disposed = true;
      clearRetry();
      if (pollTimer !== null) clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      teardown();
    };
  }, [client, topic, table, filter, eventKey, fallbackPollMs]);

  if (!topic) return "idle";
  return client ? socketStatus : "unavailable";
}
