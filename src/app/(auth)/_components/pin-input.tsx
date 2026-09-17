"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 4-digit PIN entry. A single numeric input keeps the native phone keypad,
 * password-manager behaviour and screen-reader labelling intact, which a grid
 * of separate boxes does not.
 */
export function PinInput({
  name,
  label,
  value,
  onValueChange,
  autoFocus,
  disabled,
  error,
}: {
  name: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  error?: string;
}) {
  const id = `pin-${name}`;
  const errorId = `${id}-error`;

  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="text-base">
        {label}
      </Label>
      <Input
        id={id}
        name={name}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]*"
        maxLength={4}
        value={value}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) =>
          onValueChange(event.target.value.replace(/\D/g, "").slice(0, 4))
        }
        className="h-16 text-center font-mono text-3xl tracking-[0.6em]"
      />
      {error ? (
        <p id={errorId} className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
