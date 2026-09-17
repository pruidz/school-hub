"use client";

import * as React from "react";
import { Copy, KeyRound, RefreshCw, ShieldCheck, Ticket } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type { ChildUiMode } from "@/lib/db.types";
import { ka, t } from "@/lib/i18n/ka";
import { formatTimestamp } from "@/features/schedule/dates";

import {
  issueChildInviteCode,
  revokeChildInviteCode,
  unlockChildPin,
  updateChildPreferences,
} from "./actions";
import type { ChildView } from "./queries";

/**
 * The per-child panel: invite code, PIN lockout and the two UI preferences.
 *
 * Every write here lands on a column the child cannot touch (`invite_code`,
 * `pin_*`, `ui_mode`, `show_own_stats`), so all three cards call
 * parent-guarded Server Actions — there is no client-side Supabase write.
 */
export function ChildDetailPanel({ child }: { child: ChildView }) {
  return (
    <div className="grid gap-4">
      <InviteCodeCard child={child} />
      <PinLockCard child={child} />
      {/* Keyed on the stored values: when the server sends new ones the card
          remounts and its optimistic state starts from the truth again. */}
      <PreferencesCard
        key={`${child.id}:${child.uiMode}:${child.showOwnStats}`}
        child={child}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  invite code                                                               */
/* -------------------------------------------------------------------------- */

function InviteCodeCard({ child }: { child: ChildView }) {
  const [pending, startTransition] = React.useTransition();
  // The plaintext code exists only here, as the direct result of the parent
  // pressing the button. It is never fetched back into a page render.
  const [issued, setIssued] = React.useState<{
    code: string;
    expiresAt: string;
  } | null>(null);

  function issue() {
    startTransition(async () => {
      const result = await issueChildInviteCode(child.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setIssued(result.data);
      toast.success(ka.children.inviteIssued);
    });
  }

  function revoke() {
    startTransition(async () => {
      const result = await revokeChildInviteCode(child.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setIssued(null);
      toast.success(ka.children.inviteRevoked);
    });
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(ka.auth.inviteCodeCopied);
    } catch {
      toast.error(ka.errors.generic);
    }
  }

  const hasOutstanding = child.hasInvite && !child.inviteExpired;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ticket className="size-4" />
          {ka.children.inviteTitle}
        </CardTitle>
        <CardDescription>{ka.children.inviteExplain}</CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4">
        {issued ? (
          <div className="grid gap-2 rounded-lg border bg-muted/40 p-4">
            <code className="text-center font-mono text-4xl font-bold tracking-[0.35em] select-all">
              {issued.code}
            </code>
            <p className="text-center text-xs text-muted-foreground">
              {t("children.inviteExpiresAt", {
                date: formatTimestamp(issued.expiresAt),
              })}
            </p>
            <Button
              variant="outline"
              className="justify-self-center"
              onClick={() => copy(issued.code)}
            >
              <Copy />
              {ka.common.copy}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {hasOutstanding
              ? t("children.inviteExpiresAt", {
                  date: child.inviteExpiresAt
                    ? formatTimestamp(child.inviteExpiresAt)
                    : "—",
                })
              : child.inviteExpired
                ? ka.children.inviteExpiredLabel
                : ka.children.inviteNone}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={issue} disabled={pending}>
            <RefreshCw className={pending ? "animate-spin" : undefined} />
            {child.hasInvite || issued
              ? ka.children.inviteRegenerate
              : ka.children.inviteGenerate}
          </Button>
          {hasOutstanding || issued ? (
            <Button variant="outline" onClick={revoke} disabled={pending}>
              {ka.children.inviteRevoke}
            </Button>
          ) : null}
        </div>

        <Separator />

        <div className="grid gap-1">
          <p className="text-sm font-medium">{ka.children.forgotPinTitle}</p>
          <p className="text-sm text-muted-foreground">
            {ka.children.forgotPinExplain}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  PIN lockout                                                               */
/* -------------------------------------------------------------------------- */

function PinLockCard({ child }: { child: ChildView }) {
  const [pending, startTransition] = React.useTransition();

  function unlock() {
    startTransition(async () => {
      const result = await unlockChildPin(child.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(ka.children.pinUnlocked);
    });
  }

  const locked = child.pinLockedUntil !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" />
          {ka.children.pinTitle}
        </CardTitle>
        <CardDescription>{ka.children.pinUnlockExplain}</CardDescription>
      </CardHeader>

      <CardContent className="grid gap-3">
        {locked ? (
          <Alert variant="destructive">
            <AlertDescription>
              {t("children.pinLockedUntil", {
                time: formatTimestamp(child.pinLockedUntil as string),
              })}
            </AlertDescription>
          </Alert>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4" />
            {ka.children.pinNotLocked}
          </p>
        )}

        <p className="text-sm text-muted-foreground">
          {t("children.pinAttempts", { count: child.pinAttempts })}
        </p>

        <Button
          variant={locked ? "default" : "outline"}
          onClick={unlock}
          disabled={pending || (!locked && child.pinAttempts === 0)}
          className="justify-self-start"
        >
          {ka.children.pinUnlock}
        </Button>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  ui_mode + show_own_stats                                                  */
/* -------------------------------------------------------------------------- */

function PreferencesCard({ child }: { child: ChildView }) {
  const [pending, startTransition] = React.useTransition();
  // Optimistic: both controls are cheap toggles, so the switch should not wait
  // for a round trip. On failure the previous value is put back.
  const [uiMode, setUiMode] = React.useState<ChildUiMode>(child.uiMode);
  const [showStats, setShowStats] = React.useState(child.showOwnStats);

  function save(next: { uiMode: ChildUiMode; showOwnStats: boolean }) {
    const previous = { uiMode, showOwnStats: showStats };
    setUiMode(next.uiMode);
    setShowStats(next.showOwnStats);

    startTransition(async () => {
      const result = await updateChildPreferences({
        childId: child.id,
        ...next,
      });
      if (!result.ok) {
        setUiMode(previous.uiMode);
        setShowStats(previous.showOwnStats);
        toast.error(result.message);
        return;
      }
      toast.success(ka.children.prefsSaved);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ka.children.prefsTitle}</CardTitle>
        <CardDescription>{ka.children.uiModeExplain}</CardDescription>
      </CardHeader>

      <CardContent className="grid gap-5">
        <div className="grid gap-2">
          <Label>{ka.children.uiMode}</Label>
          <RadioGroup
            value={uiMode}
            onValueChange={(value) =>
              save({ uiMode: value as ChildUiMode, showOwnStats: showStats })
            }
            disabled={pending}
            className="flex gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="simple" id={`ui-simple-${child.id}`} />
              <Label htmlFor={`ui-simple-${child.id}`}>
                {ka.children.uiModeSimple}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="full" id={`ui-full-${child.id}`} />
              <Label htmlFor={`ui-full-${child.id}`}>
                {ka.children.uiModeFull}
              </Label>
            </div>
          </RadioGroup>
        </div>

        <Separator />

        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <Label htmlFor={`stats-${child.id}`}>
              {ka.children.showOwnStats}
            </Label>
            <p className="text-sm text-muted-foreground">
              {ka.children.showOwnStatsExplain}
            </p>
          </div>
          <Switch
            id={`stats-${child.id}`}
            checked={showStats}
            disabled={pending}
            onCheckedChange={(checked) =>
              save({ uiMode, showOwnStats: checked })
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
