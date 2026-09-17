import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireParent } from "@/lib/auth/session";
import { ka } from "@/lib/i18n/ka";

import { AccountForm } from "./account-form";

export const metadata: Metadata = { title: ka.settings.title };

/**
 * P8 — account and appearance. Notifications and reports are phase 2/3, so the
 * page stays deliberately small and points at children management for
 * everything that is per-child.
 */
export default async function ParentSettingsPage() {
  const parent = await requireParent();

  return (
    <div className="grid max-w-3xl gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {ka.settings.title}
        </h1>
        <p className="text-sm text-muted-foreground">{ka.settings.subtitle}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{ka.settings.accountTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountForm
            displayName={parent.displayName}
            email={parent.email}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ka.settings.appearanceTitle}</CardTitle>
          <CardDescription>{ka.settings.themeLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ka.settings.childrenTitle}</CardTitle>
          <CardDescription>{ka.settings.childrenHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/parent/children">
              <Users />
              {ka.parent.manageChildren}
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ka.settings.laterTitle}</CardTitle>
          <CardDescription>{ka.settings.laterBody}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
