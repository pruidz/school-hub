"use client";

/**
 * Live notification feed for the signed-in user.
 *
 * Same shape as `useRealtimeMessages`: the socket says "something changed",
 * the Server Action says what. The feed is at most a couple of dozen rows, so
 * re-reading the whole thing is cheaper than reconciling a WAL payload, and it
 * means a mark-read from a second device shows up here too.
 *
 * Subscribed to INSERT and UPDATE. UPDATE matters twice over: the collapse in
 * `public.enqueue_notification()` bumps an existing unread row instead of
 * adding one, and marking a row read from another tab is an UPDATE as well.
 * DELETE is deliberately not subscribed to — see 0009 section 1 for why the
 * old record of a delete is not something to build on.
 */

import * as React from "react";

import type { RealtimeStatus } from "./status";
import { useRealtimeChannel } from "./use-realtime-channel";

export type UseRealtimeNotificationsOptions<T> = {
  /** Server Action returning the current feed, or `null` if not signed in. */
  fetch: () => Promise<T | null>;
  /**
   * Pulls the viewer's id out of the feed. Nothing subscribes until this
   * returns one — the hook learns who it is from its first read, which keeps
   * the caller free of a session prop it would otherwise have to thread
   * through the shells.
   */
  userIdFrom: (data: T) => string | null;
  /** Refresh even without a socket event, e.g. every minute. 0 disables. */
  refreshMs?: number;
};

export type UseRealtimeNotificationsResult<T> = {
  data: T | null;
  loading: boolean;
  status: RealtimeStatus;
  refresh: () => void;
};

export function useRealtimeNotifications<T>({
  fetch,
  userIdFrom,
  refreshMs = 0,
}: UseRealtimeNotificationsOptions<T>): UseRealtimeNotificationsResult<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchRef = React.useRef(fetch);
  React.useEffect(() => {
    fetchRef.current = fetch;
  });

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
      againRef.current = true;
      return;
    }
    inFlightRef.current = true;

    void (async () => {
      try {
        // Loops rather than recursing, so this callback stays memoizable.
        do {
          againRef.current = false;
          const next = await fetchRef.current();
          if (!aliveRef.current) return;
          if (next !== null) setData(next);
        } while (againRef.current && aliveRef.current);
      } catch {
        // Keep whatever is on screen. The bell is not worth an error state.
      } finally {
        if (aliveRef.current) setLoading(false);
        inFlightRef.current = false;
      }
    })();
  }, []);

  // First load. Runs whether or not realtime ever connects, which is what makes
  // the bell work on a locked-down network.
  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (refreshMs <= 0) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, refreshMs);
    return () => clearInterval(timer);
  }, [refresh, refreshMs]);

  // Derived from the feed, so the caller never has to know the session.
  const userId = data ? userIdFrom(data) : null;

  const status = useRealtimeChannel({
    channelName: userId ? `notifications:${userId}` : null,
    table: "notifications",
    filter: userId ? `user_id=eq.${userId}` : undefined,
    events: ["INSERT", "UPDATE"],
    onChange: refresh,
    onResync: refresh,
  });

  return { data, loading, status, refresh };
}
