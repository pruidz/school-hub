"use server";

/**
 * Write side of the assignments feature.
 *
 * Every action follows the same shape:
 *   1. `requireParent()` / `requireChild()`
 *   2. zod-validate the input
 *   3. read the row back through the user-scoped client and confirm the child
 *      belongs to the caller — a client-supplied id is never trusted
 *   4. write, then translate any database error into Georgian
 *
 * The DB trigger `public.assignments_status_guard()` is the real enforcer of
 * the status machine. The `ASSIGNMENT_TRANSITIONS` pre-check below exists only
 * so the common mistakes produce a precise message instead of a generic one.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { schedulePushForAssignment } from "@/features/notifications/push/deliver";
import { requireChild, requireParent } from "@/lib/auth/session";
import { fail, fieldErrorsFrom, ok, type ActionFailure, type ActionResult } from "@/lib/auth/result";
import {
  ASSIGNMENT_TRANSITIONS,
  type AssignmentStatus,
} from "@/lib/assignment-status";
import { ka, t } from "@/lib/i18n/ka";
import { createClient } from "@/lib/supabase/server";

import { formatShortDate, todayString } from "./dates";
import {
  childInFamily,
  lessonBelongsToChild,
  loadAssignment,
  subjectBelongsToChild,
  topicBelongsToChild,
  type Caller,
} from "./access";
import { assignmentErrorMessage, logDbError } from "./errors";

/* -------------------------------------------------------------------------- */
/*  helpers                                                                    */
/* -------------------------------------------------------------------------- */

function text(formData: FormData, name: string): string | null {
  const raw = formData.get(name);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function revalidateAssignment(assignmentId: string, childId?: string): void {
  revalidatePath("/parent");
  revalidatePath("/parent/inbox");
  revalidatePath("/parent/assignments");
  revalidatePath(`/parent/review/${assignmentId}`);
  revalidatePath("/kid/assignments");
  revalidatePath(`/kid/assignments/${assignmentId}`);
  revalidatePath("/kid/today");
  revalidatePath("/kid/chat");
  // There is no `/parent/children/[childId]` route — the child detail is a
  // panel on `/parent/children`, so that is the page to invalidate.
  if (childId) revalidatePath("/parent/children");
}

/**
 * RLS turns a forbidden UPDATE/DELETE into "0 rows affected" rather than an
 * error, so every write asks for the ids back and checks that something moved.
 * Without this an action could report success while nothing changed.
 */
function noRowsAffected(rows: { id: string }[] | null): boolean {
  return !rows || rows.length === 0;
}

function transitionAllowed(
  from: AssignmentStatus,
  to: AssignmentStatus,
): boolean {
  return ASSIGNMENT_TRANSITIONS[from].includes(to);
}

/* -------------------------------------------------------------------------- */
/*  parent — create / edit / delete                                            */
/* -------------------------------------------------------------------------- */

const assignmentFormSchema = z.object({
  childId: z.uuid(),
  title: z.string().min(1, ka.validation.titleRequired).max(200),
  description: z.string().max(4000).nullable(),
  sourceRef: z.string().max(300).nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, ka.validation.dateInvalid)
    .nullable(),
  dueTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, ka.validation.timeInvalid)
    .nullable(),
  subjectId: z.uuid().nullable(),
  topicId: z.uuid().nullable(),
  lessonId: z.uuid().nullable(),
  priority: z.number().int().min(1).max(3),
});

type AssignmentFormInput = z.infer<typeof assignmentFormSchema>;

export type AssignmentFormState = (ActionFailure & { ok: false }) | null;

function readAssignmentForm(formData: FormData): unknown {
  const priorityRaw = text(formData, "priority");
  return {
    childId: text(formData, "childId") ?? "",
    title: text(formData, "title") ?? "",
    description: text(formData, "description"),
    sourceRef: text(formData, "sourceRef"),
    dueDate: text(formData, "dueDate"),
    dueTime: text(formData, "dueTime"),
    subjectId: text(formData, "subjectId"),
    topicId: text(formData, "topicId"),
    lessonId: text(formData, "lessonId"),
    priority: priorityRaw ? Number(priorityRaw) : 2,
  };
}

