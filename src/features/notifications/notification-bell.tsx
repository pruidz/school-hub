"use client";

/**
 * `<NotificationBell />` — the in-app inbox, for both shells.
 *
 * It takes no required props on purpose. The shells (`ParentShell`, `KidShell`)
 * are Client Components owned by A2, so a bell that needed server-fetched props
 * would have to be threaded through their signatures. This one mounts itself,
 * asks a Server Action who it is and what it has, and subscribes from there —
 * `<NotificationBell />` is the whole integration.
 *
 * Degradation is the design constraint, not an afterthought. The trigger button
 * renders on the first frame with no count; the count appears when the action
 * answers; the popover opens and lists whatever has arrived. If realtime never
 * connects, `useRealtimeNotifications` still does its initial read and its
 * one-minute refresh, so the bell is correct, just slower. There is no state in
 * which the user is looking at a spinner because a websocket failed.
 */

import * as React from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatWaitedFor } from "@/features/assignments/dates";
import { useRealtimeNotifications } from "@/lib/realtime";
import { ka, t } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";

import {
  loadNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "./actions";
import {
  notificationHref,
  notificationSubtitle,
  notificationTitle,
} from "./payload";
import type { NotificationFeed, NotificationItem } from "./types";

/** Belt and braces on top of the server refresh, for a tab left open all day. */
const BACKGROUND_REFRESH_MS = 60_000;

/** The feed tells the hook who the viewer is; that is the realtime filter. */
const feedViewerId = (feed: NotificationFeed) => feed.viewerId || null;

export type NotificationBellProps = {
  /**
   * `"parent"` — 32px ghost button, sits in the desktop header next to the
   * theme toggle. `"kid"` — 36px button and larger rows, sized for a thumb.
   */
  variant?: "parent" | "kid";
  /** Popover alignment. Defaults to `"end"`, which is right for both headers. */
  align?: "start" | "center" | "end";
  className?: string;
};

/**
 * Rows the user just clicked, held ALONGSIDE the feed they apply to.
 *
 * Storing the feed here is what makes the optimistic state self-expiring: the
 * moment a newer feed arrives from the server, `optimistic.feed !== data` and
 * the overlay is simply not used. No effect, no reset, no window in which a
 * stale "read" flag survives a refresh that says otherwise.
 */
type Optimistic = {
  feed: NotificationFeed | null;
  ids: string[];
  all: boolean;
};

const NO_OPTIMISTIC: Optimistic = { feed: null, ids: [], all: false };

export function NotificationBell({
  variant = "parent",
  align = "end",
  className,
}: NotificationBellProps = {}) {
  const [open, setOpen] = React.useState(false);

  const { data, refresh } = useRealtimeNotifications<NotificationFeed>({
    fetch: loadNotificationsAction,
    userIdFrom: feedViewerId,
    refreshMs: BACKGROUND_REFRESH_MS,
  });

  const [optimisticState, setOptimisticState] =
    React.useState<Optimistic>(NO_OPTIMISTIC);
  const optimistic =
    optimisticState.feed === data ? optimisticState : NO_OPTIMISTIC;

  const items = data?.items ?? [];
  const isRead = (item: NotificationItem) =>
    optimistic.all || item.readAt !== null || optimistic.ids.includes(item.id);

  const unreadCount = optimistic.all
    ? 0
    : Math.max(0, (data?.unreadCount ?? 0) - optimistic.ids.length);

  const markOne = (item: NotificationItem) => {
    if (item.readAt !== null) return;
    if (!optimistic.ids.includes(item.id)) {
      setOptimisticState({
        feed: data,
        ids: [...optimistic.ids, item.id],
        all: optimistic.all,
      });
    }
    void markNotificationReadAction({ id: item.id }).then(() => refresh());
  };

  const markAll = () => {
    setOptimisticState({ feed: data, ids: optimistic.ids, all: true });
    void markAllNotificationsReadAction().then(() => refresh());
  };

  const kid = variant === "kid";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={kid ? "icon-lg" : "icon"}
          aria-label={
            unreadCount > 0
              ? t("notifications.bellWithCount", { count: unreadCount })
              : ka.notifications.bell
          }
          className={cn("relative", className)}
        >
          <Bell className={kid ? "size-6" : undefined} />
          {unreadCount > 0 ? (
            <span
              aria-hidden
              className={cn(
                "absolute grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 font-bold text-primary-foreground tabular-nums",
                kid ? "top-1 right-0.5" : "top-0.5 right-0",
              )}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align={align}
        className={cn("gap-0 p-0", kid ? "w-[min(22rem,92vw)]" : "w-80")}
      >
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <span className="text-sm font-semibold">
            {ka.notifications.title}
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={markAll}
            disabled={unreadCount === 0}
          >
            <CheckCheck />
            {ka.notifications.markAllRead}
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="grid place-items-center gap-1 px-3 py-8 text-center">
            <Bell className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {ka.notifications.empty}
            </p>
            <p className="text-xs text-muted-foreground">
              {ka.notifications.emptyHint}
            </p>
          </div>
        ) : (
          <ul className="max-h-[min(24rem,60vh)] overflow-y-auto">
            {items.map((item) => (
              <li key={item.id} className="border-b last:border-b-0">
                <Row
                  item={item}
                  read={isRead(item)}
                  kid={kid}
                  onActivate={() => {
                    markOne(item);
                    setOpen(false);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Row({
  item,
  read,
  kid,
  onActivate,
}: {
  item: NotificationItem;
  read: boolean;
  kid: boolean;
  onActivate: () => void;
}) {
  const href = notificationHref(item);
  const subtitle = notificationSubtitle(item);
  const when = formatWaitedFor(item.createdAt);

  const body = (
    <>
      <span
        aria-hidden
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          read ? "bg-transparent" : "bg-primary",
        )}
      />
      <span className="grid min-w-0 gap-0.5 text-start">
        <span
          className={cn(
            "truncate",
            kid ? "text-base" : "text-sm",
            read ? "font-normal" : "font-semibold",
          )}
        >
          {notificationTitle(item)}
        </span>
        {subtitle ? (
          <span
            className={cn(
              "truncate text-muted-foreground",
              kid ? "text-sm" : "text-xs",
            )}
          >
            {subtitle}
          </span>
        ) : null}
        {when ? (
          <span className="text-[11px] text-muted-foreground">
            {t("notifications.ago", { time: when })}
          </span>
        ) : null}
      </span>
    </>
  );

  const shared = cn(
    "flex w-full items-start gap-2 px-3 text-start transition-colors hover:bg-muted/60",
    kid ? "py-3" : "py-2",
    read ? null : "bg-primary/5",
  );

  // A row with no link still marks itself read — it is a notification about
  // something that has since been deleted, and it should not sit there unread
  // forever.
  if (!href) {
    return (
      <button type="button" onClick={onActivate} className={shared}>
        {body}
      </button>
    );
  }

  return (
    <Link href={href} onClick={onActivate} className={shared}>
      {body}
    </Link>
  );
}

/**
 * Count-only badge, for decorating something that is already a link — the
 * kid tab bar's chat tab, for instance. No popover, no navigation of its own.
 * Renders nothing at all when there is nothing unread.
 */
export function NotificationCountBadge({
  className,
}: {
  className?: string;
} = {}) {
  const { data } = useRealtimeNotifications<NotificationFeed>({
    fetch: loadNotificationsAction,
    userIdFrom: feedViewerId,
    refreshMs: BACKGROUND_REFRESH_MS,
  });

  const unreadCount = data?.unreadCount ?? 0;
  if (unreadCount === 0) return null;

  return (
    <span
      aria-label={t("notifications.bellWithCount", { count: unreadCount })}
      className={cn(
        "grid min-w-4.5 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4.5 font-bold text-primary-foreground tabular-nums",
        className,
      )}
    >
      {unreadCount > 99 ? "99+" : unreadCount}
    </span>
  );
}
