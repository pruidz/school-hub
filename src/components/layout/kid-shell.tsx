"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

import { ka } from "@/lib/i18n/ka";

import { NotificationBell } from "@/features/notifications";

import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { isActivePath, kidNavItems } from "./nav-items";

/**
 * Mobile-first kid chrome: a fixed bottom tab bar with 64px targets, larger
 * type and high-contrast active states. Content gets bottom padding plus the
 * safe-area inset so nothing hides behind the bar on a notched phone.
 */
export function KidShell({
  displayName,
  avatarUrl,
  children,
}: {
  displayName: string;
  avatarUrl: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background px-4">
        <span className="truncate text-lg font-semibold">{displayName}</span>
        <div className="ms-auto flex items-center gap-1">
          <NotificationBell variant="kid" />
          <ThemeToggle />
          <UserMenu
            displayName={displayName}
            email={null}
            avatarUrl={avatarUrl}
          />
        </div>
      </header>

      <main className="flex-1 px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] text-base">
        {children}
      </main>

      <nav
        aria-label={ka.nav.mainNavigation}
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-lg">
          {kidNavItems.map((item) => {
            const active = isActivePath(pathname, item);
            const Icon = item.icon;

            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-semibold transition-colors",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-6", active && "stroke-[2.5]")} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