/** Confirm every foreign key in the form points inside `childId`'s own data. */
async function validateRelations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  caller: Caller,
  input: AssignmentFormInput,
): Promise<string | null> {
  if (
    input.subjectId &&
    !(await subjectBelongsToChild(supabase, input.subjectId, input.childId))
  ) {
    return ka.assignments.errForbidden;
  }
  if (
    input.topicId &&
    !(await topicBelongsToChild(supabase, input.topicId, input.childId))
  ) {
    return ka.assignments.errForbidden;
  }
  if (
    input.lessonId &&
    !(await lessonBelongsToChild(
      supabase,
      caller,
      input.lessonId,
      input.childId,
    ))
  ) {
    return ka.assignments.errForbidden;
  }
  return null;
}

export async function createAssignmentAction(
  _prev: AssignmentFormState,
  formData: FormData,
): Promise<AssignmentFormState> {
  const parent = await requireParent();

  const parsed = assignmentFormSchema.safeParse(readAssignmentForm(formData));
  if (!parsed.success) {
    return fail(
      ka.assignments.errSaveFailed,
      fieldErrorsFrom(z.flattenError(parsed.error).fieldErrors),
    );
  }

  const supabase = await createClient();
  const caller: Caller = { role: "parent", session: parent };

  if (!(await childInFamily(supabase, parent, parsed.data.childId))) {
    return fail(ka.assignments.errForbidden);
  }

  const relationError = await validateRelations(supabase, caller, parsed.data);
  if (relationError) return fail(relationError);

  const { data, error } = await supabase
    .from("assignments")
    .insert({
      child_id: parsed.data.childId,
      title: parsed.data.title,
      description: parsed.data.description,
      source_ref: parsed.data.sourceRef,
      due_date: parsed.data.dueDate,
      due_time: parsed.data.dueTime,
      subject_id: parsed.data.subjectId,
      topic_id: parsed.data.topicId,
      lesson_id: parsed.data.lessonId,
      priority: parsed.data.priority,
      created_by: parent.id,
    })
    .select("id, child_id")
    .single();

  if (error || !data) {
    logDbError("assignments.create", error);
    return fail(assignmentErrorMessage(error));
  }

  revalidateAssignment(data.id, data.child_id);
  redirect(`/parent/assignments/${data.id}`);
}

export async function updateAssignmentAction(
  _prev: AssignmentFormState,
  formData: FormData,
): Promise<AssignmentFormState> {
  const parent = await requireParent();

  const assignmentId = text(formData, "assignmentId");
  if (!assignmentId || !z.uuid().safeParse(assignmentId).success) {
    return fail(ka.assignments.errNotFound);
  }

  const parsed = assignmentFormSchema.safeParse(readAssignmentForm(formData));
  if (!parsed.success) {
    return fail(
      ka.assignments.errSaveFailed,
      fieldErrorsFrom(z.flattenError(parsed.error).fieldErrors),
    );
  }

  const supabase = await createClient();
  const caller: Caller = { role: "parent", session: parent };

  const existing = await loadAssignment(supabase, caller, assignmentId);
  if (!existing) return fail(ka.assignments.errNotFound);

  // The child an assignment belongs to is immutable (the DB trigger says so
  // too); silently keep the stored value rather than trusting the form.
  const childId = existing.childId;
  const relationError = await validateRelations(supabase, caller, {
    ...parsed.data,
    childId,
  });
  if (relationError) return fail(relationError);

  const { data, error } = await supabase
    .from("assignments")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      source_ref: parsed.data.sourceRef,
      due_date: parsed.data.dueDate,
      due_time: parsed.data.dueTime,
      subject_id: parsed.data.subjectId,
      topic_id: parsed.data.topicId,
      lesson_id: parsed.data.lessonId,
      priority: parsed.data.priority,
    })
    .eq("id", assignmentId)
    .select("id");

  if (error) {
    logDbError("assignments.update", error);
    return fail(assignmentErrorMessage(error));
  }
  if (noRowsAffected(data)) return fail(ka.assignments.errForbidden);

  revalidateAssignment(assignmentId, childId);
  redirect(`/parent/assignments/${assignmentId}`);
}

