"use client";

import * as React from "react";
import Link from "next/link";
import { LayoutDashboard, RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ka, t } from "@/lib/i18n/ka";

/**
 * Error boundary for every `/parent/*` screen.
 *
 * The parent gets a retry, a way back to the dashboard and the `digest` — the
 * id the server logged this failure under — but never the message or the
 * stack, which can carry query and row detail.
 */
export default function ParentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("parent route error", error);
  }, [error]);

  return (
    <div className="grid min-h-[50vh] content-center justify-items-center gap-5 px-2 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-muted">
        <TriangleAlert className="size-7 text-muted-foreground" aria-hidden />
      </span>

      <div className="grid gap-2">
        <h1 className="text-xl font-semibold tracking-tight">
          {ka.errors.pageTitle}
        </h1>
        <p className="text-sm text-muted-foreground">{ka.errors.pageBody}</p>
        {error.digest ? (
          <p className="font-mono text-xs text-muted-foreground">
            {t("errors.reference", { code: error.digest })}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" onClick={reset}>
          <RotateCcw />
          {ka.common.retry}
        </Button>
        <Button asChild variant="outline">
          <Link href="/parent">
            <LayoutDashboard />
            {ka.errors.backToDashboard}
          </Link>
        </Button>
      </div>
    </div>
  );
}
