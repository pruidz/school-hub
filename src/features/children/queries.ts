import "server-only";

import { cookies } from "next/headers";

import { ACTIVE_CHILD_COOKIE } from "@/lib/auth/active-child";
import { createClient } from "@/lib/supabase/server";
import type { Child, ChildUiMode } from "@/lib/db.types";

/**
 * Reads about children. Everything here goes through the user-scoped client,
 * so RLS already limits the rows to the caller's own family.
 */

/**
 * What a Client Component is allowed to know about a child.
 *
 * `children.*` carries `pin_hash` and `invite_code`; neither may cross to the
 * browser, so no route ever passes a raw `Child` row into a client component —
 * it passes this instead. The invite code is the one exception, and it is
 * handed over separately, only as the direct result of the parent pressing
 * "issue a code".
 */
export type ChildView = {
  id: string;
  name: string;
  grade: number | null;
  school: string | null;
  birthDate: string | null;
  avatarUrl: string | null;
  color: string;
  isActive: boolean;
  uiMode: ChildUiMode;
  showOwnStats: boolean;
  /** True once the child has redeemed an invite code and has their own login. */
  isLinked: boolean;
  /** Whether a code is outstanding — never the code itself. */
  hasInvite: boolean;
  inviteExpiresAt: string | null;
  inviteExpired: boolean;
  pinAttempts: number;
  /** `null` unless the lock is still in the future. */
  pinLockedUntil: string | null;
};

export function toChildView(child: Child): ChildView {
  const expiresAt = child.invite_expires_at;
  const inviteExpired =
    Boolean(expiresAt) && new Date(expiresAt as string).getTime() <= Date.now();
  const lockedUntil = child.pin_locked_until;
  const locked =
    Boolean(lockedUntil) && new Date(lockedUntil as string).getTime() > Date.now();

  return {
    id: child.id,
    name: child.name,
    grade: child.grade,
    school: child.school,
    birthDate: child.birth_date,
    avatarUrl: child.avatar_url,
    color: child.color,
    isActive: child.is_active,
    uiMode: child.ui_mode,
    showOwnStats: child.show_own_stats,
    isLinked: Boolean(child.profile_id),
    hasInvite: Boolean(child.invite_code),
    inviteExpiresAt: expiresAt,
    inviteExpired,
    pinAttempts: child.pin_attempts,
    pinLockedUntil: locked ? lockedUntil : null,
  };
}

/** Every child in the caller's family, archived ones last. */
export async function listChildren(): Promise<ChildView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("children")
    .select("*")
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  return (data ?? []).map(toChildView);
}

export async function getChildView(childId: string): Promise<ChildView | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("children")
    .select("*")
    .eq("id", childId)
    .maybeSingle();

  return data ? toChildView(data) : null;
}

/**
 * The subset of the child's own row that `/kid/*` needs.
 *
 * A child has SELECT on their own `children` row (`children_select_self`), so
 * this works with the ordinary user-scoped client — no service role, and a
 * sibling's row is not reachable even if an id were forged.
 */
export type KidProfile = {
  id: string;
  name: string;
  grade: number | null;
  school: string | null;
  avatarUrl: string | null;
  color: string;
  uiMode: ChildUiMode;
  showOwnStats: boolean;
};

export async function getKidProfile(
  childId: string,
): Promise<KidProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("children")
    .select("id, name, grade, school, avatar_url, color, ui_mode, show_own_stats")
    .eq("id", childId)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    grade: data.grade,
    school: data.school,
    avatarUrl: data.avatar_url,
    color: data.color,
    uiMode: data.ui_mode,
    showOwnStats: data.show_own_stats,
  };
}

export type ActiveChild = { id: string; name: string; color: string };

/**
 * Which child the parent screens are currently working on.
 *
 * The same `sh_active_child` cookie the shell's switcher writes (A2), so
 * `/parent/schedule`, `/parent/subjects` and the dashboard all agree. The
 * cookie is only a hint: the id is re-checked against the RLS-visible list
 * before it is used, and falls back to the first active child.
 */
export async function resolveActiveChild(
  preferredId?: string | null,
): Promise<{ active: ActiveChild | null; all: ActiveChild[] }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("children")
    .select("id, name, color")
    .eq("is_active", true)
    .order("name", { ascending: true });

  const all: ActiveChild[] = data ?? [];
  if (all.length === 0) return { active: null, all };

  const cookieStore = await cookies();
  const cookieId = cookieStore.get(ACTIVE_CHILD_COOKIE)?.value ?? null;

  const active =
    all.find((child) => child.id === preferredId) ??
    all.find((child) => child.id === cookieId) ??
    all[0];

  return { active, all };
}
