"use server";

/**
 * Who is signed in on this device, in the shape `device-children` stores.
 *
 * `/kid-login` can only show a face if localStorage still has it, and iOS
 * clears storage for web apps that go unused. The session cookie and
 * localStorage do not expire together, so a child can easily end up signed in
 * with an empty device list — and the moment the session does end they would
 * be sent back to the invite-code flow, which needs a parent.
 *
 * Re-asserting the entry while the child is signed in makes the list
 * self-healing: any use of the app repairs it.
 */

import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type SignedInChild = {
  childId: string;
  name: string;
  avatarUrl: string | null;
  color: string | null;
};

export async function describeSignedInChild(): Promise<SignedInChild | null> {
  const user = await getSessionUser();
  if (!user || user.role !== "child") return null;

  // User-scoped client: a child has SELECT on their own `children` row, so
  // this needs no elevated key and cannot read anybody else's.
  const supabase = await createClient();
  const { data } = await supabase
    .from("children")
    .select("id, name, avatar_url, color")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!data) return null;

  return {
    childId: data.id,
    name: data.name,
    avatarUrl: data.avatar_url,
    color: data.color,
  };
}
