import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AcceptSignedIn,
  AcceptWithNewAccount,
} from "@/features/helpers/accept-form";
import { grantSummary } from "@/features/helpers/grant-fields";
import { loadHelperInvitation } from "@/features/helpers/actions";
import { helperInvitePath } from "@/features/helpers/routes";
import { getSessionUser } from "@/lib/auth/session";
import { ka, t } from "@/lib/i18n/ka";

export const metadata: Metadata = { title: ka.helpers.acceptTitle };

/**
 * Redeeming a helper invitation.
 *
 * Deliberately outside the `(shell)` route group, so `requireHelper()` never
 * runs: the person opening this link usually has no account at all. The token
 * in the URL is the only credential, and it is checked server-side by
 * `loadHelperInvitation()` with the service role — the invitee has no RLS
 * policy on `helper_invitations` and is not supposed to.
 *
 * `/helper/*` is not matched by `isKidPath`/`isParentPath`, so the middleware
 * leaves an unauthenticated request alone. See the report: `canAccessPath()`
 * should learn about `/helper` before this ships, and this page must stay
 * excluded when it does.
 */
export default async function HelperInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [invitation, user] = await Promise.all([
    loadHelperInvitation(token),
    getSessionUser(),
  ]);

  if (!invitation.ok) {
    return (
      <Shell>
        <Alert variant="destructive">
          <AlertDescription>{invitation.message}</AlertDescription>
        </Alert>
        <Button asChild variant="ghost">
          <Link href="/login">{ka.auth.backToLogin}</Link>
        </Button>
      </Shell>
    );
  }

  const data = invitation.data;
  const signedInEmail = (user?.email ?? "").toLowerCase();
  const emailMatches = signedInEmail === data.email;

  return (
    <Shell>
      <Card>
        <CardHeader>
          <CardTitle>{ka.helpers.acceptTitle}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm">
            {t("helpers.acceptIntro", { family: data.familyName })}
          </p>

          <div className="grid gap-1 rounded-md bg-muted/50 p-3 text-sm">
            <p>
              {t("helpers.acceptForChildren", {
                names: data.childNames.join(", "),
              })}
            </p>
            <p>
              {t("helpers.acceptRights", { rights: grantSummary(data) })}
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            {ka.helpers.permViewExplain}{" "}
            {data.canReview ? ka.helpers.permReviewExplain : ""}
          </p>

          <Separator />

          {user && !emailMatches ? (
            <Alert variant="destructive">
              <AlertDescription>
                {t("helpers.errEmailMismatch", { email: data.email })}
              </AlertDescription>
            </Alert>
          ) : null}

          {user && emailMatches ? (
            <AcceptSignedIn token={token} email={data.email} />
          ) : null}

          {!user ? (
            <AcceptWithNewAccount token={token} email={data.email} />
          ) : null}

          {user && !emailMatches ? (
            <Button asChild variant="secondary">
              <Link
                href={`/login?next=${encodeURIComponent(helperInvitePath(token))}`}
              >
                {ka.helpers.acceptSignIn}
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto grid w-full max-w-md gap-4 px-4 py-10">
      {children}
    </main>
  );
}
