"use server";

/**
 * Server Actions for the helper role.
 *
 * Two audiences in one file, separated by the guard each action opens with:
 *
 *   parent side   `guardParentWrite()` — never `requireParent()`, which admits
 *                 a helper. Inviting, editing and revoking are owner actions;
 *                 RLS (`family_members_update_parent`, the owner-only policy on
 *                 `helper_invitations`) enforces it, and the guard is what
 *                 turns the refusal into a Georgian sentence.
 *   invitee side  no guard at all before the token is checked, because the
 *                 person accepting has no membership yet. The token IS the
 *                 authorisation, and it is only ever compared here, with the
 *                 service role.
 *
 * Order everywhere: who is calling -> zod -> ownership lookup -> write.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { guardParentWrite } from "@/features/children/guards";
import { fail, ok, type ActionResult } from "@/lib/auth/result";
import { getSessionUser } from "@/lib/auth/session";
import { ka, t } from "@/lib/i18n/ka";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { helperDb } from "./db";
import { helperInvitePath } from "./routes";
import {
  generateHelperToken,
  helperInviteExpiryFrom,
  isWellFormedHelperToken,
} from "./token";
import {
  parseHelperPermissions,
  serializeHelperPermissions,
  type HelperPermissions,
} from "./types";

/* -------------------------------------------------------------------------- */
/*  schemas                                                                   */
/* -------------------------------------------------------------------------- */

const uuid = z.uuid();

const grantSchema = z.object({
  childIds: z
    .array(uuid)
    .min(1, { message: ka.helpers.childrenRequired })
    .max(50),
  canComment: z.boolean(),
  canReview: z.boolean(),
});

const inviteSchema = grantSchema.extend({
  email: z.email({ message: ka.validation.emailInvalid }),
});

const editInvitationSchema = grantSchema.extend({ invitationId: uuid });
const editMemberSchema = grantSchema.extend({ userId: uuid });
const memberSchema = z.object({ userId: uuid });
const invitationSchema = z.object({ invitationId: uuid });

const tokenSchema = z.object({
  token: z.string().refine(isWellFormedHelperToken, {
    message: ka.helpers.errInviteNotFound,
  }),
});

const signUpAndAcceptSchema = tokenSchema.extend({
  displayName: z.string().trim().min(2, { message: ka.validation.nameMin }),
  password: z.string().min(8, { message: ka.validation.passwordMin }),
  passwordConfirm: z.string(),
});

function revalidateHelpers() {
  revalidatePath("/parent/helpers");
}

function firstMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? ka.errors.generic;
}

/* -------------------------------------------------------------------------- */
/*  parent side                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Confirm every id in `childIds` is a child of the caller's family, through the
 * user-scoped client so RLS decides. An id that is not returns `null`, and the
 * action must not say which one — "not found" covers both cases.
 */
async function ownChildIds(childIds: string[]): Promise<string[] | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("children")
    .select("id")
    .in("id", childIds);

  const found = new Set((data ?? []).map((row) => row.id));
  if (found.size !== new Set(childIds).size) return null;
  return [...found];
}

export type HelperInviteResult = { invitationId: string; url: string };

/** Create a pending invitation and hand back the link for the parent to copy. */
export async function inviteHelperAction(
  input: unknown,
): Promise<ActionResult<HelperInviteResult>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return fail(firstMessage(parsed.error));

  const familyId = guard.value.familyId;
  if (!familyId) return fail(ka.errors.generic);

  const childIds = await ownChildIds(parsed.data.childIds);
  if (!childIds) return fail(ka.errors.notFound);

  const supabase = await createClient();
  const { data, error } = await helperDb(supabase)
    .from("helper_invitations")
    .insert({
      family_id: familyId,
      email: parsed.data.email.trim().toLowerCase(),
      token: generateHelperToken(),
      child_ids: childIds,
      can_comment: parsed.data.canComment,
      can_review: parsed.data.canReview,
      invited_by: guard.value.id,
      expires_at: helperInviteExpiryFrom().toISOString(),
    })
    .select("id, token")
    .single();

  if (error || !data) {
    console.error("helper invite failed", error?.code);
    return fail(ka.errors.generic);
  }

  revalidateHelpers();
  return ok({ invitationId: data.id, url: helperInvitePath(data.token) });
}

