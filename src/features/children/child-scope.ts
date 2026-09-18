import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";

import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ChildUiMode } from "@/lib/db.types";

/**
 * Ownership guard for `/parent/children/[childId]/*`.
 *
 * Two things have to be true before a single row of that child's day is read:
 * the caller is a parent (or helper), and the id in the URL belongs to their
 * own family. The second check is delegated to RLS — the user-scoped client
 * simply cannot see a foreign `children` row — so "does not exist" and "not
 * yours" both come back as `null` and both become a 404. Rendering an empty
 * page instead would leak the fact that the id is real.
 *
 * `cache()` matters here: the layout and the page of the same request both call
 * this, and React dedupes them into one query.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ScopedChild = {
  id: string;
  name: string;
  color: string;
  grade: number | null;
  school: string | null;
  avatarUrl: string | null;
  uiMode: ChildUiMode;
  isActive: boolean;
};

export function isChildId(value: string): boolean {
  return UUID_RE.test(value);
}

export const requireFamilyChild = cache(
  async (childId: string): Promise<ScopedChild> => {
    await requireParent();

    // Postgres would reject a non-uuid with 22P02; catching it here keeps the
    // error log clean and the answer identical (404).
    if (!isChildId(childId)) notFound();

    const supabase = await createClient();
    const { data } = await supabase
      .from("children")
      .select("id, name, color, grade, school, avatar_url, ui_mode, is_active")
      .eq("id", childId)
      .maybeSingle();

    if (!data) notFound();

    return {
      id: data.id,
      name: data.name,
      color: data.color,
      grade: data.grade,
      school: data.school,
      avatarUrl: data.avatar_url,
      uiMode: data.ui_mode,
      isActive: data.is_active,
    };
  },
);
