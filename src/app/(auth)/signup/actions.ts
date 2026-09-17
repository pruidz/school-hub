"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  fail,
  fieldErrorsFrom,
  ok,
  type ActionResult,
} from "@/lib/auth/result";
import { ka } from "@/lib/i18n/ka";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type SignupState = ActionResult<{ email: string }> | null;

const signupSchema = z
  .object({
    displayName: z.string().trim().min(2, { message: ka.validation.nameMin }),
    familyName: z.string().trim().min(2, { message: ka.validation.nameMin }),
    email: z.email({ message: ka.validation.emailInvalid }),
    password: z.string().min(8, { message: ka.validation.passwordMin }),
    passwordConfirm: z.string(),
  })
  .refine((value) => value.password === value.passwordConfirm, {
    message: ka.validation.passwordsDoNotMatch,
    path: ["passwordConfirm"],
  });

/**
 * Create a parent account and the family it owns.
 *
 * The auth user is created with the anon client (so Supabase's own email
 * confirmation flow applies), then the service-role client writes the
 * `profiles` / `families` / `family_members` rows and stamps the
 * `app_metadata.role` claim, which a user cannot forge.
 */
export async function signupAction(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const parsed = signupSchema.safeParse({
    displayName: String(formData.get("displayName") ?? ""),
    familyName: String(formData.get("familyName") ?? ""),
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    passwordConfirm: String(formData.get("passwordConfirm") ?? ""),
  });

  if (!parsed.success) {
    return fail(
      ka.errors.generic,
      fieldErrorsFrom(z.flattenError(parsed.error).fieldErrors),
    );
  }

  const { displayName, familyName, email, password } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${siteUrl()}/auth/callback?next=/parent`,
    },
  });

  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return fail(ka.auth.emailTaken, { email: ka.auth.emailTaken });
    }
    console.error("signup failed", error.code);
    return fail(ka.errors.generic);
  }

  // Supabase returns a decoy user with no identities when the address is
  // already registered and confirmations are on.
  const user = data.user;
  if (!user || user.identities?.length === 0) {
    return fail(ka.auth.emailTaken, { email: ka.auth.emailTaken });
  }

  const admin = createAdminClient();

  const { error: profileError } = await admin.from("profiles").upsert(
    { id: user.id, role: "parent", display_name: displayName },
    { onConflict: "id" },
  );
  if (profileError) {
    console.error("signup profile failed", profileError.code);
    return fail(ka.errors.generic);
  }

  const { data: family, error: familyError } = await admin
    .from("families")
    .insert({ name: familyName, owner_id: user.id })
    .select("id")
    .single();

  if (familyError || !family) {
    console.error("signup family failed", familyError?.code);
    return fail(ka.errors.generic);
  }

  const { error: memberError } = await admin
    .from("family_members")
    .upsert(
      {
        family_id: family.id,
        user_id: user.id,
        role: "parent",
        permissions: {},
      },
      { onConflict: "family_id,user_id" },
    );

  if (memberError) {
    console.error("signup membership failed", memberError.code);
    return fail(ka.errors.generic);
  }

  const { error: claimError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { role: "parent" },
  });
  if (claimError) {
    // Not fatal — `profiles.role` is the fallback everywhere.
    console.error("signup role claim failed", claimError.code);
  }

  // Email confirmation on: no session yet, so tell them to check their inbox.
  if (!data.session) return ok({ email });

  redirect("/parent");
}
