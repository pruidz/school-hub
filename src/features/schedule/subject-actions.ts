"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/auth/result";
import { ka } from "@/lib/i18n/ka";
import { createClient } from "@/lib/supabase/server";
import {
  findOwnSubjectChildId,
  guardOwnChild,
  guardParentWrite,
} from "@/features/children/guards";

import { getSubjectUsage, type SubjectUsage } from "./queries";

/**
 * Subjects and topics. Parent-only: the child has SELECT on both tables and no
 * write policy at all, which matches the product — a curriculum is set up by
 * the adult, the child only records what happened in a lesson.
 */

const uuid = z.uuid();

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, { message: ka.validation.colorInvalid });

const nameSchema = z
  .string()
  .trim()
  .min(2, { message: ka.validation.nameMin })
  .max(60, { message: ka.validation.tooLong });

const optionalName = z
  .string()
  .max(80, { message: ka.validation.tooLong })
  .optional()
  .transform((value) => {
    const trimmed = (value ?? "").trim();
    return trimmed.length === 0 ? null : trimmed;
  });

const createSubjectSchema = z.object({
  childId: uuid,
  name: nameSchema,
  color: hexColor,
  teacherName: optionalName,
});

const updateSubjectSchema = z.object({
  subjectId: uuid,
  name: nameSchema,
  color: hexColor,
  teacherName: optionalName,
});

const moveSubjectSchema = z.object({
  subjectId: uuid,
  direction: z.enum(["up", "down"]),
});

const createTopicSchema = z.object({
  subjectId: uuid,
  name: nameSchema,
  parentTopicId: uuid.nullable().optional().default(null),
});

const updateTopicSchema = z.object({
  topicId: uuid,
  name: nameSchema,
});

function revalidateCurriculum() {
  revalidatePath("/parent/subjects");
  revalidatePath("/parent/schedule");
  revalidatePath("/kid/today");
}

/* -------------------------------------------------------------------------- */
/*  subjects                                                                  */
/* -------------------------------------------------------------------------- */

export async function createSubject(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = createSubjectSchema.safeParse(input);
  if (!parsed.success) return fail(firstMessage(parsed.error));

  const owned = await guardOwnChild(parsed.data.childId);
  if (!owned.ok) return owned.failure;

  const supabase = await createClient();

  // Append at the end of the list.
  const { data: last } = await supabase
    .from("subjects")
    .select("sort_order")
    .eq("child_id", parsed.data.childId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("subjects")
    .insert({
      child_id: parsed.data.childId,
      name: parsed.data.name,
      color: parsed.data.color,
      teacher_name: parsed.data.teacherName,
      sort_order: (last?.sort_order ?? 0) + 10,
    })
    .select("id")
    .single();

  if (error) {
    // subjects_child_name_unique
    if (error.code === "23505") return fail(ka.subjects.duplicateName);
    console.error("createSubject failed", error.code);
    return fail(ka.errors.generic);
  }

  revalidateCurriculum();
  return ok({ id: data.id });
}

export async function updateSubject(
  input: unknown,
): Promise<ActionResult<null>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = updateSubjectSchema.safeParse(input);
  if (!parsed.success) return fail(firstMessage(parsed.error));

  const childId = await findOwnSubjectChildId(parsed.data.subjectId);
  if (!childId) return fail(ka.errors.notFound);

  const supabase = await createClient();
  const { error } = await supabase
    .from("subjects")
    .update({
      name: parsed.data.name,
      color: parsed.data.color,
      teacher_name: parsed.data.teacherName,
    })
    .eq("id", parsed.data.subjectId);

  if (error) {
    if (error.code === "23505") return fail(ka.subjects.duplicateName);
    console.error("updateSubject failed", error.code);
    return fail(ka.errors.generic);
  }

  revalidateCurriculum();
  return ok(null);
}

/**
 * What a delete would take with it, so the confirmation can say it out loud.
 * `subjects.id` cascades to `topics` and `schedule_slots`, but `lessons` and
 * `assignments` only lose their `subject_id` (ON DELETE SET NULL).
 */
export async function describeSubjectUsage(
  subjectId: unknown,
): Promise<ActionResult<SubjectUsage>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = uuid.safeParse(subjectId);
  if (!parsed.success) return fail(ka.errors.notFound);

  const childId = await findOwnSubjectChildId(parsed.data);
  if (!childId) return fail(ka.errors.notFound);

  return ok(await getSubjectUsage(parsed.data));
}

export async function deleteSubject(
  subjectId: unknown,
): Promise<ActionResult<null>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = uuid.safeParse(subjectId);
  if (!parsed.success) return fail(ka.errors.notFound);

  const childId = await findOwnSubjectChildId(parsed.data);
  if (!childId) return fail(ka.errors.notFound);

  const supabase = await createClient();
  const { error } = await supabase
    .from("subjects")
    .delete()
    .eq("id", parsed.data);

  if (error) {
    console.error("deleteSubject failed", error.code);
    return fail(ka.errors.generic);
  }

  revalidateCurriculum();
  return ok(null);
}

