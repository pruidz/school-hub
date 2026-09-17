import "server-only";

/**
 * Ownership checks shared by the assignment, attachment and message actions.
 *
 * RLS already scopes every query to the caller's family, so a row coming back
 * is itself proof of access. These helpers make that explicit — an action must
 * never write against an id it received from the browser without first reading
 * the row back through the user-scoped client and confirming the child.
 */

import {
  requireChild,
  requireParent,
  getSessionUser,
  type ChildSession,
  type ParentSession,
} from "@/lib/auth/session";
import type { AssignmentStatus } from "@/lib/db.types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

export type Caller =
  | { role: "parent"; session: ParentSession }
  | { role: "child"; session: ChildSession };

/**
 * The signed-in user as a parent or a child, whichever they are. Used by the
 * actions both roles share (attachments, messages). Role-specific actions call
 * `requireParent()` / `requireChild()` directly instead.
 */
export async function requireCaller(): Promise<Caller> {
  const user = await getSessionUser();
  if (user?.role === "child") {
    return { role: "child", session: await requireChild() };
  }
  return { role: "parent", session: await requireParent() };
}

export type AssignmentAccess = {
  id: string;
  childId: string;
  status: AssignmentStatus;
  subjectId: string | null;
  lessonId: string | null;
  redoCount: number;
  reviewComment: string | null;
};

const ASSIGNMENT_ACCESS_COLUMNS =
  "id, child_id, status, subject_id, lesson_id, redo_count, review_comment";

function toAccess(row: {
  id: string;
  child_id: string;
  status: AssignmentStatus;
  subject_id: string | null;
  lesson_id: string | null;
  redo_count: number;
  review_comment: string | null;
}): AssignmentAccess {
  return {
    id: row.id,
    childId: row.child_id,
    status: row.status,
    subjectId: row.subject_id,
    lessonId: row.lesson_id,
    redoCount: row.redo_count,
    reviewComment: row.review_comment,
  };
}

/**
 * Read an assignment the caller is allowed to touch. Returns `null` when the
 * id does not exist, belongs to another family, or (for a child) to a sibling.
 */
export async function loadAssignment(
  supabase: ServerClient,
  caller: Caller,
  assignmentId: string,
): Promise<AssignmentAccess | null> {
  const { data } = await supabase
    .from("assignments")
    .select(ASSIGNMENT_ACCESS_COLUMNS)
    .eq("id", assignmentId)
    .maybeSingle();

  if (!data) return null;

  const access = toAccess(data);

  if (caller.role === "child") {
    return access.childId === caller.session.childId ? access : null;
  }
  return (await childInFamily(supabase, caller.session, access.childId))
    ? access
    : null;
}

/** Is `childId` one of the parent's own children? */
export async function childInFamily(
  supabase: ServerClient,
  parent: ParentSession,
  childId: string,
): Promise<boolean> {
  if (!parent.familyId) return false;

  const { data } = await supabase
    .from("children")
    .select("id, family_id")
    .eq("id", childId)
    .maybeSingle();

  return Boolean(data && data.family_id === parent.familyId);
}

/** Every child id in the parent's family, oldest-name first. */
export async function familyChildIds(
  supabase: ServerClient,
  parent: ParentSession,
): Promise<string[]> {
  if (!parent.familyId) return [];
  const { data } = await supabase
    .from("children")
    .select("id")
    .eq("family_id", parent.familyId);
  return (data ?? []).map((row) => row.id);
}

/** Confirm a lesson belongs to `childId` and the caller may reach it. */
export async function lessonBelongsToChild(
  supabase: ServerClient,
  caller: Caller,
  lessonId: string,
  childId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("lessons")
    .select("id, child_id")
    .eq("id", lessonId)
    .maybeSingle();

  if (!data || data.child_id !== childId) return false;

  if (caller.role === "child") return childId === caller.session.childId;
  return childInFamily(supabase, caller.session, childId);
}

/** Confirm a subject belongs to `childId`. */
export async function subjectBelongsToChild(
  supabase: ServerClient,
  subjectId: string,
  childId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("subjects")
    .select("id, child_id")
    .eq("id", subjectId)
    .maybeSingle();
  return Boolean(data && data.child_id === childId);
}

/** Confirm a topic hangs off a subject that belongs to `childId`. */
export async function topicBelongsToChild(
  supabase: ServerClient,
  topicId: string,
  childId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("topics")
    .select("id, subject_id")
    .eq("id", topicId)
    .maybeSingle();
  if (!data?.subject_id) return false;
  return subjectBelongsToChild(supabase, data.subject_id, childId);
}

export async function serverClient(): Promise<ServerClient> {
  return createClient();
}
