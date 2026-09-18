"use client";

/**
 * The parent's conversation list — the left pane of `/parent/chat`.
 *
 * Server-rendered first, then kept current over the SAME realtime primitive the
 * thread itself uses (`useRealtimeChannel`). There is no second subscription
 * layer here and no polling of its own: one channel on `public.messages` with
 * no filter, which RLS scopes to the family, and every event is a nudge to
 * re-read the whole list through a Server Action. The list is at most a few
 * dozen rows, so re-reading it is cheaper and far less fragile than
 * reconciling a WAL payload that carries neither the child, the subject, nor
 * the unread arithmetic.
 *
 * Read state comes back the other way round: `MarkThreadRead` (inside the open
 * thread) writes `message_reads`, clears the matching `message_posted`
 * notifications and calls `router.refresh()`, which re-renders the layout this
 * list lives in. That arrives here as a new `initialThreads` prop and is
 * reconciled during render — so the badge in this list, the badge on the row
 * and the bell all drop at the same moment.
 *
 * One deliberate piece of stubbornness: the thread that is currently open never
 * re-sorts. Its sort key is frozen when it opens, so answering a question does
 * not make the row you are reading jump to the top of the list under your
 * thumb. It takes its new place the moment you leave it.
 */

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Filter, MessageCircle, WifiOff } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatWaitedFor } from "@/features/assignments/dates";
import { AssignmentStatusBadge } from "@/features/assignments/status-badge";
import { useRealtimeChannel } from "@/lib/realtime";
import { ka, t } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";

import { listChatThreadsAction } from "./actions";
import type { ChatThreadSummary } from "./types";

/** `/parent/chat/<uuid>` → `<uuid>`; the list route itself → `null`. */
function activeIdFrom(pathname: string): string | null {
  const rest = pathname.startsWith("/parent/chat/")
    ? pathname.slice("/parent/chat/".length)
    : "";
  const id = rest.split("/")[0];
  return id.length > 0 ? id : null;
}

type Frozen = { id: string; unreadRank: number; at: string };

function unreadRank(thread: ChatThreadSummary): number {
  return thread.unreadCount > 0 ? 0 : 1;
}