/**
 * Move one subject up or down by swapping `sort_order` with its neighbour.
 * Two updates rather than renumbering the whole list: fewer writes, and the
 * order of the rows nobody touched cannot drift.
 */
export async function moveSubject(
  input: unknown,
): Promise<ActionResult<null>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = moveSubjectSchema.safeParse(input);
  if (!parsed.success) return fail(ka.errors.generic);

  const childId = await findOwnSubjectChildId(parsed.data.subjectId);
  if (!childId) return fail(ka.errors.notFound);

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("subjects")
    .select("id, sort_order, name")
    .eq("child_id", childId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const list = rows ?? [];
  const index = list.findIndex((row) => row.id === parsed.data.subjectId);
  if (index < 0) return fail(ka.errors.notFound);

  const targetIndex = parsed.data.direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= list.length) return ok(null);

  const current = list[index];
  const target = list[targetIndex];

  // Ties on sort_order are possible (seed data uses the same value), so fall
  // back to a deterministic re-spacing instead of swapping equal numbers.
  const currentOrder =
    current.sort_order === target.sort_order
      ? targetIndex * 10
      : target.sort_order;
  const targetOrder =
    current.sort_order === target.sort_order ? index * 10 : current.sort_order;

  const results = await Promise.all([
    supabase
      .from("subjects")
      .update({ sort_order: currentOrder })
      .eq("id", current.id),
    supabase
      .from("subjects")
      .update({ sort_order: targetOrder })
      .eq("id", target.id),
  ]);

  if (results.some((result) => result.error)) {
    console.error("moveSubject failed");
    return fail(ka.errors.generic);
  }

  revalidateCurriculum();
  return ok(null);
}

/* -------------------------------------------------------------------------- */
/*  topics                                                                    */
/* -------------------------------------------------------------------------- */

export async function createTopic(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = createTopicSchema.safeParse(input);
  if (!parsed.success) return fail(firstMessage(parsed.error));

  const childId = await findOwnSubjectChildId(parsed.data.subjectId);
  if (!childId) return fail(ka.errors.notFound);

  const supabase = await createClient();

  if (parsed.data.parentTopicId) {
    // The schema allows an arbitrarily deep tree; the UI allows exactly one
    // level, so a parent topic may not itself have a parent.
    const { data: parentTopic } = await supabase
      .from("topics")
      .select("id, subject_id, parent_topic_id")
      .eq("id", parsed.data.parentTopicId)
      .maybeSingle();

    if (!parentTopic || parentTopic.subject_id !== parsed.data.subjectId) {
      return fail(ka.errors.notFound);
    }
    if (parentTopic.parent_topic_id) {
      return fail(ka.subjects.topicNestingLimit);
    }
  }

  const { data, error } = await supabase
    .from("topics")
    .insert({
      subject_id: parsed.data.subjectId,
      name: parsed.data.name,
      parent_topic_id: parsed.data.parentTopicId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("createTopic failed", error.code);
    return fail(ka.errors.generic);
  }

  revalidateCurriculum();
  return ok({ id: data.id });
}

export async function updateTopic(
  input: unknown,
): Promise<ActionResult<null>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = updateTopicSchema.safeParse(input);
  if (!parsed.success) return fail(firstMessage(parsed.error));

  const supabase = await createClient();
  const { data: topic } = await supabase
    .from("topics")
    .select("id, subject_id")
    .eq("id", parsed.data.topicId)
    .maybeSingle();

  if (!topic) return fail(ka.errors.notFound);

  const childId = await findOwnSubjectChildId(topic.subject_id);
  if (!childId) return fail(ka.errors.notFound);

  const { error } = await supabase
    .from("topics")
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.topicId);

  if (error) {
    console.error("updateTopic failed", error.code);
    return fail(ka.errors.generic);
  }

  revalidateCurriculum();
  return ok(null);
}

export async function deleteTopic(
  topicId: unknown,
): Promise<ActionResult<null>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = uuid.safeParse(topicId);
  if (!parsed.success) return fail(ka.errors.notFound);

  const supabase = await createClient();
  const { data: topic } = await supabase
    .from("topics")
    .select("id, subject_id")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!topic) return fail(ka.errors.notFound);

  const childId = await findOwnSubjectChildId(topic.subject_id);
  if (!childId) return fail(ka.errors.notFound);

  const { error } = await supabase.from("topics").delete().eq("id", parsed.data);

  if (error) {
    console.error("deleteTopic failed", error.code);
    return fail(ka.errors.generic);
  }

  revalidateCurriculum();
  return ok(null);
}

/* -------------------------------------------------------------------------- */

function firstMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? ka.errors.generic;
}