/** Change the children or the rights on an invitation that is still pending. */
export async function updateHelperInvitationAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = editInvitationSchema.safeParse(input);
  if (!parsed.success) return fail(firstMessage(parsed.error));

  const childIds = await ownChildIds(parsed.data.childIds);
  if (!childIds) return fail(ka.errors.notFound);

  const supabase = await createClient();
  const { data, error } = await helperDb(supabase)
    .from("helper_invitations")
    .update({
      child_ids: childIds,
      can_comment: parsed.data.canComment,
      can_review: parsed.data.canReview,
    })
    .eq("id", parsed.data.invitationId)
    .is("accepted_at", null)
    .select("id");

  if (error) {
    console.error("helper invite update failed", error.code);
    return fail(ka.errors.generic);
  }
  if (!data || data.length === 0) return fail(ka.errors.notFound);

  revalidateHelpers();
  return ok(null);
}

/** Kill a pending invitation. The link stops working on the next request. */
export async function revokeHelperInvitationAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = invitationSchema.safeParse(input);
  if (!parsed.success) return fail(ka.errors.notFound);

  const supabase = await createClient();
  const { data, error } = await helperDb(supabase)
    .from("helper_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.data.invitationId)
    .is("accepted_at", null)
    .select("id");

  if (error) {
    console.error("helper invite revoke failed", error.code);
    return fail(ka.errors.generic);
  }
  if (!data || data.length === 0) return fail(ka.errors.notFound);

  revalidateHelpers();
  return ok(null);
}

/** Read one helper membership through the user-scoped client. */
async function loadMembership(
  userId: string,
): Promise<{ id: string; permissions: HelperPermissions } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("family_members")
    .select("id, permissions")
    .eq("user_id", userId)
    .eq("role", "helper")
    .maybeSingle();

  if (!data) return null;
  return { id: data.id, permissions: parseHelperPermissions(data.permissions) };
}

async function writePermissions(
  membershipId: string,
  permissions: HelperPermissions,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("family_members")
    .update({ permissions: serializeHelperPermissions(permissions) })
    .eq("id", membershipId)
    .select("id");

  if (error) {
    console.error("helper permissions write failed", error.code);
    return false;
  }
  return Boolean(data && data.length > 0);
}

/** Change which children a helper sees, and what they may do. */
export async function updateHelperAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = editMemberSchema.safeParse(input);
  if (!parsed.success) return fail(firstMessage(parsed.error));

  const childIds = await ownChildIds(parsed.data.childIds);
  if (!childIds) return fail(ka.errors.notFound);

  const membership = await loadMembership(parsed.data.userId);
  if (!membership) return fail(ka.errors.notFound);

  const written = await writePermissions(membership.id, {
    children: childIds,
    canComment: parsed.data.canComment,
    canReview: parsed.data.canReview,
    revokedAt: membership.permissions.revokedAt,
  });
  if (!written) return fail(ka.errors.unauthorized);

  revalidateHelpers();
  return ok(null);
}

/**
 * Remove a helper.
 *
 * The membership row is stamped, not deleted. Deleting it would drop the person
 * out of `my_family_user_ids()`, and every message they ever posted would lose
 * its author name — "do not delete someone's words" applies to the byline too.
 * Every scope function in 0010 treats a stamped row as absent, so access stops
 * on the next statement either way.
 */
