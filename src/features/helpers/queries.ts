import "server-only";

/**
 * Reads for both sides of the helper role.
 *
 * Everything runs on the user-scoped client, so migration 0010 — not this file
 * — decides what comes back. The scope object from `requireHelper()` is used to
 * order and label the results, never as the access check.
 */

import {
  getHelperScope,
  requireHelper,
  requireStrictParent,
  type HelperScope,
} from "@/lib/auth/helper";
import { createClient } from "@/lib/supabase/server";
import type { Attachment, AssignmentStatus } from "@/lib/db.types";

import { helperDb } from "./db";
import {
  parseHelperPermissions,
  type HelperChildLite,
  type HelperInvitation,
  type HelperMember,
  type HelpersPageData,
} from "./types";

/* -------------------------------------------------------------------------- */
/*  parent side — /parent/helpers                                             */
/* -------------------------------------------------------------------------- */

function childrenByIds(
  all: HelperChildLite[],
  ids: string[],
): HelperChildLite[] {
  const wanted = new Set(ids);
  return all.filter((child) => wanted.has(child.id));
}

/**
 * Everything `/parent/helpers` renders, in four queries.
 *
 * Email: `profiles` has no email column and `auth.users` is not readable
 * through RLS, so an accepted helper's address is recovered from the
 * invitation they redeemed. A helper added by hand (SQL, seed) therefore shows
 * no address — the name is what the parent recognises anyway.
 */
export async function getHelpersPageData(): Promise<HelpersPageData> {
  const parent = await requireStrictParent();
  const supabase = await createClient();
  const db = helperDb(supabase);

  const [childRows, memberRows, inviteRows] = await Promise.all([
    supabase
      .from("children")
      .select("id, name, color")
      .order("name", { ascending: true }),
    supabase
      .from("family_members")
      .select("id, user_id, permissions")
      .eq("role", "helper")
      .order("created_at", { ascending: true }),
    db
      .from("helper_invitations")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  const familyChildren: HelperChildLite[] = (childRows.data ?? []).map(
    (row) => ({ id: row.id, name: row.name, color: row.color }),
  );

  const memberships = memberRows.data ?? [];
  const invitations = inviteRows.data ?? [];

  const userIds = memberships.map((row) => row.user_id);
  const nameById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);
    for (const row of data ?? []) {
      if (row.display_name) nameById.set(row.id, row.display_name);
    }
  }

  const emailByUserId = new Map<string, string>();
  for (const invite of invitations) {
    if (invite.accepted_by) emailByUserId.set(invite.accepted_by, invite.email);
  }

  const now = Date.now();

  const members: HelperMember[] = memberships.map((row) => {
    const permissions = parseHelperPermissions(row.permissions);
    return {
      membershipId: row.id,
      userId: row.user_id,
      displayName: nameById.get(row.user_id) ?? "",
      email: emailByUserId.get(row.user_id) ?? null,
      permissions,
      children: childrenByIds(familyChildren, permissions.children),
      isRevoked: permissions.revokedAt !== null,
    };
  });

  const pending: HelperInvitation[] = invitations
    .filter((row) => row.accepted_at === null)
    .map((row) => ({
      id: row.id,
      email: row.email,
      token: row.token,
      canComment: row.can_comment,
      canReview: row.can_review,
      children: childrenByIds(familyChildren, row.child_ids ?? []),
      expiresAt: row.expires_at,
      isExpired: new Date(row.expires_at).getTime() <= now,
      acceptedAt: row.accepted_at,
      revokedAt: row.revoked_at,
    }))
    .filter((row) => row.revokedAt === null);

  return {
    familyId: parent.familyId,
    familyChildren,
    members,
    invitations: pending,
  };
}

/* -------------------------------------------------------------------------- */
/*  helper side — /helper                                                      */
/* -------------------------------------------------------------------------- */

export type HelperChildCard = HelperChildLite & {
  avatarUrl: string | null;
  grade: number | null;
  /** `submitted` assignments waiting for a decision. */
  waitingCount: number;
  openCount: number;
};

export type HelperQueueItem = {
  assignmentId: string;
  childId: string;
  childName: string;
  childColor: string;
  title: string;
  subjectName: string | null;
  status: AssignmentStatus;
  dueDate: string | null;
  submittedAt: string | null;
};

/** The helper's children, straight out of the `helper_children` view. */
export async function getHelperChildren(): Promise<HelperChildCard[]> {
  const scope = await getHelperScope();
  if (!scope) return [];

  const supabase = await createClient();
  const db = helperDb(supabase);

  const [childRows, assignmentRows] = await Promise.all([
    db
      .from("helper_children")
      .select("id, name, color, avatar_url, grade, is_active")
      .order("name", { ascending: true }),
    supabase.from("assignments").select("child_id, status"),
  ]);

  const counts = new Map<string, { waiting: number; open: number }>();
  for (const row of assignmentRows.data ?? []) {
    const entry = counts.get(row.child_id) ?? { waiting: 0, open: 0 };
    if (row.status === "submitted") entry.waiting += 1;
    if (row.status !== "approved") entry.open += 1;
    counts.set(row.child_id, entry);
  }

  return (childRows.data ?? [])
    .filter((row) => row.is_active)
    .map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      avatarUrl: row.avatar_url,
      grade: row.grade,
      waitingCount: counts.get(row.id)?.waiting ?? 0,
      openCount: counts.get(row.id)?.open ?? 0,
    }));
}

