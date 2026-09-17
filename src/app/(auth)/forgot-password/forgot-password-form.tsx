"use client";

import { useActionState } from "react";

import { ka } from "@/lib/i18n/ka";

import {
  Field,
  FormError,
  FormSuccess,
  SubmitButton,
} from "../_components/form-parts";
import {
  forgotPasswordAction,
  type ForgotPasswordState,
} from "./actions";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<ForgotPasswordState, FormData>(
    forgotPasswordAction,
    null,
  );

  const failure = state && !state.ok ? state : null;

  if (state?.ok) return <FormSuccess message={ka.auth.resetLinkSent} />;

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormError message={failure?.message} />

      <Field
        name="email"
        type="email"
        label={ka.auth.email}
        placeholder={ka.auth.emailPlaceholder}
        autoComplete="email"
        inputMode="email"
        required
        error={failure?.fields?.email}
      />

      <SubmitButton className="mt-1 w-full">
        {ka.auth.sendResetLink}
      </SubmitButton>
    </form>
  );
}
