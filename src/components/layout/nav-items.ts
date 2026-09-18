import {
  BookOpen,
  CalendarDays,
  Inbox,
  LayoutDashboard,
  ListChecks,
  ClipboardList,
  MessageCircle,
  Settings,
  Sun,
  TrendingUp,
  User,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

import { ka } from "@/lib/i18n/ka";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match the path exactly instead of by prefix (used for section roots). */
  exact?: boolean;
};

/**
 * Parent sidebar. Several targets are owned by other agents and do not exist
 * yet — that is expected; the links light up as those routes land.
 */
export const parentNavItems: NavItem[] = [
  { href: "/parent", label: ka.nav.dashboard, icon: LayoutDashboard, exact: true },
  { href: "/parent/inbox", label: ka.nav.inbox, icon: Inbox },
  { href: "/parent/chat", label: ka.nav.chat, icon: MessageCircle },
  { href: "/parent/assignments", label: ka.assignments.title, icon: ClipboardList },
  { href: "/parent/children", label: ka.nav.children, icon: Users },
  { href: "/parent/helpers", label: ka.helpers.title, icon: UserPlus },
  { href: "/parent/schedule", label: ka.nav.schedule, icon: CalendarDays },
  { href: "/parent/subjects", label: ka.nav.subjects, icon: BookOpen },
  { href: "/parent/reports", label: ka.nav.reports, icon: TrendingUp },
  { href: "/parent/settings", label: ka.nav.settings, icon: Settings },
];

/** Kid bottom tab bar. */
export const kidNavItems: NavItem[] = [
  { href: "/kid/today", label: ka.nav.kidToday, icon: Sun },
  { href: "/kid/assignments", label: ka.nav.kidAssignments, icon: ListChecks },
  { href: "/kid/chat", label: ka.nav.kidChat, icon: MessageCircle },
  { href: "/kid/me", label: ka.nav.kidMe, icon: User },
];

export function isActivePath(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
