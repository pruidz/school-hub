"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireParent } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/auth/result";
import { ka } from "@/lib/i18n/ka";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, { message: ka.validation.nameMin })
    .max(80, { message: ka.validation.tooLong }),
});

/**
 * Rename the signed-in account.
 *
 * `profiles_update_self` scopes the write to `id = auth.uid()`, so the row id
 * comes from the session and is never accepted from the client. Email is
 * deliberately not editable here: changing it is an auth flow (confirmation
 * mail, session invalidation) that belongs to A2's screens.
 */
export async function updateAccount(
  input: unknown,
): Promise<ActionResult<{ displayName: string }>> {
  const parent = await requireParent();

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? ka.errors.generic);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName })
    .eq("id", parent.id);

  if (error) {
    console.error("updateAccount failed", error.code);
    return fail(ka.errors.generic);
  }

  revalidatePath("/parent", "layout");
  return ok({ displayName: parsed.data.displayName });
}
