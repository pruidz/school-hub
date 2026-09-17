import "server-only";

/**
 * Read side of the assignments feature. Everything here runs on the
 * user-scoped Supabase client, so RLS is the access control and these
 * functions only add shape.
 *
 * PostgREST resource embedding is deliberately avoided: `db.types.ts` is
 * hand-written for now and its `Relationships` blocks are not exercised, so
 * embedded selects would infer as `any`-ish. Two small parallel queries plus a
 * join in TypeScript is cheaper to get right and fully typed.
 */

import { requireChild, requireParent } from "@/lib/auth/session";
import type {
  Assignment,
  AssignmentStatus,
  Attachment,
  ChildUiMode,
} from "@/lib/db.types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

import { todayString, weekBounds } from "./dates";

export type SubjectLite = {
  id: string;
  name: string;
  color: string;
  childId: string;
};

export type ChildLite = {
  id: string;
  name: string;
  color: string;
  grade: number | null;
  uiMode: ChildUiMode;
};

const OPEN_STATUSES: AssignmentStatus[] = ["assigned", "in_progress", "redo"];

/* -------------------------------------------------------------------------- */
/*  small shared reads                                                         */
/* -------------------------------------------------------------------------- */

export async function listFamilyChildren(
  supabase: ServerClient,
  familyId: string | null,
): Promise<ChildLite[]> {
  if (!familyId) return [];
  const { data } = await supabase
    .from("children")
    .select("id, name, color, grade, ui_mode, is_active")
    .eq("family_id", familyId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    grade: row.grade,
    uiMode: row.ui_mode,
  }));
}

export async function listSubjects(
  supabase: ServerClient,
  childIds: string[],
): Promise<SubjectLite[]> {
  if (childIds.length === 0) return [];
  const { data } = await supabase
    .from("subjects")
    .select("id, name, color, child_id")
    .in("child_id", childIds)
    .order("sort_order", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    childId: row.child_id,
  }));
}

export function indexById<T extends { id: string }>(
  rows: T[],
): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

async function listAttachments(
  supabase: ServerClient,
  assignmentIds: string[],
): Promise<Attachment[]> {
  if (assignmentIds.length === 0) return [];
  const { data } = await supabase
    .from("attachments")
    .select("*")
    .in("assignment_id", assignmentIds)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  return data ?? [];
}

/* -------------------------------------------------------------------------- */
/*  parent — inbox                                                             */
/* -------------------------------------------------------------------------- */

export type InboxItem = {
  assignment: Assignment;
  child: ChildLite | null;
  subject: SubjectLite | null;
  thumbnailPath: string | null;
  solutionCount: number;
};

export type InboxData = {
  items: InboxItem[];
  children: ChildLite[];
  subjects: SubjectLite[];
};

export async function getInbox(filters: {
  childId?: string | null;
  subjectId?: string | null;
}): Promise<InboxData> {
  const parent = await requireParent();
  const supabase = await createClient();

  const children = await listFamilyChildren(supabase, parent.familyId);
  const childIds = children.map((child) => child.id);
  if (childIds.length === 0) {
    return { items: [], children: [], subjects: [] };
  }

  const subjects = await listSubjects(supabase, childIds);

  // A client-supplied id is only ever used after it has been matched against
  // the family's own ids.
  const scopedChildIds =
    filters.childId && childIds.includes(filters.childId)
      ? [filters.childId]
      : childIds;
  const scopedSubjectId =
    filters.subjectId && subjects.some((s) => s.id === filters.subjectId)
      ? filters.subjectId
      : null;

  let query = supabase
    .from("assignments")
    .select("*")
    .eq("status", "submitted")
    .in("child_id", scopedChildIds)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (scopedSubjectId) query = query.eq("subject_id", scopedSubjectId);

  const { data: assignments } = await query;
  const rows = assignments ?? [];

  const attachments = await listAttachments(
    supabase,
    rows.map((row) => row.id),
  );

  const childById = indexById(children);
  const subjectById = indexById(subjects);

  const items: InboxItem[] = rows.map((assignment) => {
    const solutions = attachments.filter(
      (file) =>
        file.assignment_id === assignment.id && file.kind === "solution",
    );
    return {
      assignment,
      child: childById.get(assignment.child_id) ?? null,
      subject: assignment.subject_id
        ? (subjectById.get(assignment.subject_id) ?? null)
        : null,
      thumbnailPath: solutions[0]?.storage_path ?? null,
      solutionCount: solutions.length,
    };
  });

  return { items, children, subjects };
}

/* -------------------------------------------------------------------------- */
/*  parent — review                                                            */
/* -------------------------------------------------------------------------- */

