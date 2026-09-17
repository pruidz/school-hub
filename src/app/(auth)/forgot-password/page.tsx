import type { Metadata } from "next";
import Link from "next/link";

import { ka } from "@/lib/i18n/ka";

import { AuthCard } from "../_components/auth-card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: ka.auth.forgotTitle };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title={ka.auth.forgotTitle}
      description={ka.auth.forgotSubtitle}
      footer={
        <Link
          href="/login"
          className="font-medium text-foreground underline underline-offset-4"
        >
          {ka.auth.backToLogin}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
