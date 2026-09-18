import "server-only";

/**
 * Getting an already-written `notifications` row onto a phone.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS AND NOT A pg_net TRIGGER
 *
 * The obvious alternative is a Postgres trigger on `notifications` that calls a
 * Next.js route through `pg_net` with a shared secret. It was rejected, for
 * four reasons in descending order of weight:
 *
 *   1. It would not survive the test suite. `supabase/test/` applies every
 *      migration verbatim to a throwaway PostgreSQL with no Supabase
 *      extensions, so a migration that creates a trigger calling `net.
 *      http_post` fails to apply and takes all 243 RLS tests down with it. The
 *      RLS suite is the thing that proves this schema is safe; nothing is worth
 *      breaking it.
 *
 *   2. It needs configuration that does not live in the environment. `pg_net`
 *      has to know the deployment URL and the shared secret, and a trigger
 *      cannot read `process.env` — the values would have to be stored IN the
 *      database (Vault, a GUC, a settings table) and kept in step with every
 *      preview deployment by hand. The brief was "nothing to configure beyond
 *      what is already in the env".
 *
 *   3. It fires on the collapse UPDATE as readily as on the INSERT, so the
 *      "three messages are one notification" rule would have to be re-derived
 *      in SQL anyway.
 *
 *   4. A `pg_net` call is fire-and-forget into `net._http_response`, a table
 *      nobody reads. A failed push would be invisible.
 *
 * So: the Server Actions that cause a notification read the rows back and push
 * them, in `after()`, after the response has been flushed.
 *
 * The cost of that choice, stated plainly: a notification written by something
 * that is not a Server Action — a seed, an admin script, a future Edge Function
 * — is never pushed. `notifications.pushed_at` is a proper outbox marker
 * precisely so that a sweeper could pick those up later without any of this
 * changing.
 *
 * ---------------------------------------------------------------------------
 * WHY IT DOES NOT BUZZ THREE TIMES
 *
 * 0009 collapses a burst into one unread row. The claim below is
 *
 *     update notifications set pushed_at = now()
 *      where payload->>'assignment_id' = $1 and pushed_at is null and recent
 *  returning ...
 *
 * — a single statement, so two actions racing cannot both win the same row, and
 * `pushed_at is null` is the filter, so the second and third messages of a
 * burst find the row already claimed and send nothing. The service worker tags
 * per assignment as a second line of defence: even if two rows for one
 * assignment did go out, the later one replaces the earlier on the lock screen
 * rather than stacking under it.
 *
 * ---------------------------------------------------------------------------
 * WHY IT CANNOT SLOW OR FAIL THE USER'S ACTION
 *
 * `after()` runs the callback once the response has been sent, inside the same
 * invocation — supported on Vercel, no queue, no cron, no second service. The
 * body is wrapped in try/catch on top of that, so a push service having a bad
 * day cannot turn a successfully handed-in piece of homework into an error.
 */

import { after } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  notificationHref,
  notificationSubtitle,
  notificationTitle,
  notificationTypeOf,
  parseNotificationPayload,
} from "../payload";
import type { NotificationItem } from "../types";

import { isPushConfigured } from "./config";
import { pushToUser } from "./send";
import type { PushEnvelope } from "./types";

/**
 * How far back the claim reaches.
 *
 * Generous enough to cover a slow trigger, a retried action or a cold start,
 * short enough that a backlog created while push was misconfigured does not
 * arrive in one burst days later. Rows older than this keep `pushed_at null`
 * and simply never buzz; they are still in the bell, which is where history
 * belongs.
 */
const CLAIM_WINDOW_MS = 10 * 60 * 1000;

/** Row shape of the claim's RETURNING clause. */
type ClaimedRow = {
  id: string;
  user_id: string;
  type: string;
  payload: unknown;
  created_at: string;
};

function envelopeFor(item: NotificationItem): PushEnvelope {
  const title = notificationTitle(item);
  const body = notificationSubtitle(item);
  const href =
    notificationHref(item) ??
    (item.payload.audience === "child" ? "/kid" : "/parent");

  return {
    title,
    body,
    url: href,
    // One tag per assignment, so a burst about one piece of homework replaces
    // itself instead of filling the lock screen. Falls back to the row id when
    // the payload has no assignment — such a row links nowhere either.
    tag: item.payload.assignmentId
      ? `assignment:${item.payload.assignmentId}`
      : `notification:${item.id}`,
    notificationId: item.id,
  };
}

/**
 * Claim and deliver every unpushed notification about `assignmentId`.
 *
 * Deliberately says nothing about who the recipients are: it pushes whatever
 * 0009/0011 addressed to whomever they addressed it to. Never throws.
 */
export async function deliverAssignmentPush(
  assignmentId: string,
): Promise<void> {
  if (!isPushConfigured()) return;

  try {
    const admin = createAdminClient();
    const cutoff = new Date(Date.now() - CLAIM_WINDOW_MS).toISOString();

    // The claim. `.is("pushed_at", null)` is both the filter and the lock:
    // whichever call's UPDATE lands first is the only one whose RETURNING
    // contains the row.
    const { data, error } = await admin
      .from("notifications")
      .update({ pushed_at: new Date().toISOString() })
      .is("pushed_at", null)
      .gte("created_at", cutoff)
      // `payload` is jsonb; `->>` is the only way into it from PostgREST and
      // `filter` is the typed escape hatch for a key that is not a column.
      .filter("payload->>assignment_id", "eq", assignmentId)
      .select("id, user_id, type, payload, created_at");

    if (error) {
      console.error("push.claim failed", { code: error.code });
      return;
    }
    if (!data || data.length === 0) return;

    await Promise.all(
      (data as ClaimedRow[]).map(async (row) => {
        const type = notificationTypeOf(row.type);
        // A type this bundle does not know about is a row written by a newer
        // deploy. The bell skips those; so does the phone.
        if (!type) return;

        const item: NotificationItem = {
          id: row.id,
          type,
          createdAt: row.created_at,
          readAt: null,
          payload: parseNotificationPayload(
            row.payload as Parameters<typeof parseNotificationPayload>[0],
          ),
        };

        await pushToUser(admin, row.user_id, envelopeFor(item));
      }),
    );
  } catch (cause) {
    // Past the response; the user's action already succeeded.
    console.error("push.deliver threw", {
      message: cause instanceof Error ? cause.message : "unknown",
    });
  }
}

/**
 * What the Server Actions call.
 *
 * One line at each site that can cause a notification, placed next to the
 * `revalidate*` call so the two stay together. Returns immediately; the work
 * happens after the response is flushed.
 */
export function schedulePushForAssignment(assignmentId: string): void {
  if (!isPushConfigured()) return;
  after(async () => {
    await deliverAssignmentPush(assignmentId);
  });
}