export function ThreadList({
  initialThreads,
}: {
  initialThreads: ChatThreadSummary[];
}) {
  const pathname = usePathname();
  const activeId = activeIdFrom(pathname);

  // ---- live data ------------------------------------------------------------
  // The server render is the source of truth; the socket only asks for a newer
  // one. Reconciled during render rather than in an effect, the same pattern as
  // `useRealtimeMessages`.
  const [state, setState] = React.useState({
    from: initialThreads,
    list: initialThreads,
  });

  let current = state;
  if (state.from !== initialThreads) {
    current = { from: initialThreads, list: initialThreads };
    setState(current);
  }

  const aliveRef = React.useRef(true);
  const inFlightRef = React.useRef(false);
  const againRef = React.useRef(false);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const refresh = React.useCallback(() => {
    if (inFlightRef.current) {
      // A burst of three messages across three threads is one extra read.
      againRef.current = true;
      return;
    }
    inFlightRef.current = true;

    void (async () => {
      try {
        do {
          againRef.current = false;
          const next = await listChatThreadsAction();
          if (!aliveRef.current) return;
          // `null` means the session went away — keep what is on screen.
          if (next) setState((now) => ({ from: now.from, list: next }));
        } while (againRef.current && aliveRef.current);
      } catch {
        // A failed catch-up is not something the reader can act on; the next
        // insert, wake-up or fallback poll tries again.
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, []);

  // No filter: a parent's list spans every child, and RLS already decides which
  // rows exist for this user. One channel for the whole screen.
  const status = useRealtimeChannel({
    channelName: "parent-chat-threads",
    table: "messages",
    events: ["INSERT"],
    onChange: refresh,
    onResync: refresh,
  });

  const threads = current.list;

  // ---- filters (local, not in the URL) --------------------------------------
  // This list is rendered from a layout, and a Next.js layout is never given
  // `searchParams`. Keeping the two filters in component state instead means
  // they survive every navigation between threads — the layout stays mounted —
  // without a round trip per keystroke of the filter.
  const [childId, setChildId] = React.useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = React.useState(false);

  const childOptions = React.useMemo(() => {
    const seen = new Map<string, { id: string; name: string; color: string | null }>();
    for (const thread of threads) {
      if (!thread.childId || seen.has(thread.childId)) continue;
      seen.set(thread.childId, {
        id: thread.childId,
        name: thread.childName ?? ka.messages.unknownAuthor,
        color: thread.childColor,
      });
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "ka"),
    );
  }, [threads]);

  // A filter that hides every child would be a dead end; drop it silently if
  // the child it names no longer has a conversation.
  const activeChild = childOptions.find((child) => child.id === childId) ?? null;

  // ---- frozen sort key for the open thread ----------------------------------
  const [frozen, setFrozen] = React.useState<Frozen | null>(null);
  if ((frozen?.id ?? null) !== activeId) {
    if (activeId === null) {
      setFrozen(null);
    } else {
      const thread = threads.find((item) => item.assignmentId === activeId);
      setFrozen({
        id: activeId,
        unreadRank: thread ? unreadRank(thread) : 1,
        at: thread?.lastMessageAt ?? new Date().toISOString(),
      });
    }
  }

  const visible = React.useMemo(() => {
    const filtered = threads.filter((thread) => {
      if (activeChild && thread.childId !== activeChild.id) return false;
      // The thread you are reading never disappears from under you, whatever
      // the "unread only" switch says — it stopped being unread because you
      // opened it.
      if (unreadOnly && thread.unreadCount === 0 && thread.assignmentId !== activeId) {
        return false;
      }
      return true;
    });

    const keyOf = (thread: ChatThreadSummary) =>
      frozen && frozen.id === thread.assignmentId
        ? { rank: frozen.unreadRank, at: frozen.at }
        : { rank: unreadRank(thread), at: thread.lastMessageAt };

    return filtered.sort((a, b) => {
      const left = keyOf(a);
      const right = keyOf(b);
      if (left.rank !== right.rank) return left.rank - right.rank;
      return right.at.localeCompare(left.at);
    });
  }, [threads, activeChild, unreadOnly, activeId, frozen]);

  const totalUnread = threads.reduce(
    (sum, thread) => sum + thread.unreadCount,
    0,
  );
  const filtering = Boolean(activeChild) || unreadOnly;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border bg-card">
      <header className="grid gap-2 border-b p-3">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold tracking-tight">
            {ka.messages.parentChatTitle}
          </h1>
          {totalUnread > 0 ? (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground tabular-nums">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          ) : null}
          <span className="ms-auto text-xs text-muted-foreground">
            {t("messages.threadCount", { count: threads.length })}
          </span>
        </div>

        {childOptions.length > 1 || totalUnread > 0 || filtering ? (
          <div className="flex flex-wrap items-center gap-2">
            {childOptions.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Filter className="size-3.5" />
                    <span className="truncate">
                      {activeChild?.name ?? ka.messages.filterAllChildren}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuLabel>
                    {ka.messages.filterChild}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={activeChild === null}
                    onCheckedChange={() => setChildId(null)}
                  >
                    {ka.messages.filterAllChildren}
                  </DropdownMenuCheckboxItem>
                  {childOptions.map((child) => (
                    <DropdownMenuCheckboxItem
                      key={child.id}
                      checked={activeChild?.id === child.id}
                      onCheckedChange={() => setChildId(child.id)}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="size-2 rounded-full bg-border"
                          style={
                            child.color
                              ? { backgroundColor: child.color }
                              : undefined
                          }
                        />
                        {child.name}
                      </span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            <Button
              type="button"
              variant={unreadOnly ? "default" : "outline"}
              size="sm"
              aria-pressed={unreadOnly}
              className="gap-1.5"
              onClick={() => setUnreadOnly((value) => !value)}
            >
              {unreadOnly ? <Check className="size-3.5" /> : null}
              {ka.messages.filterUnreadOnly}
            </Button>
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {visible.length === 0 ? (
          <EmptyList
            reason={
              threads.length === 0
                ? "none"
                : unreadOnly && !activeChild
                  ? "no-unread"
                  : "filtered"
            }
          />
        ) : (
          <ul>
            {visible.map((thread) => (
              <li key={thread.assignmentId}>
                <ThreadRow
                  thread={thread}
                  active={thread.assignmentId === activeId}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {status === "offline" ? (
        <p className="flex items-center gap-1.5 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          <WifiOff className="size-3" />
          {ka.messages.liveOffline}
        </p>
      ) : null}
    </div>
  );
}

function EmptyList({ reason }: { reason: "none" | "no-unread" | "filtered" }) {
  const copy =
    reason === "none"
      ? { title: ka.messages.noThreads, hint: ka.messages.noThreadsHint }
      : reason === "no-unread"
        ? { title: ka.messages.noUnread, hint: ka.messages.noUnreadHint }
        : { title: ka.messages.noMatches, hint: ka.messages.noMatchesHint };

  return (
    <div className="grid place-items-center gap-1 px-4 py-10 text-center">
      <MessageCircle className="size-6 text-muted-foreground" />
      <p className="text-sm font-medium">{copy.title}</p>
      <p className="text-xs text-balance text-muted-foreground">{copy.hint}</p>
    </div>
  );
}

function ThreadRow({
  thread,
  active,
}: {
  thread: ChatThreadSummary;
  active: boolean;
}) {
  const unread = thread.unreadCount > 0;
  const preview =
    thread.lastMessageKind === "text"
      ? thread.lastMessagePreview
      : thread.lastMessageKind === "voice"
        ? ka.messages.voiceMessage
        : ka.messages.photoMessage;
  const author = thread.lastMessageIsMine
    ? ka.messages.you
    : (thread.lastMessageAuthorName ??
      thread.childName ??
      ka.messages.unknownAuthor);
  const waited = formatWaitedFor(thread.lastMessageAt);

  return (
    <Link
      href={`/parent/chat/${thread.assignmentId}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-start gap-2.5 border-b px-3 py-2.5 transition-colors last:border-b-0",
        active ? "bg-muted" : "hover:bg-muted/60",
        unread && !active && "bg-primary/5",
      )}
    >
      <Avatar className="mt-0.5 size-8">
        {thread.childAvatarUrl ? (
          <AvatarImage src={thread.childAvatarUrl} alt="" />
        ) : null}
        <AvatarFallback
          className="text-xs font-semibold"
          style={
            thread.childColor
              ? { backgroundColor: `${thread.childColor}22`, color: thread.childColor }
              : undefined
          }
        >
          {(thread.childName ?? "?").trim().slice(0, 1).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex items-center gap-1.5">
          <span
            className="truncate text-xs font-medium"
            style={thread.childColor ? { color: thread.childColor } : undefined}
          >
            {thread.childName ?? ka.messages.unknownAuthor}
          </span>
          {thread.subjectName ? (
            <span className="truncate text-xs text-muted-foreground">
              · {thread.subjectName}
            </span>
          ) : null}
          {waited ? (
            <span className="ms-auto shrink-0 text-[11px] text-muted-foreground">
              {t("notifications.ago", { time: waited })}
            </span>
          ) : null}
        </span>

        <span
          className={cn(
            "truncate text-sm",
            unread ? "font-semibold" : "font-medium",
          )}
        >
          {thread.title}
        </span>

        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            <span className="font-medium">{author}</span>
            {preview ? `: ${preview}` : ""}
          </span>
          {unread ? (
            <span
              aria-label={t("messages.unreadCount", {
                count: thread.unreadCount,
              })}
              className="grid min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums"
            >
              {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
            </span>
          ) : null}
        </span>

        <span className="mt-0.5 flex items-center gap-1.5">
          <AssignmentStatusBadge
            status={thread.status}
            className="px-1.5 py-0 text-[10px]"
          />
        </span>
      </span>
    </Link>
  );
}
