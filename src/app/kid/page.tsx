import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireChild } from "@/lib/auth/session";
import { ka, t } from "@/lib/i18n/ka";

export const metadata: Metadata = { title: ka.nav.kidToday };

/** Placeholder home — the real "დღეს" screen is A3's `/kid/today`. */
export default async function KidHomePage() {
  const child = await requireChild();

  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-bold tracking-tight">
        {t("kid.homeGreeting", { name: child.displayName })}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{ka.kid.homeSubtitle}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-muted-foreground">{ka.kid.comingSoon}</p>
          <Button asChild size="lg" className="h-14 text-base">
            <Link href="/kid/today">{ka.nav.kidToday}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
