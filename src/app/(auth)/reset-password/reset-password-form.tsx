"use client";

import { useActionState } from "react";

import { ka } from "@/lib/i18n/ka";

import { Field, FormError, SubmitButton } from "../_components/form-parts";
import { resetPasswordAction, type ResetPasswordState } from "./actions";

export function ResetPasswordForm() {
  const [state, formAction] = useActionState<ResetPasswordState, FormData>(
    resetPasswordAction,
    null,
  );

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormError message={state?.message} />

      <Field
        name="password"
        type="password"
        label={ka.auth.newPassword}
        autoComplete="new-password"
        required
        hint={ka.validation.passwordMin}
        error={state?.fields?.password}
      />

      <Field
        name="passwordConfirm"
        type="password"
        label={ka.auth.passwordConfirm}
        autoComplete="new-password"
        required
        error={state?.fields?.passwordConfirm}
      />

      <SubmitButton className="mt-1 w-full">
        {ka.auth.updatePassword}
      </SubmitButton>
    </form>
  );
}
