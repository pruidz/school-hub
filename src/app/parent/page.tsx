import type { Metadata } from "next";
import Link from "next/link";

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
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: ka.parent.dashboardTitle };

/** Placeholder dashboard — the real P1 cards land with A3/A4. */
export default async function ParentDashboardPage() {
  const parent = await requireParent();

  const supabase = await createClient();
  const { data: childRows } = await supabase
    .from("children")
    .select("id, name, grade")
    .eq("is_active", true)
    .order("name", { ascending: true });

  const childList = childRows ?? [];

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {ka.parent.dashboardTitle}
        </h1>
        <p className="text-sm text-muted-foreground">
          {parent.displayName} · {ka.parent.dashboardSubtitle}
        </p>
      </header>

      {childList.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{ka.parent.noChildren}</CardTitle>
            <CardDescription>{ka.parent.comingSoon}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/parent/children">{ka.parent.addChild}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {childList.map((child) => (
            <Card key={child.id}>
              <CardHeader>
                <CardTitle>{child.name}</CardTitle>
                {child.grade ? (
                  <CardDescription>{child.grade}</CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {ka.parent.comingSoon}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
