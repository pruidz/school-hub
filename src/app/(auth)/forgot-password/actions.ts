"use server";

import { z } from "zod";

import {
  fail,
  fieldErrorsFrom,
  ok,
  type ActionResult,
} from "@/lib/auth/result";
import { ka } from "@/lib/i18n/ka";
import { siteUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type ForgotPasswordState = ActionResult<null> | null;

const schema = z.object({
  email: z.email({ message: ka.validation.emailInvalid }),
});

/**
 * Send the Supabase recovery email. Always reports success so the form cannot
 * be used to find out which addresses have accounts.
 */
export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = schema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
  });

  if (!parsed.success) {
    return fail(
      ka.validation.emailInvalid,
      fieldErrorsFrom(z.flattenError(parsed.error).fieldErrors),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: `${siteUrl()}/auth/callback?next=/reset-password` },
  );

  if (error && error.code !== "over_email_send_rate_limit") {
    console.error("password recovery failed", error.code);
  }

  return ok(null);
}