export async function removeHelperAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return fail(ka.errors.notFound);

  const membership = await loadMembership(parsed.data.userId);
  if (!membership) return fail(ka.errors.notFound);

  const written = await writePermissions(membership.id, {
    ...membership.permissions,
    revokedAt: new Date().toISOString(),
  });
  if (!written) return fail(ka.errors.unauthorized);

  revalidateHelpers();
  return ok(null);
}

/** Undo a removal. Refused when the grant no longer names a child. */
export async function restoreHelperAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return fail(ka.errors.notFound);

  const membership = await loadMembership(parsed.data.userId);
  if (!membership) return fail(ka.errors.notFound);

  const childIds = await ownChildIds(membership.permissions.children);
  if (!childIds || childIds.length === 0) {
    return fail(ka.helpers.childrenRequired);
  }

  const written = await writePermissions(membership.id, {
    ...membership.permissions,
    children: childIds,
    revokedAt: null,
  });
  if (!written) return fail(ka.errors.unauthorized);

  revalidateHelpers();
  return ok(null);
}

/* -------------------------------------------------------------------------- */
/*  invitee side                                                              */
/* -------------------------------------------------------------------------- */

type LoadedInvitation = {
  id: string;
  familyId: string;
  familyName: string;
  email: string;
  childIds: string[];
  childNames: string[];
  canComment: boolean;
  canReview: boolean;
};

/**
 * Resolve a token, with the service role because the invitee has no policy on
 * `helper_invitations` — they are not in the family yet, so no RLS predicate
 * could name them. Returns a Georgian reason rather than a boolean, because
 * "expired" and "already used" are different things to the person reading it.
 */
export async function loadHelperInvitation(
  rawToken: string,
): Promise<ActionResult<LoadedInvitation>> {
  const parsed = tokenSchema.safeParse({ token: rawToken });
  if (!parsed.success) return fail(ka.helpers.errInviteNotFound);

  const admin = createAdminClient();
  const { data: invitation } = await helperDb(admin)
    .from("helper_invitations")
    .select("*")
    .eq("token", parsed.data.token)
    .maybeSingle();

  if (!invitation) return fail(ka.helpers.errInviteNotFound);
  if (invitation.revoked_at) return fail(ka.helpers.errInviteRevoked);
  if (invitation.accepted_at) return fail(ka.helpers.errInviteUsed);
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return fail(ka.helpers.errInviteExpired);
  }

  const childIds = invitation.child_ids ?? [];
  if (childIds.length === 0) return fail(ka.helpers.errNoChildren);

  const [{ data: family }, { data: children }] = await Promise.all([
    admin.from("families").select("name").eq("id", invitation.family_id).maybeSingle(),
    admin.from("children").select("id, name").in("id", childIds),
  ]);

  return ok({
    id: invitation.id,
    familyId: invitation.family_id,
    familyName: family?.name ?? "",
    email: invitation.email,
    childIds,
    childNames: (children ?? []).map((row) => row.name),
    canComment: invitation.can_comment,
    canReview: invitation.can_review,
  });
}

/**
 * May this account become a helper?
 *
 * One account, one role. A user who already runs their own family would have to
 * give up `is_parent()` to gain `is_helper()`, and the two roles resolve
 * different families through `current_family_id()`; letting one account hold
 * both is a cross-family confusion waiting to happen. The honest answer is to
 * refuse and ask for a different address.
 */
async function accountMayBecomeHelper(
  userId: string,
): Promise<ActionResult<null>> {
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.role === "child") return fail(ka.helpers.errChildAccount);
  if (profile?.role === "helper") return ok(null);

  const [{ data: owned }, { data: parentMemberships }] = await Promise.all([
    admin.from("families").select("id").eq("owner_id", userId).limit(1),
    admin
      .from("family_members")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "parent")
      .limit(1),
  ]);

  const runsAFamily =
    (owned ?? []).length > 0 || (parentMemberships ?? []).length > 0;

  return runsAFamily ? fail(ka.helpers.errAlreadyParent) : ok(null);
}

