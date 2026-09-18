import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelperInviteDialog } from "@/features/helpers/invite-dialog";
import { HelperList } from "@/features/helpers/helper-list";
import { getHelpersPageData } from "@/features/helpers/queries";
import { requireStrictParent } from "@/lib/auth/helper";
import { ka } from "@/lib/i18n/ka";

export const metadata: Metadata = { title: ka.helpers.title };

/**
 * P8 slice — the family's helpers.
 *
 * `requireStrictParent()`, not `requireParent()`. The latter admits a helper,
 * who would then see an empty page whose every button fails: RLS gives them no
 * `children` rows to pick from and no `helper_invitations` at all. Sending them
 * to their own area is the honest outcome.
 */
export default async function ParentHelpersPage() {
  await requireStrictParent();

  const { familyChildren, members, invitations } = await getHelpersPageData();
  const hasChildren = familyChildren.length > 0;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {ka.helpers.title}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {ka.helpers.subtitle}
          </p>
        </div>
        {hasChildren ? (
          <HelperInviteDialog familyChildren={familyChildren} />
        ) : null}
      </header>

      {!hasChildren ? (
        // Nothing to grant access to yet, so the invite form would produce an
        // invitation that names no child — which 0010 refuses at the check
        // constraint. Say so instead.
        <Card>
          <CardHeader>
            <CardTitle>{ka.children.empty}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {ka.children.emptyHint}
            </p>
          </CardContent>
        </Card>
      ) : (
        <HelperList
          familyChildren={familyChildren}
          members={members}
          invitations={invitations}
        />
      )}
    </div>
  );
}
