import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { homePathForRole, isAppRole, roleFromClaims, type AppRole } from "./roles";

export type SessionUser = {
  id: string;
  email: string | null;
  role: AppRole;
  displayName: string;
  avatarUrl: string | null;
};

export type ParentSession = SessionUser & {
  role: "parent" | "helper";
  /** `null` only in the broken state where the family row is missing. */
  familyId: string | null;
};

export type ChildSession = SessionUser & {
  role: "child";
  childId: string;
  familyId: string;
};

/**
 * The signed-in user plus their profile, or `null`.
 *
 * Always resolves the role from `app_metadata` (service-role-only, so the user
 * cannot forge it) and falls back to `profiles.role`. `cache()` dedupes the
 * lookup across a single render pass.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const role =
    roleFromClaims(user) ?? (isAppRole(profile?.role) ? profile.role : null);
  if (!role) return null;

  return {
    id: user.id,
    email: user.email ?? null,
    role,
    displayName: profile?.display_name ?? user.email ?? "",
    avatarUrl: profile?.avatar_url ?? null,
  };
});

/** Any signed-in user, or redirect to the sign-in screen. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Page-level guard for `/parent/*`. Middleware does the same check, but never
 * rely on it alone — a Server Component or action must re-verify.
 */
export const requireParent = cache(async (): Promise<ParentSession> => {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "parent" && user.role !== "helper") {
    redirect(homePathForRole(user.role));
  }

  const supabase = await createClient();

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  let familyId = membership?.family_id ?? null;

  if (!familyId) {
    const { data: owned } = await supabase
      .from("families")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1)
      .maybeSingle();
    familyId = owned?.id ?? null;
  }

  return { ...user, role: user.role, familyId };
});

/** Page-level guard for `/kid/*`. */
export const requireChild = cache(async (): Promise<ChildSession> => {
  const user = await getSessionUser();
  if (!user) redirect("/kid-login");
  if (user.role !== "child") redirect(homePathForRole(user.role));

  const supabase = await createClient();

  const { data: child } = await supabase
    .from("children")
    .select("id, family_id, name, avatar_url")
    .eq("profile_id", user.id)
    .maybeSingle();

  // A child auth user with no `children` row cannot do anything useful;
  // send them back through the invite flow.
  if (!child) redirect("/kid-login");

  return {
    ...user,
    role: "child",
    childId: child.id,
    familyId: child.family_id,
    displayName: child.name ?? user.displayName,
    avatarUrl: child.avatar_url ?? user.avatarUrl,
  };
});
