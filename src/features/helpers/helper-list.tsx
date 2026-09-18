"use client";

/**
 * The three lists on `/parent/helpers`: accepted helpers, invitations still
 * waiting, and people whose access was stopped.
 *
 * Client component because every row carries a confirm dialog and a copy
 * button; the data itself is fetched on the server and passed in.
 */

import * as React from "react";
import { Loader2, Link2, RotateCcw, UserMinus, XCircle } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ka, t } from "@/lib/i18n/ka";

import {
  removeHelperAction,
  restoreHelperAction,
  revokeHelperInvitationAction,
} from "./actions";
import { grantSummary } from "./grant-fields";
import { EditHelperTrigger, HelperInviteDialog } from "./invite-dialog";
import { InviteLink } from "./invite-link";
import { helperInvitePath } from "./routes";
import type {
  HelperChildLite,
  HelperInvitation,
  HelperMember,
} from "./types";

function ChildChips({ items }: { items: HelperChildLite[] }) {
  if (items.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">{ka.common.none}</span>
    );
  }
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((child) => (
        <Badge key={child.id} variant="secondary" className="gap-1.5 font-normal">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ backgroundColor: child.color }}
          />
          {child.name}
        </Badge>
      ))}
    </span>
  );
}

function useAction() {
  const [busy, setBusy] = React.useState(false);

  const run = async (
    fn: () => Promise<{ ok: boolean; message?: string }>,
    success: string,
  ) => {
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message ?? ka.errors.generic);
      return;
    }
    toast.success(success);
  };

  return { busy, run };
}

/* -------------------------------------------------------------------------- */

function MemberRow({
  member,
  familyChildren,
}: {
  member: HelperMember;
  familyChildren: HelperChildLite[];
}) {
  const { busy, run } = useAction();

  return (
    <li className="grid gap-3 border-b px-4 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {member.displayName || member.email || ka.messages.unknownAuthor}
          </span>
          {member.permissions.canReview ? (
            <Badge>{ka.helpers.permReview}</Badge>
          ) : null}
        </div>
        {member.email ? (
          <p className="text-xs text-muted-foreground">{member.email}</p>
        ) : null}
        <ChildChips items={member.children} />
        <p className="text-xs text-muted-foreground">
          {grantSummary(member.permissions)}
        </p>
      </div>

      <div className="flex items-center gap-1 justify-self-start sm:justify-self-end">
        <HelperInviteDialog
          familyChildren={familyChildren}
          trigger={<EditHelperTrigger />}
          mode={{
            kind: "member",
            userId: member.userId,
            name: member.displayName || member.email || "",
            value: {
              childIds: member.permissions.children,
              canComment: member.permissions.canComment,
              canReview: member.permissions.canReview,
            },
          }}
        />

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <UserMinus />}
              {ka.helpers.remove}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("helpers.removeConfirmTitle", {
                  name: member.displayName || member.email || "",
                })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {ka.helpers.removeConfirmBody}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{ka.common.cancel}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  void run(
                    () => removeHelperAction({ userId: member.userId }),
                    ka.helpers.removed,
                  )
                }
              >
                {ka.helpers.remove}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

function RemovedRow({ member }: { member: HelperMember }) {
  const { busy, run } = useAction();

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0">
      <div className="grid gap-1">
        <span className="text-sm">
          {member.displayName || member.email || ka.messages.unknownAuthor}
        </span>
        <ChildChips items={member.children} />
      </div>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() =>
          void run(
            () => restoreHelperAction({ userId: member.userId }),
            ka.helpers.restored,
          )
        }
      >
        {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
        {ka.helpers.restore}
      </Button>
    </li>
  );
}

function InvitationRow({
  invitation,
  familyChildren,
}: {
  invitation: HelperInvitation;
  familyChildren: HelperChildLite[];
}) {
  const { busy, run } = useAction();
  const [showLink, setShowLink] = React.useState(false);

  return (
    <li className="grid gap-3 border-b px-4 py-4 last:border-b-0">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{invitation.email}</span>
            <Badge variant={invitation.isExpired ? "destructive" : "outline"}>
              {invitation.isExpired
                ? ka.helpers.expired
                : ka.helpers.pendingBadge}
            </Badge>
          </div>
          <ChildChips items={invitation.children} />
          <p className="text-xs text-muted-foreground">
            {grantSummary(invitation)}
            {" · "}
            {t("helpers.expiresAt", {
              date: new Date(invitation.expiresAt).toLocaleDateString("ka-GE"),
            })}
          </p>
        </div>

        <div className="flex items-center gap-1 justify-self-start sm:justify-self-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowLink((value) => !value)}
          >
            <Link2 />
            {ka.helpers.linkLabel}
          </Button>

          <HelperInviteDialog
            familyChildren={familyChildren}
            trigger={<EditHelperTrigger />}
            mode={{
              kind: "invitation",
              invitationId: invitation.id,
              email: invitation.email,
              value: {
                childIds: invitation.children.map((child) => child.id),
                canComment: invitation.canComment,
                canReview: invitation.canReview,
              },
            }}
          />

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <XCircle />}
                {ka.helpers.revokeInvite}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{ka.helpers.revokeInvite}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("helpers.revokeInviteConfirm", { email: invitation.email })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{ka.common.cancel}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    void run(
                      () =>
                        revokeHelperInvitationAction({
                          invitationId: invitation.id,
                        }),
                      ka.helpers.revokedInvite,
                    )
                  }
                >
                  {ka.helpers.revokeInvite}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {showLink ? <InviteLink path={helperInvitePath(invitation.token)} /> : null}
    </li>
  );
}

/* -------------------------------------------------------------------------- */

export function HelperList({
  familyChildren,
  members,
  invitations,
}: {
  familyChildren: HelperChildLite[];
  members: HelperMember[];
  invitations: HelperInvitation[];
}) {
  const active = members.filter((member) => !member.isRevoked);
  const removed = members.filter((member) => member.isRevoked);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{ka.helpers.activeTitle}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {active.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">
              {ka.helpers.empty}
            </p>
          ) : (
            <ul className="grid">
              {active.map((member) => (
                <MemberRow
                  key={member.membershipId}
                  member={member}
                  familyChildren={familyChildren}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ka.helpers.pendingTitle}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {invitations.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">
              {ka.helpers.pendingEmpty}
            </p>
          ) : (
            <ul className="grid">
              {invitations.map((invitation) => (
                <InvitationRow
                  key={invitation.id}
                  invitation={invitation}
                  familyChildren={familyChildren}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {removed.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{ka.helpers.removedTitle}</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <ul className="grid">
              {removed.map((member) => (
                <RemovedRow key={member.membershipId} member={member} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
