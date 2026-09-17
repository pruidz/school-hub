import type { Metadata } from "next";
import Link from "next/link";

import { ka } from "@/lib/i18n/ka";

import { AuthCard } from "../_components/auth-card";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: ka.auth.joinTitle };

export default function JoinPage() {
  return (
    <AuthCard
      title={ka.auth.joinTitle}
      description={ka.auth.joinSubtitle}
      footer={
        <Link
          href="/kid-login"
          className="font-medium text-foreground underline underline-offset-4"
        >
          {ka.auth.kidBackToList}
        </Link>
      }
    >
      <JoinForm />
    </AuthCard>
  );
}