const idSchema = z.object({ assignmentId: z.uuid() });

export async function deleteAssignmentAction(
  input: z.input<typeof idSchema>,
): Promise<ActionResult<null>> {
  const parent = await requireParent();

  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail(ka.assignments.errNotFound);

  const supabase = await createClient();
  const caller: Caller = { role: "parent", session: parent };

  const existing = await loadAssignment(
    supabase,
    caller,
    parsed.data.assignmentId,
  );
  if (!existing) return fail(ka.assignments.errNotFound);

  const { data, error } = await supabase
    .from("assignments")
    .delete()
    .eq("id", existing.id)
    .select("id");

  if (error) {
    logDbError("assignments.delete", error);
    return fail(ka.assignments.errDeleteFailed);
  }
  if (noRowsAffected(data)) return fail(ka.assignments.errForbidden);

  revalidateAssignment(existing.id, existing.childId);
  return ok(null);
}

/* -------------------------------------------------------------------------- */
/*  child — create (SPEC 3.1: the child records what was given)                */
/* -------------------------------------------------------------------------- */

/**
 * Trim-to-null, the shape every optional text field on the kid form uses. A
 * child who types nothing must not produce an empty string in the database.
 */
function optionalText(max: number) {
  return z
    .string()
    .max(max, ka.validation.tooLong)
    .nullish()
    .transform((value) => {
      const trimmed = (value ?? "").trim();
      return trimmed.length === 0 ? null : trimmed;
    });
}

const kidAssignmentSchema = z.object({
  title: optionalText(200),
  description: optionalText(4000),
  sourceRef: optionalText(300),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, ka.validation.dateInvalid)
    .nullish()
    .transform((value) => value ?? null),
  subjectId: z.uuid().nullish().transform((value) => value ?? null),
  lessonId: z.uuid().nullish().transform((value) => value ?? null),
});

/**
 * "სათაური" is optional on purpose — the photo is the point and typing is the
 * friction (SPEC section 6, point ი). A child who types nothing still has to
 * end up with a row they can recognise in a list, so the title is derived from
 * what is already known: the subject and the day the homework was given.
 */
function derivedTitle(subjectName: string | null, date: string): string {
  return subjectName
    ? t("assignments.kidAutoTitle", {
        subject: subjectName,
        date: formatShortDate(date),
      })
    : t("assignments.kidAutoTitleNoSubject", { date: formatShortDate(date) });
}

/**
 * The child adding the homework they were given today.
 *
 * Mirrors `createAssignmentAction` but: the child is the caller, `child_id` is
 * taken from the session and never from the form, `status` is left to the
 * column default (`assigned`) so the status machine starts where it should,
 * and `priority` / `topic_id` / `due_time` are not accepted at all — those stay
 * the parent's. `assignments_insert_own` (0004, tightened in 0012) is the real
 * enforcer of every one of those; the checks here exist to turn a rejection
 * into a Georgian sentence instead of a 42501.
 *
 * Returns the new id rather than redirecting: the caller needs it to upload the
 * photo of the book page into `{child_id}/{assignment_id}/…`.
 */
