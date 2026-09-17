"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  generateInviteCode,
  revokeInviteCode,
  type InviteCode,
} from "@/lib/auth/child";
import {
  fail,
  ok,
  type ActionFailure,
  type ActionResult,
} from "@/lib/auth/result";
import { ka } from "@/lib/i18n/ka";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isIsoDate } from "@/features/schedule/dates";

import { guardOwnChild, guardParentWrite } from "./guards";
import { getChildView, type ChildView } from "./queries";

/* -------------------------------------------------------------------------- */
/*  schemas                                                                   */
/* -------------------------------------------------------------------------- */

const uuid = z.uuid();

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, { message: ka.validation.colorInvalid });

/** Empty string (an untouched form field) means "not set", not "invalid". */
const optionalText = (max: number) =>
  z
    .string()
    .max(max, { message: ka.validation.tooLong })
    .optional()
    .transform((value) => {
      const trimmed = (value ?? "").trim();
      return trimmed.length === 0 ? null : trimmed;
    });

const childFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: ka.validation.nameMin })
    .max(80, { message: ka.validation.tooLong }),
  grade: z
    .union(
      [
        z.literal(""),
        z.coerce
          .number()
          .int({ message: ka.validation.gradeRange })
          .min(1, { message: ka.validation.gradeRange })
          .max(12, { message: ka.validation.gradeRange }),
      ],
      // Keeps the union's own fallback Georgian too, so no English can leak.
      { error: ka.validation.gradeRange },
    )
    .optional()
    .transform((value) =>
      value === "" || value === undefined ? null : Number(value),
    ),
  school: optionalText(120),
  birthDate: optionalText(10).refine(
    (value) => value === null || isIsoDate(value),
    { message: ka.validation.dateInvalid },
  ),
  color: hexColor,
  avatarUrl: optionalText(500),
});

const createSchema = childFieldsSchema;
const updateSchema = childFieldsSchema.extend({ childId: uuid });
const archiveSchema = z.object({ childId: uuid, isActive: z.boolean() });
const preferencesSchema = z.object({
  childId: uuid,
  uiMode: z.enum(["simple", "full"]),
  showOwnStats: z.boolean(),
});

function revalidateChildren() {
  revalidatePath("/parent/children");
  revalidatePath("/parent", "layout");
}

/* -------------------------------------------------------------------------- */
/*  CRUD                                                                      */
/* -------------------------------------------------------------------------- */

export async function createChild(
  input: unknown,
): Promise<ActionResult<ChildView>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return firstError(parsed.error);

  const familyId = guard.value.familyId;
  if (!familyId) return fail(ka.errors.generic);

  // RLS (`children_parent_all`) re-checks `family_id = current_family_id()`,
  // so a forged family id cannot be written even though we pass one here.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("children")
    .insert({
      family_id: familyId,
      name: parsed.data.name,
      grade: parsed.data.grade,
      school: parsed.data.school,
      birth_date: parsed.data.birthDate,
      color: parsed.data.color,
      avatar_url: parsed.data.avatarUrl,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createChild failed", error?.code);
    return fail(ka.errors.generic);
  }

  const view = await getChildView(data.id);
  if (!view) return fail(ka.errors.generic);

  revalidateChildren();
  return ok(view);
}

export async function updateChild(
  input: unknown,
): Promise<ActionResult<ChildView>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return firstError(parsed.error);

  const owned = await guardOwnChild(parsed.data.childId);
  if (!owned.ok) return owned.failure;

  const supabase = await createClient();
  const { error } = await supabase
    .from("children")
    .update({
      name: parsed.data.name,
      grade: parsed.data.grade,
      school: parsed.data.school,
      birth_date: parsed.data.birthDate,
      color: parsed.data.color,
      avatar_url: parsed.data.avatarUrl,
    })
    .eq("id", parsed.data.childId);

  if (error) {
    console.error("updateChild failed", error.code);
    return fail(ka.errors.generic);
  }

  const view = await getChildView(parsed.data.childId);
  if (!view) return fail(ka.errors.generic);

  revalidateChildren();
  return ok(view);
}

/** Archive / restore. Children are never deleted — their history stays. */
export async function setChildActive(
  input: unknown,
): Promise<ActionResult<ChildView>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) return fail(ka.errors.generic);

  const owned = await guardOwnChild(parsed.data.childId);
  if (!owned.ok) return owned.failure;

  const supabase = await createClient();
  const { error } = await supabase
    .from("children")
    .update({ is_active: parsed.data.isActive })
    .eq("id", parsed.data.childId);

  if (error) {
    console.error("setChildActive failed", error.code);
    return fail(ka.errors.generic);
  }

  const view = await getChildView(parsed.data.childId);
  if (!view) return fail(ka.errors.generic);

  revalidateChildren();
  return ok(view);
}

