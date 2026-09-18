"use client";

/**
 * The two decisions a parent makes about a helper: which children, and what
 * they may do.
 *
 * Shared by the invite dialog and the edit dialog so the wording cannot drift.
 * The wording matters more than the markup here — "review" is the one right
 * that lets someone else decide a child's homework is finished, and a parent
 * has to understand that before they tick it, not after.
 */

import * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ka } from "@/lib/i18n/ka";

import type { HelperChildLite } from "./types";

export type GrantValue = {
  childIds: string[];
  canComment: boolean;
  canReview: boolean;
};

export function GrantFields({
  familyChildren,
  value,
  onChange,
  error,
}: {
  familyChildren: HelperChildLite[];
  value: GrantValue;
  onChange: (next: GrantValue) => void;
  error?: string | null;
}) {
  const toggleChild = (childId: string, checked: boolean) => {
    const next = checked
      ? [...value.childIds, childId]
      : value.childIds.filter((id) => id !== childId);
    onChange({ ...value, childIds: next });
  };

  return (
    <div className="grid gap-5">
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">
          {ka.helpers.childrenLabel}
        </legend>
        <p className="text-xs text-muted-foreground">
          {ka.helpers.childrenExplain}
        </p>

        <div className="grid gap-2 pt-1">
          {familyChildren.map((child) => (
            <label
              key={child.id}
              className="flex items-center gap-2.5 text-sm"
              htmlFor={`helper-child-${child.id}`}
            >
              <Checkbox
                id={`helper-child-${child.id}`}
                checked={value.childIds.includes(child.id)}
                onCheckedChange={(checked) =>
                  toggleChild(child.id, checked === true)
                }
              />
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: child.color }}
              />
              {child.name}
            </label>
          ))}
        </div>

        {error ? (
          <p className="text-xs font-medium text-destructive">{error}</p>
        ) : null}
      </fieldset>

      <Separator />

      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">
          {ka.helpers.permissionsLabel}
        </legend>

        {/* View is not a checkbox: it is the role. */}
        <div className="grid gap-0.5 rounded-md bg-muted/50 p-3">
          <p className="text-sm font-medium">{ka.helpers.permView}</p>
          <p className="text-xs text-muted-foreground">
            {ka.helpers.permViewExplain}
          </p>
        </div>

        <div className="flex items-start gap-2.5">
          <Checkbox
            id="helper-can-comment"
            checked={value.canComment}
            onCheckedChange={(checked) =>
              onChange({ ...value, canComment: checked === true })
            }
            className="mt-0.5"
          />
          <div className="grid gap-0.5">
            <Label htmlFor="helper-can-comment">{ka.helpers.permComment}</Label>
            <p className="text-xs text-muted-foreground">
              {ka.helpers.permCommentExplain}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <Checkbox
            id="helper-can-review"
            checked={value.canReview}
            onCheckedChange={(checked) =>
              onChange({ ...value, canReview: checked === true })
            }
            className="mt-0.5"
          />
          <div className="grid gap-0.5">
            <Label htmlFor="helper-can-review">
              {ka.helpers.permReview}
              <span className="ms-2 text-xs font-normal text-muted-foreground">
                {ka.helpers.permReviewOffHint}
              </span>
            </Label>
            <p className="text-xs text-muted-foreground">
              {ka.helpers.permReviewExplain}
            </p>
          </div>
        </div>
      </fieldset>

      <div className="grid gap-0.5 rounded-md border border-dashed p-3">
        <p className="text-xs font-medium">{ka.helpers.permNever}</p>
        <p className="text-xs text-muted-foreground">
          {ka.helpers.permNeverExplain}
        </p>
      </div>
    </div>
  );
}

/** One-line summary of a grant, for the list rows. */
export function grantSummary(grant: {
  canComment: boolean;
  canReview: boolean;
}): string {
  if (grant.canReview && grant.canComment) return ka.helpers.permSummaryReview;
  if (grant.canReview) return ka.helpers.permSummaryReviewOnly;
  if (grant.canComment) return ka.helpers.permSummaryComment;
  return ka.helpers.permSummaryView;
}
