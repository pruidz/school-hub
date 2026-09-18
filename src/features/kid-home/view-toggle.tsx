import Link from "next/link";
import { CalendarDays, Sun } from "lucide-react";

import { ka } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";

/**
 * დღე ⇄ კვირა (SPEC 4a).
 *
 * Two links, not a client-side switch: the two views are separate routes, so
 * the browser's back button does the obvious thing and the child can keep
 * either one as a home-screen shortcut. Each page states which side it is, so
 * nothing here needs `usePathname` — and therefore nothing here ships JS.
 */
export function ViewToggle({ current }: { current: "day" | "week" }) {
  return (
    <div
      role="group"
      className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
    >
      <Item
        href="/kid/today"
        label={ka.kid.viewDay}
        icon={<Sun className="size-4" />}
        active={current === "day"}
      />
      <Item
        href="/kid/week"
        label={ka.kid.viewWeek}
        icon={<CalendarDays className="size-4" />}
        active={current === "week"}
      />
    </div>
  );
}

function Item({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