/** Everything both acceptance paths do once the account exists. */
async function grantMembership(
  invitation: LoadedInvitation,
  userId: string,
): Promise<ActionResult<null>> {
  const admin = createAdminClient();

  const { error: profileError } = await admin
    .from("profiles")
    .update({ role: "helper" })
    .eq("id", userId);
  if (profileError) {
    console.error("helper profile role failed", profileError.code);
    return fail(ka.errors.generic);
  }

  // `app_metadata` is the unforgeable claim the middleware reads first.
  const { error: claimError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { role: "helper" },
  });
  if (claimError) console.error("helper role claim failed", claimError.code);

  const { error: memberError } = await admin.from("family_members").upsert(
    {
      family_id: invitation.familyId,
      user_id: userId,
      role: "helper",
      permissions: serializeHelperPermissions({
        children: invitation.childIds,
        canComment: invitation.canComment,
        canReview: invitation.canReview,
        revokedAt: null,
      }),
    },
    { onConflict: "family_id,user_id" },
  );
  if (memberError) {
    console.error("helper membership failed", memberError.code);
    return fail(ka.errors.generic);
  }

  // Stamping last: if anything above failed the invitation is still usable.
  const { error: stampError } = await helperDb(admin)
    .from("helper_invitations")
    .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
    .eq("id", invitation.id)
    .is("accepted_at", null);
  if (stampError) {
    console.error("helper invite stamp failed", stampError.code);
    return fail(ka.errors.generic);
  }

  revalidatePath("/parent/helpers");
  revalidatePath("/helper", "layout");
  return ok(null);
}

/** Accept while already signed in with the invited address. */
export async function acceptHelperInvitationAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = tokenSchema.safeParse(input);
  if (!parsed.success) return fail(ka.helpers.errInviteNotFound);

  const loaded = await loadHelperInvitation(parsed.data.token);
  if (!loaded.ok) return loaded;

  const user = await getSessionUser();
  if (!user) return fail(ka.errors.sessionExpired);

  if ((user.email ?? "").toLowerCase() !== loaded.data.email) {
    return fail(t("helpers.errEmailMismatch", { email: loaded.data.email }));
  }

  const eligible = await accountMayBecomeHelper(user.id);
  if (!eligible.ok) return eligible;

  return grantMembership(loaded.data, user.id);
}

/**
 * Create the account the invitation was addressed to, then accept.
 *
 * Signing up through `/signup` would not work: that flow creates a family and a
 * parent profile, which `accountMayBecomeHelper()` then (correctly) refuses. A
 * helper is created here instead, with `app_metadata.role = 'helper'` so the
 * `handle_new_user` trigger writes the right profile from the start.
 */
export async function signUpAndAcceptHelperAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = signUpAndAcceptSchema.safeParse(input);
  if (!parsed.success) return fail(firstMessage(parsed.error));
  if (parsed.data.password !== parsed.data.passwordConfirm) {
    return fail(ka.validation.passwordsDoNotMatch);
  }

  const loaded = await loadHelperInvitation(parsed.data.token);
  if (!loaded.ok) return loaded;

  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: loaded.data.email,
    password: parsed.data.password,
    email_confirm: true,
    app_metadata: { role: "helper" },
    user_metadata: { display_name: parsed.data.displayName },
  });

  if (error || !created.user) {
    if (error?.code === "email_exists" || error?.status === 422) {
      return fail(ka.helpers.errEmailTaken);
    }
    console.error("helper signup failed", error?.code);
    return fail(ka.errors.generic);
  }

  const granted = await grantMembership(loaded.data, created.user.id);
  if (!granted.ok) return granted;

  // Sign them in on the cookie-bound client so the redirect lands somewhere.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: loaded.data.email,
    password: parsed.data.password,
  });
  if (signInError) {
    // The grant is done; they can sign in by hand.
    console.error("helper auto sign-in failed", signInError.code);
  }

  return ok(null);
}
