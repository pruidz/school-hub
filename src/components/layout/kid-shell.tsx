"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

import { DeviceMemory } from "@/components/install/device-memory";
import { InstallHint } from "@/components/install/install-hint";
import { ka } from "@/lib/i18n/ka";

import { NotificationBell } from "@/features/notifications";

import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { isActivePath, kidNavItems } from "./nav-items";

/**
 * Mobile-first kid chrome: a fixed bottom tab bar with 64px targets, larger
 * type and high-contrast active states.
 *
 * Installed on a notched iPhone this is the whole window, so every edge is
 * padded with its safe-area inset: the header grows by the status bar, the tab
 * bar by the home indicator, and the sides by the notch in landscape. The
 * install hint sits at the top of the content, where it is read, and is gone
 * the moment the app is running standalone.
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
      <DeviceMemory />

      <header className="sticky top-0 z-30 border-b bg-background pt-safe">
        <div className="px-safe flex h-14 items-center gap-2">
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
        </div>
      </header>

      <main className="px-safe flex-1 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] text-base">
        <InstallHint className="mb-4" />
        {children}
      </main>

      <nav
        aria-label={ka.nav.mainNavigation}
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="px-safe mx-auto flex max-w-lg [--px-safe:0px]">
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
