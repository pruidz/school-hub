import type { Metadata } from "next";
import Link from "next/link";
import { Compass, Home } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ka } from "@/lib/i18n/ka";

export const metadata: Metadata = { title: ka.errors.notFoundTitle };

/**
 * Root 404 — also what every `notFound()` inside `/kid/*` and `/parent/*`
 * renders, so the way out is `/`, which routes the signed-in user back to
 * their own home (`homePathForRole`) and everyone else to the landing page.
 */
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-muted">
        <Compass className="size-8 text-muted-foreground" aria-hidden />
      </span>

      <div className="grid gap-2">
        <h1 className="text-2xl font-bold tracking-tight">
          {ka.errors.notFoundTitle}
        </h1>
        <p className="text-base text-muted-foreground">
          {ka.errors.notFoundBody}
        </p>
      </div>

      <Button asChild size="lg" className="h-14 px-6 text-base">
        <Link href="/">
          <Home className="size-5" />
          {ka.errors.goHome}
        </Link>
      </Button>
    </main>
  );
}
