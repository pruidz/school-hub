import type { Metadata } from "next";
import Link from "next/link";

import { InstallHint } from "@/components/install/install-hint";
import { ka } from "@/lib/i18n/ka";

import { AuthCard } from "../_components/auth-card";
import { KidLoginForm } from "./kid-login-form";

export const metadata: Metadata = { title: ka.auth.kidLoginTitle };

export default function KidLoginPage() {
  return (
    <div className="grid gap-4">
      <AuthCard
        title={ka.auth.kidLoginTitle}
        description={ka.auth.kidLoginSubtitle}
      >
        <KidLoginForm />
      </AuthCard>

      {/* The child signs in here far more often than anywhere else, so this is
          where the "add it to the Home Screen" hint has the best chance of
          being read — and of being acted on before the session is lost. */}
      <InstallHint />

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="underline underline-offset-4">
          {ka.auth.roleParent}
        </Link>
      </p>
    </div>
  );
}
