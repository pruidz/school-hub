import type { ReactNode } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { requireHelper } from "@/lib/auth/helper";
import { ka } from "@/lib/i18n/ka";

/**
 * The helper's own area.
 *
 * Why not the parent shell with the unusable items hidden:
 *
 *   - `ParentShell` renders `parentNavItems` and the child switcher. The
 *     switcher is fed from `children`, and migration 0010 gives a helper no
 *     policy on that table, so it would render empty — and every parent route
 *     behind those links (`/parent/children`, `/parent/subjects`,
 *     `/parent/schedule`, `/parent/reports`, `/parent/settings`) is built
 *     around `requireParent()` plus queries that return nothing for a helper.
 *     A helper would see six links, five of which lead to a blank screen with
 *     buttons that fail on click. "A control that then fails" is exactly the
 *     failure this role has to avoid: the person is a guest in someone else's
 *     family and every dead end reads as either a bug or a permission they are
 *     supposed to have.
 *   - Hiding items instead of removing routes puts the whole guarantee in the
 *     nav array. One future entry added without a role check and a helper is
 *     back on a parent page. Here the guarantee is structural: `/helper/*` only
 *     contains pages written for a helper.
 *   - The parent dashboard counts and the inbox aggregate across the family.
 *     Even correctly filtered, "2 of 5 waiting" leaks that the family has other
 *     children. A separate area never has to compute a family-wide number.
 *
 * The cost is that the review screen is written twice. It is worth it: the two
 * screens genuinely differ — a helper has no "edit assignment", no photo
 * upload, and possibly no decision at all.
 *
 * `/helper/invite/[token]` is deliberately OUTSIDE this route group: the person
 * opening it has no account yet, so it must not sit behind `requireHelper()`.
 */
export default async function HelperLayout({
  children,
}: {
  children: ReactNode;
}) {
  const helper = await requireHelper();

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-3">
          <Link href="/helper" className="font-semibold tracking-tight">
            {ka.auth.appName}
          </Link>
          <Badge variant="secondary">{ka.helpers.signedInAsHelper}</Badge>

          <div className="ms-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu
              displayName={helper.displayName}
              email={helper.email}
              avatarUrl={helper.avatarUrl}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