export async function createAssignmentAsChildAction(
  input: z.input<typeof kidAssignmentSchema>,
): Promise<ActionResult<{ id: string }>> {
  const child = await requireChild();

  const parsed = kidAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      ka.assignments.errSaveFailed,
      fieldErrorsFrom(z.flattenError(parsed.error).fieldErrors),
    );
  }

  const supabase = await createClient();
  const childId = child.childId;

  // The lesson is read back through the user-scoped client, so a sibling's id
  // is invisible here long before the policy would refuse it — and it supplies
  // both the subject and the date the homework was given.
  let lessonDate: string | null = null;
  let subjectId = parsed.data.subjectId;

  if (parsed.data.lessonId) {
    const { data: lesson } = await supabase
      .from("lessons")
      .select("id, child_id, subject_id, date")
      .eq("id", parsed.data.lessonId)
      .maybeSingle();

    if (!lesson || lesson.child_id !== childId) {
      return fail(ka.assignments.errForbidden);
    }
    lessonDate = lesson.date;
    if (!subjectId) subjectId = lesson.subject_id;
  }

  let subjectName: string | null = null;
  if (subjectId) {
    const { data: subject } = await supabase
      .from("subjects")
      .select("id, name, child_id")
      .eq("id", subjectId)
      .maybeSingle();

    if (!subject || subject.child_id !== childId) {
      return fail(ka.assignments.errForbidden);
    }
    subjectName = subject.name;
  }

  const title =
    parsed.data.title ??
    derivedTitle(subjectName, lessonDate ?? todayString());

  const { data, error } = await supabase
    .from("assignments")
    .insert({
      child_id: childId,
      title,
      description: parsed.data.description,
      source_ref: parsed.data.sourceRef,
      due_date: parsed.data.dueDate,
      subject_id: subjectId,
      lesson_id: parsed.data.lessonId,
      created_by: child.id,
      // status, priority, topic_id and due_time are deliberately absent: the
      // column defaults are the only values a child may start from.
    })
    .select("id, child_id")
    .single();

  if (error || !data) {
    logDbError("assignments.createAsChild", error);
    return fail(assignmentErrorMessage(error));
  }

  revalidateAssignment(data.id, data.child_id);
  return ok({ id: data.id });
}

/* -------------------------------------------------------------------------- */
/*  child — start / submit                                                     */
/* -------------------------------------------------------------------------- */

export async function startAssignmentAction(
  input: z.input<typeof idSchema>,
): Promise<ActionResult<null>> {
  const child = await requireChild();

  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail(ka.assignments.errNotFound);

  const supabase = await createClient();
  const caller: Caller = { role: "child", session: child };

  const existing = await loadAssignment(
    supabase,
    caller,
    parsed.data.assignmentId,
  );
  if (!existing) return fail(ka.assignments.errNotFound);

  if (!transitionAllowed(existing.status, "in_progress")) {
    return fail(ka.assignments.errIllegalTransition);
  }

  const { data, error } = await supabase
    .from("assignments")
    .update({ status: "in_progress" })
    .eq("id", existing.id)
    .select("id");

  if (error) {
    logDbError("assignments.start", error);
    return fail(assignmentErrorMessage(error));
  }
  if (noRowsAffected(data)) return fail(ka.assignments.errForbidden);

  revalidateAssignment(existing.id);
  return ok(null);
}

/**
 * `assigned -> in_progress`, fired by the child merely OPENING the assignment.
 *
 * The child is plainly working on it — that is why the page is on screen — so
 * making them declare it first was friction that taught nothing, and the
 * distinction between `assigned` and `in_progress` is information the parent
 * wants without the child having to volunteer it. `/kid/assignments/[id]` now
 * calls this once on mount instead of rendering a „დაწყება" button.
 *
 * Three properties matter, and each is enforced here rather than in the caller:
 *
 *  - IDEMPOTENT. `.eq("status", "assigned")` is part of the UPDATE, so two tabs
 *    (or a refresh that beats the effect guard) race to the same single row
 *    change. The loser affects zero rows and reports `started: false`, and
 *    `assignment_events` therefore records exactly one transition.
 *  - NARROW. Only `assigned` moves. `redo`, `in_progress`, `submitted` and
 *    `approved` are left exactly as they are — opening a page must never be
 *    what reopens reviewed work.
 *  - SILENT. Every failure returns `ok({ started: false })`. The child did not
 *    ask for this and must never see an error for it; the page renders the
 *    same either way. Real faults are logged server-side.
 */
