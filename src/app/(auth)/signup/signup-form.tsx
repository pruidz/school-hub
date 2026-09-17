"use client";

import { useActionState } from "react";

import { ka, t } from "@/lib/i18n/ka";

import {
  Field,
  FormError,
  FormSuccess,
  SubmitButton,
} from "../_components/form-parts";
import { signupAction, type SignupState } from "./actions";

export function SignupForm() {
  const [state, formAction] = useActionState<SignupState, FormData>(
    signupAction,
    null,
  );

  const failure = state && !state.ok ? state : null;

  if (state?.ok) {
    return (
      <div className="grid gap-3">
        <FormSuccess
          message={t("auth.confirmEmailSent", { email: state.data.email })}
        />
        <p className="text-sm text-muted-foreground">{ka.auth.checkEmail}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormError message={failure?.message} />

      <Field
        name="displayName"
        label={ka.auth.displayName}
        autoComplete="name"
        required
        error={failure?.fields?.displayName}
      />

      <Field
        name="familyName"
        label={ka.auth.familyName}
        autoComplete="organization"
        required
        error={failure?.fields?.familyName}
      />

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

      <Field
        name="password"
        type="password"
        label={ka.auth.password}
        autoComplete="new-password"
        required
        hint={ka.validation.passwordMin}
        error={failure?.fields?.password}
      />

      <Field
        name="passwordConfirm"
        type="password"
        label={ka.auth.passwordConfirm}
        autoComplete="new-password"
        required
        error={failure?.fields?.passwordConfirm}
      />

      <SubmitButton pendingLabel={ka.auth.signingUp} className="mt-1 w-full">
        {ka.auth.signUp}
      </SubmitButton>
    </form>
  );
}
