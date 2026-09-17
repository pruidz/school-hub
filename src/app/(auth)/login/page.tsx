import type { Metadata } from "next";
import Link from "next/link";

import { ka } from "@/lib/i18n/ka";

import { AuthCard } from "../_components/auth-card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: ka.auth.loginTitle };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="grid gap-4">
      <AuthCard
        title={ka.auth.loginTitle}
        description={ka.auth.loginSubtitle}
        footer={
          <span>
            {ka.auth.noAccount}{" "}
            <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
              {ka.auth.signUp}
            </Link>
          </span>
        }
      >
        <LoginForm next={next} />

        <div className="mt-4 text-center text-sm">
          <Link
            href="/forgot-password"
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {ka.auth.forgotPassword}
          </Link>
        </div>
      </AuthCard>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/kid-login" className="underline underline-offset-4">
          {ka.auth.roleStudent}
        </Link>
      </p>
    </div>
  );
}