export type ReviewComment = {
  id: string;
  comment: string;
  createdAt: string;
  fromStatus: AssignmentStatus | null;
  toStatus: AssignmentStatus;
  actorName: string | null;
};

export type ReviewBundle = {
  assignment: Assignment;
  child: ChildLite;
  subject: SubjectLite | null;
  topicName: string | null;
  taskAttachments: Attachment[];
  solutionAttachments: Attachment[];
  previousComments: ReviewComment[];
  queueNextId: string | null;
  queueRemaining: number;
};

export async function getReviewBundle(
  assignmentId: string,
): Promise<ReviewBundle | null> {
  const parent = await requireParent();
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) return null;

  const children = await listFamilyChildren(supabase, parent.familyId);
  const child = children.find((row) => row.id === assignment.child_id);
  if (!child) return null;

  const subjects = await listSubjects(supabase, [child.id]);
  const subject = assignment.subject_id
    ? (subjects.find((row) => row.id === assignment.subject_id) ?? null)
    : null;

  const [attachments, events, queue, topic] = await Promise.all([
    listAttachments(supabase, [assignment.id]),
    supabase
      .from("assignment_events")
      .select("id, comment, created_at, from_status, to_status, actor_id")
      .eq("assignment_id", assignment.id)
      .not("comment", "is", null)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("assignments")
      .select("id")
      .eq("status", "submitted")
      .in(
        "child_id",
        children.map((row) => row.id),
      )
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .limit(200),
    assignment.topic_id
      ? supabase
          .from("topics")
          .select("id, name")
          .eq("id", assignment.topic_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const eventRows = events.data ?? [];
  const actorIds = Array.from(
    new Set(
      eventRows
        .map((row) => row.actor_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const actorNames = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", actorIds);
    for (const profile of profiles ?? []) {
      if (profile.display_name) actorNames.set(profile.id, profile.display_name);
    }
  }

  const queueIds = (queue.data ?? []).map((row) => row.id);
  const currentIndex = queueIds.indexOf(assignment.id);
  const queueNextId =
    (currentIndex >= 0 ? queueIds[currentIndex + 1] : undefined) ??
    queueIds.find((id) => id !== assignment.id) ??
    null;

  return {
    assignment,
    child,
    subject,
    topicName: topic.data?.name ?? null,
    taskAttachments: attachments.filter((file) => file.kind === "task_source"),
    solutionAttachments: attachments.filter((file) => file.kind === "solution"),
    previousComments: eventRows
      .filter((row): row is typeof row & { comment: string } =>
        Boolean(row.comment),
      )
      .map((row) => ({
        id: row.id,
        comment: row.comment,
        createdAt: row.created_at,
        fromStatus: row.from_status,
        toStatus: row.to_status,
        actorName: row.actor_id
          ? (actorNames.get(row.actor_id) ?? null)
          : null,
      })),
    queueNextId,
    queueRemaining: queueIds.filter((id) => id !== assignment.id).length,
  };
}

/* -------------------------------------------------------------------------- */
/*  parent — assignment list / editor                                          */
/* -------------------------------------------------------------------------- */

export type ParentAssignmentItem = {
  assignment: Assignment;
  child: ChildLite | null;
  subject: SubjectLite | null;
};

export type ParentAssignmentList = {
  items: ParentAssignmentItem[];
  children: ChildLite[];
  subjects: SubjectLite[];
};

export async function getParentAssignments(filters: {
  childId?: string | null;
  subjectId?: string | null;
  status?: AssignmentStatus | null;
  due?: "today" | "week" | "overdue" | null;
}): Promise<ParentAssignmentList> {
  const parent = await requireParent();
  const supabase = await createClient();

  const children = await listFamilyChildren(supabase, parent.familyId);
  const childIds = children.map((child) => child.id);
  if (childIds.length === 0) return { items: [], children: [], subjects: [] };

  const subjects = await listSubjects(supabase, childIds);

  const scopedChildIds =
    filters.childId && childIds.includes(filters.childId)
      ? [filters.childId]
      : childIds;

  let query = supabase
    .from("assignments")
    .select("*")
    .in("child_id", scopedChildIds)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(300);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.subjectId && subjects.some((s) => s.id === filters.subjectId)) {
    query = query.eq("subject_id", filters.subjectId);
  }

  const today = todayString();
  if (filters.due === "today") {
    query = query.eq("due_date", today);
  } else if (filters.due === "week") {
    const [from, to] = weekBounds();
    query = query.gte("due_date", from).lte("due_date", to);
  } else if (filters.due === "overdue") {
    query = query.lt("due_date", today).in("status", OPEN_STATUSES);
  }

  const { data } = await query;
  const childById = indexById(children);
  const subjectById = indexById(subjects);

  return {
    items: (data ?? []).map((assignment) => ({
      assignment,
      child: childById.get(assignment.child_id) ?? null,
      subject: assignment.subject_id
        ? (subjectById.get(assignment.subject_id) ?? null)
        : null,
    })),
    children,
    subjects,
  };
}

export type AssignmentEditorData = {
  assignment: Assignment | null;
  children: ChildLite[];
  subjects: SubjectLite[];
  topics: { id: string; name: string; subjectId: string }[];
  lessons: { id: string; date: string; topic: string | null; childId: string }[];
};

export async function getAssignmentEditorData(
  assignmentId: string | null,
): Promise<AssignmentEditorData | null> {
  const parent = await requireParent();
  const supabase = await createClient();

  const children = await listFamilyChildren(supabase, parent.familyId);
  const childIds = children.map((child) => child.id);
  const subjects = await listSubjects(supabase, childIds);

  let assignment: Assignment | null = null;
  if (assignmentId) {
    const { data } = await supabase
      .from("assignments")
      .select("*")
      .eq("id", assignmentId)
      .maybeSingle();
    if (!data || !childIds.includes(data.child_id)) return null;
    assignment = data;
  }

  const subjectIds = subjects.map((subject) => subject.id);
  const [topicRows, lessonRows] = await Promise.all([
    subjectIds.length > 0
      ? supabase
          .from("topics")
          .select("id, name, subject_id")
          .in("subject_id", subjectIds)
          .order("name", { ascending: true })
      : Promise.resolve({ data: [] as { id: string; name: string; subject_id: string }[] }),
    childIds.length > 0
      ? supabase
          .from("lessons")
          .select("id, date, topic, child_id")
          .in("child_id", childIds)
          .order("date", { ascending: false })
          .limit(60)
      : Promise.resolve({
          data: [] as {
            id: string;
            date: string;
            topic: string | null;
            child_id: string;
          }[],
        }),
  ]);

  return {
    assignment,
    children,
    subjects,
    topics: (topicRows.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      subjectId: row.subject_id,
    })),
    lessons: (lessonRows.data ?? []).map((row) => ({
      id: row.id,
      date: row.date,
      topic: row.topic,
      childId: row.child_id,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/*  child                                                                      */
/* -------------------------------------------------------------------------- */

export type KidAssignmentItem = {
  assignment: Assignment;
  subject: SubjectLite | null;
};

export type KidAssignmentList = {
  items: KidAssignmentItem[];
  subjects: SubjectLite[];
  uiMode: ChildUiMode;
};

export async function getKidAssignments(): Promise<KidAssignmentList> {
  const child = await requireChild();
  const supabase = await createClient();

  const [{ data: assignments }, subjects, { data: childRow }] =
    await Promise.all([
      supabase
        .from("assignments")
        .select("*")
        .eq("child_id", child.childId)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(200),
      listSubjects(supabase, [child.childId]),
      supabase
        .from("children")
        .select("id, ui_mode")
        .eq("id", child.childId)
        .maybeSingle(),
    ]);

  const subjectById = indexById(subjects);

  return {
    items: (assignments ?? []).map((assignment) => ({
      assignment,
      subject: assignment.subject_id
        ? (subjectById.get(assignment.subject_id) ?? null)
        : null,
    })),
    subjects,
    uiMode: childRow?.ui_mode ?? "full",
  };
}

export type KidAssignmentDetail = {
  assignment: Assignment;
  subject: SubjectLite | null;
  topicName: string | null;
  taskAttachments: Attachment[];
  solutionAttachments: Attachment[];
  latestRedoComment: string | null;
  uiMode: ChildUiMode;
  childId: string;
};

export async function getKidAssignmentDetail(
  assignmentId: string,
): Promise<KidAssignmentDetail | null> {
  const child = await requireChild();
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle();

  if (!assignment || assignment.child_id !== child.childId) return null;

  const [attachments, subjects, { data: childRow }, topic, redoEvent] =
    await Promise.all([
      listAttachments(supabase, [assignment.id]),
      listSubjects(supabase, [child.childId]),
      supabase
        .from("children")
        .select("id, ui_mode")
        .eq("id", child.childId)
        .maybeSingle(),
      assignment.topic_id
        ? supabase
            .from("topics")
            .select("id, name")
            .eq("id", assignment.topic_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("assignment_events")
        .select("comment, created_at, to_status")
        .eq("assignment_id", assignment.id)
        .eq("to_status", "redo")
        .not("comment", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const subjectById = indexById(subjects);

  return {
    assignment,
    subject: assignment.subject_id
      ? (subjectById.get(assignment.subject_id) ?? null)
      : null,
    topicName: topic.data?.name ?? null,
    taskAttachments: attachments.filter((file) => file.kind === "task_source"),
    solutionAttachments: attachments.filter((file) => file.kind === "solution"),
    latestRedoComment:
      assignment.status === "redo"
        ? (assignment.review_comment ?? redoEvent.data?.comment ?? null)
        : null,
    uiMode: childRow?.ui_mode ?? "full",
    childId: child.childId,
  };
}

/* -------------------------------------------------------------------------- */
/*  parent — dashboard (P1)                                                    */
/* -------------------------------------------------------------------------- */

export type ChildDashboard = {
  child: ChildLite;
  todayLessons: number;
  dueToday: number;
  awaitingReview: number;
  weekTotal: number;
  weekApproved: number;
  weekPercent: number | null;
  weekRedo: number;
  /** Seven Monday-to-Sunday buckets of approved work, for the sparkline. */
  weekSpark: number[];
};

export async function getDashboard(): Promise<{
  cards: ChildDashboard[];
}> {
  const parent = await requireParent();
  const supabase = await createClient();

  const children = await listFamilyChildren(supabase, parent.familyId);
  if (children.length === 0) return { cards: [] };

  const childIds = children.map((child) => child.id);
  const today = todayString();
  const [weekFrom, weekTo] = weekBounds();

  const [lessons, assignments, redoEvents] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, child_id")
      .in("child_id", childIds)
      .eq("date", today),
    supabase
      .from("assignments")
      .select("id, child_id, status, due_date, reviewed_at")
      .in("child_id", childIds)
      .or(
        `status.eq.submitted,and(due_date.gte.${weekFrom},due_date.lte.${weekTo})`,
      ),
    supabase
      .from("assignment_events")
      .select("assignment_id, created_at")
      .eq("to_status", "redo")
      .gte("created_at", `${weekFrom}T00:00:00Z`),
  ]);

  const assignmentRows = assignments.data ?? [];
  const childOfAssignment = new Map(
    assignmentRows.map((row) => [row.id, row.child_id]),
  );

  // assignment_events carries no child_id, so resolve the ones this week's
  // redo events point at and are not already in the set above.
  const redoRows = redoEvents.data ?? [];
  const unknownIds = Array.from(
    new Set(
      redoRows
        .map((row) => row.assignment_id)
        .filter((id) => !childOfAssignment.has(id)),
    ),
  );
  if (unknownIds.length > 0) {
    const { data: extra } = await supabase
      .from("assignments")
      .select("id, child_id")
      .in("id", unknownIds);
    for (const row of extra ?? []) {
      childOfAssignment.set(row.id, row.child_id);
    }
  }

  const cards = children.map<ChildDashboard>((child) => {
    const mine = assignmentRows.filter((row) => row.child_id === child.id);
    const inWeek = mine.filter(
      (row) => row.due_date && row.due_date >= weekFrom && row.due_date <= weekTo,
    );
    const weekApproved = inWeek.filter(
      (row) => row.status === "approved",
    ).length;

    const spark = Array.from({ length: 7 }, (_, index) => {
      const day = addDayString(weekFrom, index);
      return inWeek.filter(
        (row) => row.due_date === day && row.status === "approved",
      ).length;
    });

    return {
      child,
      todayLessons: (lessons.data ?? []).filter(
        (row) => row.child_id === child.id,
      ).length,
      dueToday: mine.filter(
        (row) =>
          row.due_date === today &&
          (OPEN_STATUSES as string[]).includes(row.status),
      ).length,
      awaitingReview: mine.filter((row) => row.status === "submitted").length,
      weekTotal: inWeek.length,
      weekApproved,
      weekPercent:
        inWeek.length === 0
          ? null
          : Math.round((weekApproved / inWeek.length) * 100),
      weekRedo: redoRows.filter(
        (row) => childOfAssignment.get(row.assignment_id) === child.id,
      ).length,
      weekSpark: spark,
    };
  });

  return { cards };
}

function addDayString(base: string, days: number): string {
  const date = new Date(`${base}T00:00:00`);
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/* -------------------------------------------------------------------------- */
/*  shared day views (cross-agent contract)                                    */
/* -------------------------------------------------------------------------- */

export async function getDayAssignmentsForChild(
  childId: string,
  date: string,
): Promise<KidAssignmentItem[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("assignments")
    .select("*")
    .eq("child_id", childId)
    .eq("due_date", date)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  const subjects = await listSubjects(supabase, [childId]);
  const subjectById = indexById(subjects);

  return (data ?? []).map((assignment) => ({
    assignment,
    subject: assignment.subject_id
      ? (subjectById.get(assignment.subject_id) ?? null)
      : null,
  }));
}
