"use client";

import { useActionState } from "react";

import { ka } from "@/lib/i18n/ka";

import { Field, FormError, SubmitButton } from "../_components/form-parts";
import { loginAction, type LoginState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(
    loginAction,
    null,
  );

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <FormError message={state?.message} />

      <Field
        name="email"
        type="email"
        label={ka.auth.email}
        placeholder={ka.auth.emailPlaceholder}
        autoComplete="email"
        inputMode="email"
        required
        error={state?.fields?.email}
      />

      <Field
        name="password"
        type="password"
        label={ka.auth.password}
        autoComplete="current-password"
        required
        error={state?.fields?.password}
      />

      <SubmitButton pendingLabel={ka.auth.signingIn} className="mt-1 w-full">
        {ka.auth.signIn}
      </SubmitButton>
    </form>
  );
}
