"use client";

import * as React from "react";
import Link from "next/link";
import { Home, RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ka } from "@/lib/i18n/ka";

/**
 * Error boundary for every `/kid/*` screen.
 *
 * A child never sees the error itself — no message, no digest, no stack. They
 * get one big friendly retry and one way out. The real error goes to the
 * console so it is still recoverable from a device log.
 */
export default function KidError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("kid route error", error);
  }, [error]);

  return (
    <div className="grid min-h-[60vh] content-center justify-items-center gap-6 px-2 text-center">
      <span className="grid size-20 place-items-center rounded-full bg-muted">
        <TriangleAlert className="size-10 text-muted-foreground" aria-hidden />
      </span>

      <div className="grid gap-2">
        <h1 className="text-2xl font-bold">{ka.kid.errorTitle}</h1>
        <p className="text-base text-muted-foreground">{ka.kid.errorBody}</p>
      </div>

      <div className="grid w-full max-w-xs gap-3">
        <Button
          type="button"
          size="lg"
          className="h-16 w-full text-lg font-bold"
          onClick={reset}
        >
          <RotateCcw className="size-6" />
          {ka.kid.errorRetry}
        </Button>

        <Button
          asChild
          variant="outline"
          size="lg"
          className="h-14 w-full text-base"
        >
          <Link href="/kid/today">
            <Home className="size-5" />
            {ka.kid.errorHome}
          </Link>
        </Button>
      </div>
    </div>
  );
}
