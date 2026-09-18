/**
 * Types for the helper role.
 *
 * Migration 0010 adds one table (`helper_invitations`) and one view
 * (`helper_children`). `src/lib/db.types.ts` is generated and owned by A1, and
 * the Supabase project that would regenerate it does not exist yet, so the two
 * new relations are declared here and spliced onto `Database` locally. The
 * report that ships with this slice carries the exact block to paste into
 * `db.types.ts`; once it is there, delete `HelperDatabase` and `helperDb()` and
 * use the ordinary client.
 *
 * Pure types plus two pure parsers — safe to import anywhere.
 */

import type { Database, Json } from "@/lib/db.types";

/* -------------------------------------------------------------------------- */
/*  the two relations 0010 adds                                               */
/* -------------------------------------------------------------------------- */

export type HelperInvitationRow = {
  id: string;
  family_id: string;
  email: string;
  token: string;
  child_ids: string[];
  can_comment: boolean;
  can_review: boolean;
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type HelperInvitationInsert = {
  id?: string;
  family_id: string;
  email: string;
  token: string;
  child_ids: string[];
  can_comment?: boolean;
  can_review?: boolean;
  invited_by: string;
  expires_at: string;
  accepted_at?: string | null;
  accepted_by?: string | null;
  revoked_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type HelperChildRow = {
  id: string;
  family_id: string;
  name: string;
  grade: number | null;
  school: string | null;
  birth_date: string | null;
  avatar_url: string | null;
  color: string;
  is_active: boolean;
};

type PublicSchema = Database["public"];

export type HelperDatabase = Omit<Database, "public"> & {
  public: Omit<PublicSchema, "Tables" | "Views"> & {
    Tables: PublicSchema["Tables"] & {
      helper_invitations: {
        Row: HelperInvitationRow;
        Insert: HelperInvitationInsert;
        Update: Partial<HelperInvitationInsert>;
        Relationships: [];
      };
    };
    Views: PublicSchema["Views"] & {
      helper_children: {
        Row: HelperChildRow;
        Relationships: [];
      };
    };
  };
};

/* -------------------------------------------------------------------------- */
/*  the permissions jsonb                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `family_members.permissions` for a helper membership. The shape the SQL in
 * 0010 reads, written down once so the TypeScript side cannot drift from it.
 */
export type HelperPermissions = {
  children: string[];
  canComment: boolean;
  canReview: boolean;
  revokedAt: string | null;
};

export const EMPTY_HELPER_PERMISSIONS: HelperPermissions = {
  children: [],
  canComment: false,
  canReview: false,
  revokedAt: null,
};

/** Parse the jsonb column defensively — it is `Json`, not a checked shape. */
export function parseHelperPermissions(value: unknown): HelperPermissions {
  if (typeof value !== "object" || value === null) {
    return EMPTY_HELPER_PERMISSIONS;
  }
  const raw = value as Record<string, unknown>;
  const listed = Array.isArray(raw.children) ? raw.children : [];

  return {
    children: listed.filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    ),
    canComment: raw.can_comment === true,
    canReview: raw.can_review === true,
    revokedAt: typeof raw.revoked_at === "string" ? raw.revoked_at : null,
  };
}

/** The inverse. Written straight into `family_members.permissions`. */
export function serializeHelperPermissions(
  permissions: HelperPermissions,
): Json {
  const out: Record<string, Json> = {
    children: permissions.children,
    can_comment: permissions.canComment,
    can_review: permissions.canReview,
  };
  if (permissions.revokedAt) out.revoked_at = permissions.revokedAt;
  return out;
}

/* -------------------------------------------------------------------------- */
/*  view models                                                               */
/* -------------------------------------------------------------------------- */

export type HelperChildLite = { id: string; name: string; color: string };

/** One row on `/parent/helpers` — an accepted helper. */
export type HelperMember = {
  membershipId: string;
  userId: string;
  displayName: string;
  email: string | null;
  permissions: HelperPermissions;
  children: HelperChildLite[];
  /** True when `permissions.revoked_at` is set: kept for the record only. */
  isRevoked: boolean;
};

/** One row on `/parent/helpers` — an invitation that has not been taken up. */
export type HelperInvitation = {
  id: string;
  email: string;
  token: string;
  canComment: boolean;
  canReview: boolean;
  children: HelperChildLite[];
  expiresAt: string;
  isExpired: boolean;
  acceptedAt: string | null;
  revokedAt: string | null;
};

export type HelpersPageData = {
  familyId: string | null;
  familyChildren: HelperChildLite[];
  members: HelperMember[];
  invitations: HelperInvitation[];
};
