"use client";

/**
 * The two ways to take up a helper invitation.
 *
 *   signed in with the invited address  -> one button
 *   no account yet                      -> name + password, created here
 *
 * Signing up through `/signup` would not work: that flow creates a family and a
 * parent profile, and `accountMayBecomeHelper()` then refuses the invitation —
 * correctly, because one account cannot be both. So the account is created by
 * `signUpAndAcceptHelperAction()` with the helper role from the start.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { FormError } from "@/features/children/form-ui";
import { ka } from "@/lib/i18n/ka";

import {
  acceptHelperInvitationAction,
  signUpAndAcceptHelperAction,
} from "./actions";
import { HELPER_HOME, helperInvitePath } from "./routes";

export function AcceptSignedIn({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    const result = await acceptHelperInvitationAction({ token });
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    toast.success(ka.helpers.accepted);
    router.replace(HELPER_HOME);
  };

  return (
    <div className="grid gap-3">
      <FormError message={error} />
      <p className="text-sm text-muted-foreground">
        {ka.helpers.acceptSignedInAs.replace("{email}", email)}
      </p>
      <Button type="button" disabled={busy} onClick={() => void accept()}>
        {busy ? <Loader2 className="animate-spin" /> : null}
        {busy ? ka.helpers.accepting : ka.helpers.accept}
      </Button>
    </div>
  );
}

export function AcceptWithNewAccount({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setBusy(true);
    setError(null);
    const result = await signUpAndAcceptHelperAction({
      token,
      displayName: String(form.get("displayName") ?? ""),
      password: String(form.get("password") ?? ""),
      passwordConfirm: String(form.get("passwordConfirm") ?? ""),
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    toast.success(ka.helpers.accepted);
    router.replace(HELPER_HOME);
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-sm font-medium">{ka.helpers.acceptCreateTitle}</h2>
        <p className="text-xs text-muted-foreground">
          {ka.helpers.acceptCreateBody.replace("{email}", email)}
        </p>
      </div>

      <form onSubmit={submit} className="grid gap-3" noValidate>
        <FormError message={error} />

        <div className="grid gap-1.5">
          <Label htmlFor="helper-accept-name">
            {ka.helpers.acceptDisplayName}
          </Label>
          <Input
            id="helper-accept-name"
            name="displayName"
            autoComplete="name"
            required
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="helper-accept-password">
            {ka.helpers.acceptPassword}
          </Label>
          <Input
            id="helper-accept-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="helper-accept-password2">
            {ka.helpers.acceptPasswordConfirm}
          </Label>
          <Input
            id="helper-accept-password2"
            name="passwordConfirm"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>

        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {busy ? ka.helpers.accepting : ka.helpers.acceptCreate}
        </Button>
      </form>

      <Separator />

      <p className="text-sm text-muted-foreground">
        {ka.helpers.acceptHaveAccount}{" "}
        <Link
          href={`/login?next=${encodeURIComponent(helperInvitePath(token))}`}
          className="font-medium text-foreground underline"
        >
          {ka.helpers.acceptSignIn}
        </Link>
      </p>
    </div>
  );
}
