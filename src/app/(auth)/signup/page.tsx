import type { Metadata } from "next";
import Link from "next/link";

import { ka } from "@/lib/i18n/ka";

import { AuthCard } from "../_components/auth-card";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: ka.auth.signUpTitle };

export default function SignupPage() {
  return (
    <AuthCard
      title={ka.auth.signUpTitle}
      description={ka.auth.signUpSubtitle}
      footer={
        <span>
          {ka.auth.hasAccount}{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline underline-offset-4"
          >
            {ka.auth.signIn}
          </Link>
        </span>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}