export async function autoStartAssignmentAction(
  input: z.input<typeof idSchema>,
): Promise<ActionResult<{ started: boolean }>> {
  const notStarted = ok({ started: false });

  const child = await requireChild();

  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return notStarted;

  const supabase = await createClient();
  const caller: Caller = { role: "child", session: child };

  const existing = await loadAssignment(
    supabase,
    caller,
    parsed.data.assignmentId,
  );
  if (!existing || existing.status !== "assigned") return notStarted;

  const { data, error } = await supabase
    .from("assignments")
    .update({ status: "in_progress" })
    .eq("id", existing.id)
    .eq("status", "assigned")
    .select("id");

  if (error) {
    logDbError("assignments.autoStart", error);
    return notStarted;
  }
  if (noRowsAffected(data)) return notStarted;

  revalidateAssignment(existing.id, existing.childId);
  return ok({ started: true });
}

const submitSchema = z.object({
  assignmentId: z.uuid(),
  selfRating: z.number().int().min(1, ka.validation.ratingRange).max(5, ka.validation.ratingRange).nullable(),
  difficultyNote: z.string().max(2000).nullable(),
  minutesSpent: z
    .number()
    .int()
    .min(0, ka.validation.minutesRange)
    .max(1440, ka.validation.minutesRange)
    .nullable(),
});

export async function submitAssignmentAction(
  input: z.input<typeof submitSchema>,
): Promise<ActionResult<null>> {
  const child = await requireChild();

  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      ka.assignments.errSaveFailed,
      fieldErrorsFrom(z.flattenError(parsed.error).fieldErrors),
    );
  }

  const supabase = await createClient();
  const caller: Caller = { role: "child", session: child };

  const existing = await loadAssignment(
    supabase,
    caller,
    parsed.data.assignmentId,
  );
  if (!existing) return fail(ka.assignments.errNotFound);

  if (existing.status === "submitted" || existing.status === "approved") {
    return fail(ka.assignments.errIllegalTransition);
  }

  // Submitting with nothing to look at wastes the parent's time.
  //
  // "Something to look at" is no longer the same as "a photo": a large share of
  // primary-school homework is oral — learn a poem, read a passage aloud — and
  // a recording is the only honest evidence of it. The `kind = 'solution'`
  // count is therefore deliberately NOT narrowed by mime: one photo, or one
  // recording, or any mixture, is a submission.
  const { count } = await supabase
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .eq("assignment_id", existing.id)
    .eq("kind", "solution");

  if ((count ?? 0) === 0) {
    return fail(ka.assignments.errNoSolutionEvidence);
  }

  // `redo` cannot go straight to `submitted`; the machine routes it through
  // `in_progress`, which is also what bumps `redo_count`.
  if (existing.status === "redo") {
    const { error: reopenError } = await supabase
      .from("assignments")
      .update({ status: "in_progress" })
      .eq("id", existing.id);

    if (reopenError) {
      logDbError("assignments.submit.reopen", reopenError);
      return fail(assignmentErrorMessage(reopenError));
    }
  }

  const { data, error } = await supabase
    .from("assignments")
    .update({
      status: "submitted",
      self_rating: parsed.data.selfRating,
      difficulty_note: parsed.data.difficultyNote,
      minutes_spent: parsed.data.minutesSpent,
    })
    .eq("id", existing.id)
    .select("id");

  if (error) {
    logDbError("assignments.submit", error);
    return fail(assignmentErrorMessage(error));
  }
  if (noRowsAffected(data)) return fail(ka.assignments.errForbidden);

  revalidateAssignment(existing.id);
  // 0009's trigger has already written "X handed in their homework" to every
  // parent in the family. Get it onto their phones — after the response, so a
  // push service having a bad day cannot turn a successful hand-in into an
  // error the child sees.
  schedulePushForAssignment(existing.id);
  return ok(null);
}

/* -------------------------------------------------------------------------- */
/*  parent — review                                                            */
/* -------------------------------------------------------------------------- */

const reviewSchema = z.object({
  assignmentId: z.uuid(),
  comment: z.string().max(2000).nullable().optional(),
});

