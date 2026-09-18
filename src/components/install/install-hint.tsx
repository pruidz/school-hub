"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { ka } from "@/lib/i18n/ka";

import { ShareIcon } from "./share-icon";
import { useInstallTarget } from "./use-install-target";

/**
 * The nudge that turns the site into an app.
 *
 * On iOS there is no install API at all, so the hint simply points at the
 * share button and names the menu item — in English, because iOS has no
 * Georgian UI and that is the label the child will actually see. Everywhere
 * else the browser gives us `beforeinstallprompt`, which is a real button and
 * strictly better than instructions.
 *
 * It never renders when the app is already installed, and a dismissal is
 * remembered.
 */
export function InstallHint({ className }: { className?: string }) {
  const { target, dismiss } = useInstallTarget();

  if (target.kind === "none") return null;

  return (
    <section
      aria-label={ka.pwa.installTitle}
      className={cn(
        "relative rounded-xl border bg-muted/40 p-4 ps-4 pe-12 text-sm",
        className,
      )}
    >
      <p className="font-semibold">{ka.pwa.installTitle}</p>

      {target.kind === "ios" ? (
        <ol className="mt-2 grid gap-1.5 text-muted-foreground">
          <Step index={1}>
            {ka.pwa.installIosStep1}{" "}
            <ShareIcon className="inline-block size-[1.15em] align-[-0.2em] text-foreground" />
          </Step>
          <Step index={2}>{ka.pwa.installIosStep2}</Step>
        </ol>
      ) : (
        <div className="mt-2 grid gap-3">
          <p className="text-muted-foreground">{ka.pwa.installBody}</p>
          <Button
            type="button"
            size="lg"
            className="h-12 w-full sm:w-auto sm:justify-self-start"
            onClick={target.install}
          >
            {ka.pwa.installAction}
          </Button>
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={ka.pwa.installDismiss}
        className="absolute end-2 top-2 text-muted-foreground"
        onClick={dismiss}
      >
        <X />
      </Button>
    </section>
  );
}

function Step({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2">
      <span
        aria-hidden="true"
        className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-semibold text-foreground"
      >
        {index}
      </span>
      <span>{children}</span>
    </li>
  );
}
