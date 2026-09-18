"use client";

/**
 * The link the parent copies, plus the sentence explaining that nothing is
 * emailed. Same shape as the child's invite code panel, on purpose: it is the
 * same promise ("here is a secret, you deliver it") and a parent who has
 * already onboarded one child recognises it.
 */

import * as React from "react";
import { Copy, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ka } from "@/lib/i18n/ka";

export function InviteLink({ path }: { path: string }) {
  const field = React.useRef<HTMLInputElement>(null);

  // `window.location.origin` exists only in the browser, so the server renders
  // the relative path and the effect widens it in place. Writing to the DOM
  // node rather than to state keeps the markup identical across hydration
  // without a second render pass.
  React.useEffect(() => {
    if (field.current) field.current.value = `${window.location.origin}${path}`;
  }, [path]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(field.current?.value ?? path);
      toast.success(ka.helpers.linkCopied);
    } catch {
      toast.error(ka.errors.generic);
    }
  };

  const id = React.useId();

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{ka.helpers.linkLabel}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          ref={field}
          readOnly
          defaultValue={path}
          className="font-mono text-xs"
        />
        <Button type="button" variant="secondary" onClick={copy}>
          <Copy />
          {ka.common.copy}
        </Button>
      </div>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Mail className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          <strong className="font-medium">{ka.helpers.noEmailTitle}.</strong>{" "}
          {ka.helpers.noEmailBody}
        </span>
      </p>
    </div>
  );
}