export async function approveAssignmentAction(
  input: z.input<typeof reviewSchema>,
): Promise<ActionResult<null>> {
  const parent = await requireParent();

  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return fail(ka.assignments.errNotFound);

  const supabase = await createClient();
  const caller: Caller = { role: "parent", session: parent };

  const existing = await loadAssignment(
    supabase,
    caller,
    parsed.data.assignmentId,
  );
  if (!existing) return fail(ka.assignments.errNotFound);

  if (!transitionAllowed(existing.status, "approved")) {
    return fail(ka.review.notSubmitted);
  }

  const comment = parsed.data.comment?.trim() || null;

  const { data, error } = await supabase
    .from("assignments")
    .update(
      comment
        ? { status: "approved", review_comment: comment }
        : { status: "approved" },
    )
    .eq("id", existing.id)
    .select("id");

  if (error) {
    logDbError("assignments.approve", error);
    return fail(assignmentErrorMessage(error));
  }
  if (noRowsAffected(data)) return fail(ka.assignments.errReviewerOnly);

  revalidateAssignment(existing.id, existing.childId);
  schedulePushForAssignment(existing.id);
  return ok(null);
}

const redoSchema = z.object({
  assignmentId: z.uuid(),
  comment: z
    .string()
    .trim()
    .min(3, ka.validation.commentRequired)
    .max(2000, ka.validation.tooLong),
});

export async function requestRedoAction(
  input: z.input<typeof redoSchema>,
): Promise<ActionResult<null>> {
  const parent = await requireParent();

  const parsed = redoSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      ka.validation.commentRequired,
      fieldErrorsFrom(z.flattenError(parsed.error).fieldErrors),
    );
  }

  const supabase = await createClient();
  const caller: Caller = { role: "parent", session: parent };

  const existing = await loadAssignment(
    supabase,
    caller,
    parsed.data.assignmentId,
  );
  if (!existing) return fail(ka.assignments.errNotFound);

  if (!transitionAllowed(existing.status, "redo")) {
    return fail(ka.review.notSubmitted);
  }

  const { data, error } = await supabase
    .from("assignments")
    .update({ status: "redo", review_comment: parsed.data.comment })
    .eq("id", existing.id)
    .select("id");

  if (error) {
    logDbError("assignments.redo", error);
    return fail(assignmentErrorMessage(error));
  }
  if (noRowsAffected(data)) return fail(ka.assignments.errReviewerOnly);

  revalidateAssignment(existing.id, existing.childId);
  schedulePushForAssignment(existing.id);
  return ok(null);
}

const reopenSchema = z.object({
  assignmentId: z.uuid(),
  to: z.enum(["redo", "in_progress"]),
  comment: z.string().max(2000).nullable().optional(),
});

/**
 * Correction out of `approved` — the two reviewer-only transitions in the
 * status machine. A redo still needs a comment; the child has to know why.
 */
export async function reopenAssignmentAction(
  input: z.input<typeof reopenSchema>,
): Promise<ActionResult<null>> {
  const parent = await requireParent();

  const parsed = reopenSchema.safeParse(input);
  if (!parsed.success) return fail(ka.assignments.errNotFound);

  const comment = parsed.data.comment?.trim() || null;
  if (parsed.data.to === "redo" && (!comment || comment.length < 3)) {
    return fail(ka.validation.commentRequired);
  }

  const supabase = await createClient();
  const caller: Caller = { role: "parent", session: parent };

  const existing = await loadAssignment(
    supabase,
    caller,
    parsed.data.assignmentId,
  );
  if (!existing) return fail(ka.assignments.errNotFound);

  if (!transitionAllowed(existing.status, parsed.data.to)) {
    return fail(ka.assignments.errIllegalTransition);
  }

  const { data, error } = await supabase
    .from("assignments")
    .update(
      comment
        ? { status: parsed.data.to, review_comment: comment }
        : { status: parsed.data.to },
    )
    .eq("id", existing.id)
    .select("id");

  if (error) {
    logDbError("assignments.reopen", error);
    return fail(assignmentErrorMessage(error));
  }
  if (noRowsAffected(data)) return fail(ka.assignments.errReopenReviewerOnly);

  revalidateAssignment(existing.id, existing.childId);
  schedulePushForAssignment(existing.id);
  return ok(null);
}
