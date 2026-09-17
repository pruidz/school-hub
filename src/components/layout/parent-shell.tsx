"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ka } from "@/lib/i18n/ka";

import { ChildSwitcher, type SwitchableChild } from "./child-switcher";
import { isActivePath, parentNavItems } from "./nav-items";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label={ka.nav.mainNavigation} className="grid gap-1 p-2">
      {parentNavItems.map((item) => {
        const active = isActivePath(pathname, item);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Desktop-first parent chrome: a persistent sidebar from `md` up, collapsing to
 * a top bar plus a slide-over sheet on narrow screens.
 */
export function ParentShell({
  displayName,
  email,
  avatarUrl,
  childList,
  activeChildId,
  children,
}: {
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  childList: SwitchableChild[];
  activeChildId: string | null;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <div className="flex min-h-full flex-1">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-14 items-center px-4">
          <Link href="/parent" className="font-semibold tracking-tight">
            {ka.auth.appName}
          </Link>
        </div>
        <NavLinks />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label={ka.nav.openMenu}
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar p-0">
              <SheetHeader className="h-14 justify-center px-4">
                <SheetTitle className="text-base">{ka.auth.appName}</SheetTitle>
              </SheetHeader>
              <NavLinks onNavigate={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>

          <ChildSwitcher items={childList} activeChildId={activeChildId} />

          <div className="ms-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu
              displayName={displayName}
              email={email}
              avatarUrl={avatarUrl}
            />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
