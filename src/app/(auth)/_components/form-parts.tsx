"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldErrors } from "@/lib/auth/result";

/** Labelled input with inline validation text wired up for screen readers. */
export function Field({
  name,
  label,
  error,
  hint,
  className,
  ...props
}: React.ComponentProps<typeof Input> & {
  name: string;
  label: string;
  error?: string;
  hint?: string;
}) {
  const id = `field-${name}`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={className}
        {...props}
      />
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Form-level error banner. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function FormSuccess({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <Alert role="status">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/** Submit button that shows a spinner while the action is in flight. */
export function SubmitButton({
  children,
  pendingLabel,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="lg"
      disabled={pending || props.disabled}
      className={className}
      {...props}
    >
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

export function fieldError(
  fields: FieldErrors | undefined,
  name: string,
): string | undefined {
  return fields?.[name];
}
