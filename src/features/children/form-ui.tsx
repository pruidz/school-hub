"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert, Loader2 } from "lucide-react";
import { cn } from "cn";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ka } from "@/lib/i18n/ka";

/**
 * Small client-side form atoms shared by the children, subjects and schedule
 * editors. They mirror the ones A2 built for the auth screens, which live
 * inside the `(auth)` route group and are not importable from here.
 */

/* -------------------------------------------------------------------------- */
/*  fields                                                                    */
/* -------------------------------------------------------------------------- */

export function TextField({
  name,
  label,
  error,
  hint,
  ...props
}: React.ComponentProps<typeof Input> & {
  name: string;
  label: string;
  error?: string;
  hint?: string;
}) {
  const id = React.useId();

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {hint && !error ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/** Submit button that spins while the surrounding `<form action>` is running. */
export function SubmitButton({
  children,
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending || props.disabled} className={className} {...props}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending ? ka.common.saving : children}
    </Button>
  );
}

/* -------------------------------------------------------------------------- */
/*  colour                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Preset palette for children and subjects. Chosen to stay distinguishable
 * against both the light and the dark background, and to survive being reduced
 * to a 4px stripe on the timetable grid.
 */
export const COLOR_PALETTE = [
  "#4f46e5",
  "#2563eb",
  "#0891b2",
  "#059669",
  "#65a30d",
  "#ca8a04",
  "#ea580c",
  "#dc2626",
  "#db2777",
  "#9333ea",
  "#64748b",
  "#0f172a",
] as const;

export const DEFAULT_CHILD_COLOR = "#4f46e5";
export const DEFAULT_SUBJECT_COLOR = "#64748b";

/**
 * Palette swatches plus a native colour input as the escape hatch. Publishes
 * the value through a hidden input so it works inside a plain `<form action>`.
 */
export function ColorField({
  name,
  label,
  defaultValue,
  onChange,
}: {
  name: string;
  label: string;
  defaultValue: string;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = React.useState(defaultValue);

  function pick(next: string) {
    setValue(next);
    onChange?.(next);
  }

  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap items-center gap-1.5">
        {COLOR_PALETTE.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => pick(color)}
            aria-label={color}
            aria-pressed={value.toLowerCase() === color.toLowerCase()}
            className={cn(
              "size-7 rounded-full border transition",
              value.toLowerCase() === color.toLowerCase()
                ? "ring-2 ring-ring ring-offset-2 ring-offset-background"
                : "hover:scale-110",
            )}
            style={{ backgroundColor: color }}
          />
        ))}
        <label className="ms-1 inline-flex size-7 cursor-pointer items-center justify-center rounded-full border">
          <span className="sr-only">{label}</span>
          <input
            type="color"
            value={value}
            onChange={(event) => pick(event.target.value)}
            className="size-5 cursor-pointer appearance-none border-0 bg-transparent p-0"
          />
        </label>
      </div>
    </div>
  );
}

/** A dot in the subject's / child's colour. */
export function ColorDot({
  color,
  className,
}: {
  color: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-3 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color }}
    />
  );
}
