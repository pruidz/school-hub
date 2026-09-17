"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { homePathForRole, isAppRole } from "@/lib/auth/roles";
import { fail, fieldErrorsFrom, type ActionFailure } from "@/lib/auth/result";
import { ka } from "@/lib/i18n/ka";
import { createClient } from "@/lib/supabase/server";

export type LoginState = ActionFailure | null;

const loginSchema = z.object({
  email: z.email({ message: ka.validation.emailInvalid }),
  password: z.string().min(1, { message: ka.validation.required }),
  next: z.string().optional(),
});

/** Only same-origin parent paths may be used as a post-login destination. */
function safeNext(value: string | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.startsWith("/kid")) return null;
  return value;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    next: formData.get("next")?.toString(),
  });

  if (!parsed.success) {
    return fail(
      ka.errors.generic,
      fieldErrorsFrom(z.flattenError(parsed.error).fieldErrors),
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return fail(ka.auth.emailNotConfirmed);
    }
    return fail(ka.auth.invalidCredentials);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  const role = isAppRole(profile?.role) ? profile.role : "parent";

  redirect(safeNext(parsed.data.next) ?? homePathForRole(role));
}
