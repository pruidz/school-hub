"use client";

import * as React from "react";
import Link from "next/link";
import { Home, RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ka } from "@/lib/i18n/ka";

/**
 * Last boundary before Next's own error page.
 *
 * `/kid/*` and `/parent/*` have their own, but an error thrown by one of those
 * *layouts* (or by anything under `(auth)`) bubbles past them to here, so this
 * one cannot assume a role and offers `/` as the way out.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("route error", error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-muted">
        <TriangleAlert className="size-8 text-muted-foreground" aria-hidden />
      </span>

      <div className="grid gap-2">
        <h1 className="text-2xl font-bold tracking-tight">
          {ka.errors.pageTitle}
        </h1>
        <p className="text-base text-muted-foreground">{ka.errors.pageBody}</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" size="lg" className="h-14 px-6" onClick={reset}>
          <RotateCcw className="size-5" />
          {ka.common.retry}
        </Button>
        <Button asChild variant="outline" size="lg" className="h-14 px-6">
          <Link href="/">
            <Home className="size-5" />
            {ka.errors.goHome}
          </Link>
        </Button>
      </div>
    </main>
  );
}
