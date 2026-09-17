import type { Metadata } from "next";
import Link from "next/link";

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

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="underline underline-offset-4">
          {ka.auth.roleParent}
        </Link>
      </p>
    </div>
  );
}