/* -------------------------------------------------------------------------- */
/*  invite code                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Issue a fresh single-use code. Thin wrapper over A2's `generateInviteCode`,
 * which owns the collision retry and the service-role write; this adds the
 * parent-write guard and cache invalidation.
 *
 * Re-issuing is also the forgot-PIN path: redeeming the new code at `/join`
 * lets the child set a new PIN on the same account.
 */
export async function issueChildInviteCode(
  childId: unknown,
): Promise<ActionResult<InviteCode>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = uuid.safeParse(childId);
  if (!parsed.success) return fail(ka.errors.notFound);

  const owned = await guardOwnChild(parsed.data);
  if (!owned.ok) return owned.failure;

  const result = await generateInviteCode(parsed.data);
  if (result.ok) revalidateChildren();
  return result;
}

export async function revokeChildInviteCode(
  childId: unknown,
): Promise<ActionResult<null>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = uuid.safeParse(childId);
  if (!parsed.success) return fail(ka.errors.notFound);

  const owned = await guardOwnChild(parsed.data);
  if (!owned.ok) return owned.failure;

  const result = await revokeInviteCode(parsed.data);
  if (result.ok) revalidateChildren();
  return result;
}

/* -------------------------------------------------------------------------- */
/*  PIN lockout                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Clear a PIN lockout so the child can try again immediately.
 *
 * Why the admin client: every other `children.pin_*` write in the codebase
 * (`src/lib/auth/child.ts`) is service-role, because the child themself has
 * SELECT-only on `children`. A parent's own policy would technically allow this
 * UPDATE, but keeping all PIN-counter writes on one path means the lockout
 * cannot be weakened by a policy change elsewhere, and it keeps them together
 * for audit. The guard above is what makes it safe: `guardParentWrite()` proves
 * the caller is a parent and `guardOwnChild()` proves — through the
 * user-scoped, RLS-enforced client — that this child is in their family.
 * The admin client only ever sees an id that already passed both.
 */
export async function unlockChildPin(
  childId: unknown,
): Promise<ActionResult<ChildView>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = uuid.safeParse(childId);
  if (!parsed.success) return fail(ka.errors.notFound);

  const owned = await guardOwnChild(parsed.data);
  if (!owned.ok) return owned.failure;

  const admin = createAdminClient();
  const { error } = await admin
    .from("children")
    .update({ pin_attempts: 0, pin_locked_until: null })
    .eq("id", parsed.data);

  if (error) {
    console.error("unlockChildPin failed", error.code);
    return fail(ka.errors.generic);
  }

  const view = await getChildView(parsed.data);
  if (!view) return fail(ka.errors.generic);

  revalidateChildren();
  return ok(view);
}

/* -------------------------------------------------------------------------- */
/*  per-child UI preferences                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `ui_mode` and `show_own_stats` are parent-controlled: the child has no UPDATE
 * policy on `children` at all. A parent does, so this stays on the user-scoped
 * client — no service role needed.
 */
export async function updateChildPreferences(
  input: unknown,
): Promise<ActionResult<ChildView>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return fail(ka.errors.generic);

  const owned = await guardOwnChild(parsed.data.childId);
  if (!owned.ok) return owned.failure;

  const supabase = await createClient();
  const { error } = await supabase
    .from("children")
    .update({
      ui_mode: parsed.data.uiMode,
      show_own_stats: parsed.data.showOwnStats,
    })
    .eq("id", parsed.data.childId);

  if (error) {
    console.error("updateChildPreferences failed", error.code);
    return fail(ka.errors.generic);
  }

  const view = await getChildView(parsed.data.childId);
  if (!view) return fail(ka.errors.generic);

  revalidateChildren();
  revalidatePath("/kid", "layout");
  return ok(view);
}

/* -------------------------------------------------------------------------- */

function firstError(error: z.ZodError): ActionFailure {
  const flat = z.flattenError(error);
  const fields: Record<string, string> = {};
  for (const [key, messages] of Object.entries(flat.fieldErrors)) {
    if (Array.isArray(messages) && typeof messages[0] === "string") {
      fields[key] = messages[0];
    }
  }
  const first = Object.values(fields)[0] ?? ka.errors.generic;
  return fail(first, fields);
}
