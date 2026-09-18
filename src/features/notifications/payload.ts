/**
 * Turning a `notifications` row into something renderable.
 *
 * `payload` is jsonb written by a database trigger, but it is still untyped
 * data as far as TypeScript is concerned, and rows written by an older version
 * of 0009 will outlive any given deploy. Everything is therefore read
 * defensively: a missing field renders as a blank, never as `undefined` in the
 * UI and never as a crash.
 */

import type { Json } from "@/lib/db.types";
import { ka, t } from "@/lib/i18n/ka";

import {
  isNotificationType,
  type NotificationAudience,
  type NotificationItem,
  type NotificationPayload,
  type NotificationType,
} from "./types";

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readCount(source: Record<string, unknown>): number {
  const value = source["count"];
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(Math.floor(parsed), 999);
}

export function parseNotificationPayload(raw: Json): NotificationPayload {
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const audience = readString(source, "audience");

  return {
    assignmentId: readString(source, "assignment_id"),
    childId: readString(source, "child_id"),
    childName: readString(source, "child_name"),
    subjectName: readString(source, "subject_name"),
    title: readString(source, "title"),
    preview: readString(source, "preview"),
    actorName: readString(source, "actor_name"),
    audience: (audience === "child" ? "child" : "parent") as NotificationAudience,
    count: readCount(source),
  };
}

/**
 * Where the row points. Derived from the audience the trigger stamped, so the
 * route table stays here and SQL never has to know about `/parent` or `/kid`.
 * `null` when the row is too old or too broken to link anywhere — the list
 * renders it as plain text rather than a dead link.
 */
export function notificationHref(item: NotificationItem): string | null {
  const { assignmentId, audience } = item.payload;
  if (!assignmentId) return null;

  if (audience === "child") return `/kid/assignments/${assignmentId}`;

  // A parent reviewing submitted work lands on the review screen; anything
  // else (a message on work that is not in review) lands on the assignment.
  return item.type === "assignment_submitted"
    ? `/parent/review/${assignmentId}`
    : `/parent/assignments/${assignmentId}`;
}

/** One-line heading for the row, already in Georgian. */
export function notificationTitle(item: NotificationItem): string {
  const { childName, count, actorName } = item.payload;
  const who = childName ?? ka.messages.unknownAuthor;

  switch (item.type) {
    case "assignment_submitted":
      return t("notifications.submittedTitle", { child: who });
    case "assignment_approved":
      return ka.notifications.approvedTitle;
    case "assignment_approved_by_helper":
      return t("notifications.approvedByHelperTitle", {
        actor: actorName ?? ka.messages.unknownAuthor,
        child: who,
      });
    case "assignment_redo_by_helper":
      return t("notifications.redoByHelperTitle", {
        actor: actorName ?? ka.messages.unknownAuthor,
        child: who,
      });
    case "assignment_redo":
      return ka.notifications.redoTitle;
    case "message_posted":
      return count > 1
        ? t("notifications.messagesTitle", { count })
        : t("notifications.messageTitle", {
            author: actorName ?? who,
          });
  }
}

/** Second line: what it is about. */
export function notificationSubtitle(item: NotificationItem): string {
  const { subjectName, title, preview } = item.payload;

  if (item.type === "message_posted" && preview) return preview;
  if (item.type === "assignment_redo" && preview) return preview;
  if (item.type === "assignment_redo_by_helper" && preview) return preview;

  const parts = [subjectName, title].filter(
    (part): part is string => Boolean(part),
  );
  return parts.join(" · ");
}

export function notificationTypeOf(value: string): NotificationType | null {
  return isNotificationType(value) ? value : null;
}