type AssignmentListRow = {
  id: string;
  child_id: string;
  title: string;
  status: AssignmentStatus;
  due_date: string | null;
  submitted_at: string | null;
  subject_id: string | null;
};

async function decorate(
  rows: AssignmentListRow[],
  children: HelperChildCard[],
): Promise<HelperQueueItem[]> {
  const supabase = await createClient();

  const subjectIds = Array.from(
    new Set(rows.map((row) => row.subject_id).filter((id): id is string => !!id)),
  );
  const subjectName = new Map<string, string>();
  if (subjectIds.length > 0) {
    const { data } = await supabase
      .from("subjects")
      .select("id, name")
      .in("id", subjectIds);
    for (const row of data ?? []) subjectName.set(row.id, row.name);
  }

  const childById = new Map(children.map((child) => [child.id, child]));

  return rows.map((row) => {
    const child = childById.get(row.child_id);
    return {
      assignmentId: row.id,
      childId: row.child_id,
      childName: child?.name ?? "",
      childColor: child?.color ?? "#64748b",
      title: row.title,
      subjectName: row.subject_id
        ? (subjectName.get(row.subject_id) ?? null)
        : null,
      status: row.status,
      dueDate: row.due_date,
      submittedAt: row.submitted_at,
    };
  });
}

export type HelperHomeData = {
  children: HelperChildCard[];
  waiting: HelperQueueItem[];
  recent: HelperQueueItem[];
  scope: HelperScope;
};

/**
 * `/helper` in one call: the children, what is waiting for a decision, and the
 * rest of the recent work so a view-only helper still has something to open.
 */
export async function getHelperHome(
  childFilter?: string | null,
): Promise<HelperHomeData> {
  const helper = await requireHelper();
  const children = await getHelperChildren();
  const supabase = await createClient();

  const visible =
    childFilter && helper.scope.childIds.includes(childFilter)
      ? [childFilter]
      : children.map((child) => child.id);

  if (visible.length === 0) {
    return { children, waiting: [], recent: [], scope: helper.scope };
  }

  const columns = "id, child_id, title, status, due_date, submitted_at, subject_id";

  const [waitingRows, recentRows] = await Promise.all([
    supabase
      .from("assignments")
      .select(columns)
      .in("child_id", visible)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: true })
      .limit(50),
    supabase
      .from("assignments")
      .select(columns)
      .in("child_id", visible)
      .neq("status", "submitted")
      .order("due_date", { ascending: false, nullsFirst: false })
      .limit(50),
  ]);

  const [waiting, recent] = await Promise.all([
    decorate(waitingRows.data ?? [], children),
    decorate(recentRows.data ?? [], children),
  ]);

  return { children, waiting, recent, scope: helper.scope };
}

/* -------------------------------------------------------------------------- */
/*  helper side — one assignment                                              */
/* -------------------------------------------------------------------------- */

export type HelperAssignmentDetail = {
  id: string;
  childId: string;
  childName: string;
  title: string;
  description: string | null;
  sourceRef: string | null;
  status: AssignmentStatus;
  dueDate: string | null;
  selfRating: number | null;
  minutesSpent: number | null;
  difficultyNote: string | null;
  reviewComment: string | null;
  redoCount: number;
  subjectName: string | null;
  taskPhotos: Attachment[];
  solutionPhotos: Attachment[];
};

/**
 * One assignment, or `null`.
 *
 * `null` covers "does not exist", "another family" and "a child this helper was
 * not given" alike — RLS returns nothing in all three cases and the caller must
 * not be able to tell them apart.
 */
export async function getHelperAssignment(
  assignmentId: string,
): Promise<HelperAssignmentDetail | null> {
  const scope = await getHelperScope();
  if (!scope) return null;

  const supabase = await createClient();
  const db = helperDb(supabase);

  const { data: assignment } = await supabase
    .from("assignments")
    // One string literal, not a concatenation: supabase-js infers the row type
    // from the literal, and a `+` turns it into plain `string`.
    .select(
      "id, child_id, title, description, source_ref, status, due_date, self_rating, minutes_spent, difficulty_note, review_comment, redo_count, subject_id",
    )
    .eq("id", assignmentId)
    .maybeSingle();

  if (!assignment) return null;

  // Belt and braces: the row already came back through RLS, but an explicit
  // ownership check keeps the invariant visible at the call site.
  if (!scope.childIds.includes(assignment.child_id)) return null;

  const [childRow, subjectRow, attachmentRows] = await Promise.all([
    db
      .from("helper_children")
      .select("name")
      .eq("id", assignment.child_id)
      .maybeSingle(),
    assignment.subject_id
      ? supabase
          .from("subjects")
          .select("name")
          .eq("id", assignment.subject_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("attachments")
      .select("*")
      .eq("assignment_id", assignmentId)
      .order("sort_order", { ascending: true }),
  ]);

  const attachments = attachmentRows.data ?? [];

  return {
    id: assignment.id,
    childId: assignment.child_id,
    childName: childRow.data?.name ?? "",
    title: assignment.title,
    description: assignment.description,
    sourceRef: assignment.source_ref,
    status: assignment.status,
    dueDate: assignment.due_date,
    selfRating: assignment.self_rating,
    minutesSpent: assignment.minutes_spent,
    difficultyNote: assignment.difficulty_note,
    reviewComment: assignment.review_comment,
    redoCount: assignment.redo_count,
    subjectName: subjectRow.data?.name ?? null,
    taskPhotos: attachments.filter((file) => file.kind === "task_source"),
    solutionPhotos: attachments.filter((file) => file.kind === "solution"),
  };
}
