/**
 * The notification contract between `supabase/migrations/0009_*.sql` and the
 * bell. No `server-only` marker: the bell is a Client Component and parses the
 * same payload the trigger wrote.
 *
 * Everything the list renders is denormalised into `payload` by the trigger, so
 * a full bell costs exactly one SELECT on `notifications` and nothing else.
 * The trade is staleness: renaming a subject does not rewrite the notifications
 * that already mention it. For a row that exists to say "look at this now",
 * that is the right way round.
 */

/** Keep in step with the `type` values written by 0009's triggers. */
export const NOTIFICATION_TYPES = [
  "assignment_submitted",
  "assignment_approved",
  "assignment_redo",
  // 0011: a helper with review rights decided; the parents are told too.
  "assignment_approved_by_helper",
  "assignment_redo_by_helper",
  "message_posted",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function isNotificationType(value: unknown): value is NotificationType {
  return (
    typeof value === "string" &&
    (NOTIFICATION_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Which shell the recipient is looking at. Written by the trigger because only
 * the trigger knows who the row was addressed to; the link is built from it in
 * `notificationHref`, so routes stay in TypeScript and out of SQL.
 */
export type NotificationAudience = "parent" | "child";

export type NotificationPayload = {
  assignmentId: string | null;
  childId: string | null;
  childName: string | null;
  subjectName: string | null;
  /** Assignment title. */
  title: string | null;
  /** Message body / review comment, already truncated by the trigger. */
  preview: string | null;
  actorName: string | null;
  audience: NotificationAudience;
  /** How many events this row has collapsed. 1 unless a burst was folded in. */
  count: number;
};

export type NotificationItem = {
  id: string;
  type: NotificationType;
  createdAt: string;
  readAt: string | null;
  payload: NotificationPayload;
};

export type NotificationFeed = {
  viewerId: string;
  /** Newest first, capped. */
  items: NotificationItem[];
  /** Unread across the whole table, not just the page above. */
  unreadCount: number;
};

export const EMPTY_FEED: NotificationFeed = {
  viewerId: "",
  items: [],
  unreadCount: 0,
};
