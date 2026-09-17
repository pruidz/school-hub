"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { homePathForRole } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import {
  fail,
  fieldErrorsFrom,
  type ActionFailure,
} from "@/lib/auth/result";
import { ka } from "@/lib/i18n/ka";
import { createClient } from "@/lib/supabase/server";

export type ResetPasswordState = ActionFailure | null;

const schema = z
  .object({
    password: z.string().min(8, { message: ka.validation.passwordMin }),
    passwordConfirm: z.string(),
  })
  .refine((value) => value.password === value.passwordConfirm, {
    message: ka.validation.passwordsDoNotMatch,
    path: ["passwordConfirm"],
  });

/**
 * Set a new password. Requires the recovery session that `/auth/callback`
 * established from the emailed link.
 */
export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = schema.safeParse({
    password: String(formData.get("password") ?? ""),
    passwordConfirm: String(formData.get("passwordConfirm") ?? ""),
  });

  if (!parsed.success) {
    return fail(
      ka.errors.generic,
      fieldErrorsFrom(z.flattenError(parsed.error).fieldErrors),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return fail(ka.auth.resetLinkInvalid);

  // A child's account authenticates by PIN against a server-derived password they
  // never see. Letting a signed-in child set a real password here would let them sign
  // in at /login and walk straight past the PIN and its lockout. This route stays open
  // to a signed-in user because the recovery link signs you in — so the guard is here.
  const caller = await getSessionUser();
  if (caller?.role === "child") return fail(ka.auth.resetNotForChild);

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    if (error.code === "same_password") {
      return fail(ka.auth.passwordSameAsOld, {
        password: ka.auth.passwordSameAsOld,
      });
    }
    console.error("password update failed", error.code);
    return fail(ka.errors.generic);
  }

  redirect(homePathForRole(caller?.role ?? "parent"));
}
