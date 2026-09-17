"use client";

import { useActionState } from "react";
import { toast } from "sonner";

import type { ActionFailure } from "@/lib/auth/result";
import { ka } from "@/lib/i18n/ka";
import { FormError, SubmitButton, TextField } from "@/features/children/form-ui";

import { updateAccount } from "./actions";

export function AccountForm({
  displayName,
  email,
}: {
  displayName: string;
  email: string | null;
}) {
  const [state, formAction] = useActionState<ActionFailure | null, FormData>(
    async (_previous, formData) => {
      const result = await updateAccount({
        displayName: String(formData.get("displayName") ?? ""),
      });
      if (!result.ok) return result;

      toast.success(ka.settings.accountSaved);
      return null;
    },
    null,
  );

  return (
    <form action={formAction} className="grid max-w-sm gap-4" noValidate>
      <FormError message={state?.message} />

      <TextField
        name="displayName"
        label={ka.settings.displayName}
        defaultValue={displayName}
        autoComplete="name"
        required
      />

      <TextField
        name="email"
        label={ka.auth.email}
        defaultValue={email ?? ""}
        hint={ka.settings.emailHint}
        readOnly
        disabled
      />

      <SubmitButton className="justify-self-start">
        {ka.common.save}
      </SubmitButton>
    </form>
  );
}
