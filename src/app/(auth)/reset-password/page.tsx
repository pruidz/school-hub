import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ka } from "@/lib/i18n/ka";
import { createClient } from "@/lib/supabase/server";

import { AuthCard } from "../_components/auth-card";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: ka.auth.resetTitle };

export default async function ResetPasswordPage() {
  // The emailed link goes through /auth/callback, which establishes a recovery
  // session. Without one there is nothing to reset.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AuthCard title={ka.auth.resetTitle}>
        <div className="grid gap-4">
          <Alert variant="destructive" role="alert">
            <AlertDescription>{ka.auth.resetLinkInvalid}</AlertDescription>
          </Alert>
          <Button asChild variant="outline" className="w-full">
            <Link href="/forgot-password">{ka.auth.sendResetLink}</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={ka.auth.resetTitle} description={ka.auth.resetSubtitle}>
      <ResetPasswordForm />
    </AuthCard>
  );
}
