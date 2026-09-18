"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

import { ka } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";

/**
 * P4's tab strip.
 *
 * The three tabs that belong to this screen are plain links, so each one is a
 * fresh Server Component render and the whole page stays shareable and
 * reloadable. The last two only forward: `/parent/schedule` and
 * `/parent/reports` already exist and both read the active-child cookie rather
 * than a query string, so the link goes through a route handler that flips the
 * cookie and redirects.
 *
 * Those two are ordinary `<a>` elements on purpose. `<Link>` may prefetch, and
 * prefetching a GET that writes a cookie would silently switch the parent's
 * active child from a hover.
 */
export function ChildTabs({ childId }: { childId: string }) {
  const pathname = usePathname();
  const base = `/parent/children/${childId}`;

  const tabs = [
    { href: base, label: ka.children.pageTabToday, exact: true },
    {
      href: `${base}/assignments`,
      label: ka.children.pageTabAssignments,
      exact: false,
    },
    {
      href: `${base}/history`,
      label: ka.children.pageTabHistory,
      exact: false,
    },
  ];

  const forwards = [
    { href: `${base}/schedule`, label: ka.children.pageTabSchedule },
    { href: `${base}/reports`, label: ka.children.pageTabReports },
  ];

  return (
    <nav
      aria-label={ka.children.pageOpen}
      className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      <ul className="flex w-max min-w-full items-center gap-1 border-b">
        {tabs.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex items-center border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}

        {forwards.map((tab) => (
          <li key={tab.href}>
            <a
              href={tab.href}
              className="-mb-px inline-flex items-center gap-1 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
            >
              {tab.label}
              <ArrowUpRight aria-hidden className="size-3.5" />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
