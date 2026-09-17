import "server-only";

/**
 * Per-assignment message threads. Plain request/response — no realtime in this
 * phase (CLAUDE.md, "Not in scope for phase 1").
 *
 * "Unread" is derived, not stored on the message: a message counts as unread
 * when it was written by somebody else and the caller has no `message_reads`
 * row for it.
 */

import { getSessionUser } from "@/lib/auth/session";
import type { Attachment } from "@/lib/db.types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

export type ThreadMessage = {
  id: string;
  body: string | null;
  voicePath: string | null;
  createdAt: string;
  authorId: string | null;
  authorName: string | null;
  isMine: boolean;
  isUnread: boolean;
  attachments: Attachment[];
};

export type Thread = {
  assignmentId: string;
  messages: ThreadMessage[];
  unreadCount: number;
  viewerId: string;
};

async function loadAuthorNames(
  supabase: ServerClient,
  authorIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (authorIds.length === 0) return names;

  const { data } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", authorIds);

  for (const row of data ?? []) {
    if (row.display_name) names.set(row.id, row.display_name);
  }
  return names;
}

/**
 * Whole thread for one assignment. Returns `null` when the assignment is not
 * visible to the caller — RLS on `assignments` decides that, not this code.
 */
export async function getAssignmentThread(
  assignmentId: string,
): Promise<Thread | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) return null;

  const { data: rows } = await supabase
    .from("messages")
    .select("id, body, voice_path, created_at, author_id")
    .eq("assignment_id", assignmentId)
    .order("created_at", { ascending: true })
    .limit(500);

  const messages = rows ?? [];
  const messageIds = messages.map((row) => row.id);

  const [attachmentResult, readResult, names] = await Promise.all([
    messageIds.length > 0
      ? supabase
          .from("attachments")
          .select("*")
          .in("message_id", messageIds)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] as Attachment[] }),
    messageIds.length > 0
      ? supabase
          .from("message_reads")
          .select("message_id")
          .eq("user_id", user.id)
          .in("message_id", messageIds)
      : Promise.resolve({ data: [] as { message_id: string }[] }),
    loadAuthorNames(
      supabase,
      Array.from(
        new Set(
          messages
            .map((row) => row.author_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ),
    ),
  ]);

  const readIds = new Set((readResult.data ?? []).map((row) => row.message_id));
  const attachments = attachmentResult.data ?? [];

  const thread: ThreadMessage[] = messages.map((row) => {
    const isMine = row.author_id === user.id;
    return {
      id: row.id,
      body: row.body,
      voicePath: row.voice_path,
      createdAt: row.created_at,
      authorId: row.author_id,
      authorName: row.author_id ? (names.get(row.author_id) ?? null) : null,
      isMine,
      isUnread: !isMine && !readIds.has(row.id),
      attachments: attachments.filter((file) => file.message_id === row.id),
    };
  });

  return {
    assignmentId,
    messages: thread,
    unreadCount: thread.filter((message) => message.isUnread).length,
    viewerId: user.id,
  };
}

/**
 * Unread counts for a list of assignments, in two queries regardless of how
 * many assignments are asked about. Used for the badge in every list.
 */
export async function getUnreadCounts(
  assignmentIds: string[],
): Promise<Record<string, number>> {
  if (assignmentIds.length === 0) return {};

  const user = await getSessionUser();
  if (!user) return {};

  const supabase = await createClient();

  const { data: messages } = await supabase
    .from("messages")
    .select("id, assignment_id, author_id")
    .in("assignment_id", assignmentIds)
    .neq("author_id", user.id)
    .limit(2000);

  const rows = messages ?? [];
  if (rows.length === 0) return {};

  const { data: reads } = await supabase
    .from("message_reads")
    .select("message_id")
    .eq("user_id", user.id)
    .in(
      "message_id",
      rows.map((row) => row.id),
    );

  const readIds = new Set((reads ?? []).map((row) => row.message_id));

  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (!row.assignment_id || readIds.has(row.id)) continue;
    counts[row.assignment_id] = (counts[row.assignment_id] ?? 0) + 1;
  }
  return counts;
}

export type ChatThreadSummary = {
  assignmentId: string;
  title: string;
  subjectName: string | null;
  subjectColor: string | null;
  childName: string | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  unreadCount: number;
};

/**
 * Every assignment that has at least one message, unread first then newest.
 * Scoped by RLS, so a child sees only their own and a parent the whole family.
 */
export async function getChatThreads(): Promise<ChatThreadSummary[]> {
  const user = await getSessionUser();
  if (!user) return [];

  const supabase = await createClient();

  const { data: messages } = await supabase
    .from("messages")
    .select("id, assignment_id, body, voice_path, created_at, author_id, child_id")
    .not("assignment_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1000);

  const rows = messages ?? [];
  if (rows.length === 0) return [];

  const assignmentIds = Array.from(
    new Set(
      rows
        .map((row) => row.assignment_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const [{ data: assignments }, { data: reads }] = await Promise.all([
    supabase
      .from("assignments")
      .select("id, title, subject_id, child_id")
      .in("id", assignmentIds),
    supabase
      .from("message_reads")
      .select("message_id")
      .eq("user_id", user.id)
      .in(
        "message_id",
        rows.map((row) => row.id),
      ),
  ]);

  const assignmentRows = assignments ?? [];
  const readIds = new Set((reads ?? []).map((row) => row.message_id));

  const subjectIds = Array.from(
    new Set(
      assignmentRows
        .map((row) => row.subject_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const childIds = Array.from(
    new Set(assignmentRows.map((row) => row.child_id)),
  );

  const [{ data: subjects }, { data: children }] = await Promise.all([
    subjectIds.length > 0
      ? supabase
          .from("subjects")
          .select("id, name, color")
          .in("id", subjectIds)
      : Promise.resolve({
          data: [] as { id: string; name: string; color: string }[],
        }),
    childIds.length > 0
      ? supabase.from("children").select("id, name").in("id", childIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const subjectById = new Map((subjects ?? []).map((row) => [row.id, row]));
  const childById = new Map((children ?? []).map((row) => [row.id, row]));
  const assignmentById = new Map(assignmentRows.map((row) => [row.id, row]));

  const summaries = new Map<string, ChatThreadSummary>();

  // `rows` is newest-first, so the first row seen for an assignment is its
  // latest message.
  for (const row of rows) {
    const assignmentId = row.assignment_id;
    if (!assignmentId) continue;

    const assignment = assignmentById.get(assignmentId);
    if (!assignment) continue;

    const unread =
      row.author_id !== user.id && !readIds.has(row.id) ? 1 : 0;

    const existing = summaries.get(assignmentId);
    if (existing) {
      existing.unreadCount += unread;
      continue;
    }

    const subject = assignment.subject_id
      ? subjectById.get(assignment.subject_id)
      : undefined;

    summaries.set(assignmentId, {
      assignmentId,
      title: assignment.title,
      subjectName: subject?.name ?? null,
      subjectColor: subject?.color ?? null,
      childName: childById.get(assignment.child_id)?.name ?? null,
      lastMessageAt: row.created_at,
      lastMessagePreview: row.body ?? "",
      unreadCount: unread,
    });
  }

  return Array.from(summaries.values()).sort((a, b) => {
    if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
    return b.lastMessageAt.localeCompare(a.lastMessageAt);
  });
}
