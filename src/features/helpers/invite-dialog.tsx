"use client";

/**
 * "Invite a helper" and "edit this helper" in one dialog — the fields are the
 * same grant either way, and keeping them together stops the two forms saying
 * different things about what `review` means.
 */

import * as React from "react";
import { Pencil, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/features/children/form-ui";
import { ka } from "@/lib/i18n/ka";

import {
  inviteHelperAction,
  updateHelperAction,
  updateHelperInvitationAction,
} from "./actions";
import { GrantFields, type GrantValue } from "./grant-fields";
import { InviteLink } from "./invite-link";
import type { HelperChildLite } from "./types";

type Mode =
  | { kind: "invite" }
  | { kind: "member"; userId: string; name: string; value: GrantValue }
  | { kind: "invitation"; invitationId: string; email: string; value: GrantValue };

const EMPTY: GrantValue = { childIds: [], canComment: true, canReview: false };

export function HelperInviteDialog({
  familyChildren,
  mode = { kind: "invite" },
  trigger,
}: {
  familyChildren: HelperChildLite[];
  mode?: Mode;
  trigger?: React.ReactNode;
}) {
  const initial = mode.kind === "invite" ? EMPTY : mode.value;

  const [open, setOpen] = React.useState(false);
  const [grant, setGrant] = React.useState<GrantValue>(initial);
  const [email, setEmail] = React.useState(
    mode.kind === "invitation" ? mode.email : "",
  );
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  /** Set once an invitation has been created: the link to copy. */
  const [createdPath, setCreatedPath] = React.useState<string | null>(null);

  // Reopening must not show the previous attempt. Done in the open/close
  // handler rather than in an effect: it is a reaction to an event, not
  // synchronisation with anything outside React.
  const setOpenAndReset = (next: boolean) => {
    setOpen(next);
    if (next) return;
    setGrant(initial);
    setError(null);
    setCreatedPath(null);
    if (mode.kind === "invite") setEmail("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      if (mode.kind === "invite") {
        const result = await inviteHelperAction({ ...grant, email });
        if (!result.ok) return setError(result.message);
        setCreatedPath(result.data.url);
        toast.success(ka.helpers.inviteCreated);
        return;
      }

      const result =
        mode.kind === "member"
          ? await updateHelperAction({ ...grant, userId: mode.userId })
          : await updateHelperInvitationAction({
              ...grant,
              invitationId: mode.invitationId,
            });

      if (!result.ok) return setError(result.message);
      toast.success(ka.helpers.saved);
      setOpenAndReset(false);
    } finally {
      setPending(false);
    }
  };

  const title =
    mode.kind === "invite" ? ka.helpers.inviteTitle : ka.helpers.editTitle;

  return (
    <Dialog open={open} onOpenChange={setOpenAndReset}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <UserPlus />
            {ka.helpers.invite}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode.kind === "invite"
              ? ka.helpers.inviteSubtitle
              : mode.kind === "member"
                ? mode.name
                : mode.email}
          </DialogDescription>
        </DialogHeader>

        {createdPath ? (
          <div className="grid gap-4">
            <InviteLink path={createdPath} />
            <DialogFooter>
              <Button type="button" onClick={() => setOpenAndReset(false)}>
                {ka.common.done}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-5" noValidate>
            <FormError message={error} />

            {mode.kind === "invite" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="helper-email">{ka.helpers.email}</Label>
                <Input
                  id="helper-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  placeholder={ka.helpers.emailPlaceholder}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {ka.helpers.emailExplain}
                </p>
              </div>
            ) : null}

            <GrantFields
              familyChildren={familyChildren}
              value={grant}
              onChange={setGrant}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpenAndReset(false)}
              >
                {ka.common.cancel}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending
                  ? ka.common.saving
                  : mode.kind === "invite"
                    ? ka.helpers.inviteSend
                    : ka.helpers.save}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The pencil trigger used on each row. */
export function EditHelperTrigger() {
  return (
    <Button variant="ghost" size="sm">
      <Pencil />
      {ka.common.edit}
    </Button>
  );
}
