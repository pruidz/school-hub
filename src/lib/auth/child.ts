"use server";

/**
 * Child authentication: invite code -> PIN -> long-lived Supabase session.
 *
 * Threat model and mitigations:
 *  - The service-role key and the derived child password never reach a
 *    browser. Everything here runs in a Server Action.
 *  - A PIN is only ever hashed (scrypt, per-row salt) and compared in constant
 *    time. PINs and passwords are never logged.
 *  - 4 digits is weak on purpose, so the row-level counter caps it at 5 wrong
 *    tries, then locks the child out for 15 minutes.
 *  - Invite codes are single use, expire after 7 days and are cleared the
 *    moment they are redeemed.
 */

import { headers } from "next/headers";
import { z } from "zod";

import { ka, t } from "@/lib/i18n/ka";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import {
  generateInviteCodeValue,
  inviteCodeExpiryFrom,
  isWellFormedInviteCode,
  normalizeInviteCode,
} from "./codes";
import { childAuthEmail, childAuthPassword, hashPin, verifyPin } from "./pin";
import { clientIpFrom, rateLimit, resetRateLimit } from "./rate-limit";
import { fail, ok, type ActionResult } from "./result";
import { getSessionUser } from "./session";

/* -------------------------------------------------------------------------- */
/*  constants                                                                 */
/* -------------------------------------------------------------------------- */

const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;

/** Shape the browser is allowed to know about a child. */
export type ChildIdentity = {
  childId: string;
  name: string;
  avatarUrl: string | null;
  color: string | null;
};

/* -------------------------------------------------------------------------- */
/*  schemas                                                                   */
/* -------------------------------------------------------------------------- */

const uuidSchema = z.uuid();

const codeSchema = z
  .string()
  .trim()
  .transform(normalizeInviteCode)
  .refine(isWellFormedInviteCode, { message: ka.validation.codeLength });

const pinSchema = z
  .string()
  .regex(/^\d{4}$/, { message: ka.validation.pinDigits });

const lookupSchema = z.object({ code: codeSchema });

const redeemSchema = z
  .object({
    code: codeSchema,
    pin: pinSchema,
    pinConfirm: pinSchema,
  })
  .refine((value) => value.pin === value.pinConfirm, {
    message: ka.validation.pinsDoNotMatch,
    path: ["pinConfirm"],
  });

const signInSchema = z.object({
  childId: uuidSchema,
  pin: pinSchema,
});

/* -------------------------------------------------------------------------- */
/*  parent side: invite codes                                                 */
/* -------------------------------------------------------------------------- */

export type InviteCode = { code: string; expiresAt: string };

/**
 * Issue a fresh single-use invite code for one of the caller's own children.
 * Called from the parent settings screens (owned by other agents).
 *
 * This doubles as PIN recovery: issuing a code to a child who already has an
 * account lets them redeem it and choose a new PIN, with the parent — not the
 * child — as the authority that authorises the reset.
 */
export async function generateInviteCode(
  childId: string,
): Promise<ActionResult<InviteCode>> {
  const parsed = uuidSchema.safeParse(childId);
  if (!parsed.success) return fail(ka.errors.notFound);

  const user = await getSessionUser();
  if (!user) return fail(ka.errors.unauthorized);
  if (user.role !== "parent" && user.role !== "helper") {
    return fail(ka.errors.unauthorized);
  }

  // Read through the user-scoped client first: RLS proves the child belongs to
  // this parent's family before the service-role client touches the row.
  const supabase = await createClient();
  const { data: child } = await supabase
    .from("children")
    .select("id, profile_id")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!child) return fail(ka.errors.notFound);

  const admin = createAdminClient();
  const expiresAt = inviteCodeExpiryFrom().toISOString();

  // `children.invite_code` is unique; retry on the (very unlikely) collision.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateInviteCodeValue();
    const { error } = await admin
      .from("children")
      .update({ invite_code: code, invite_expires_at: expiresAt })
      .eq("id", parsed.data);

    if (!error) return ok({ code, expiresAt });
    if (error.code !== "23505") {
      console.error("generateInviteCode failed", error.code);
      return fail(ka.errors.generic);
    }
  }

  return fail(ka.errors.generic);
}

/** Revoke the outstanding code without issuing a new one. */
export async function revokeInviteCode(
  childId: string,
): Promise<ActionResult<null>> {
  const parsed = uuidSchema.safeParse(childId);
  if (!parsed.success) return fail(ka.errors.notFound);

  const user = await getSessionUser();
  if (!user || (user.role !== "parent" && user.role !== "helper")) {
    return fail(ka.errors.unauthorized);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("children")
    .update({ invite_code: null, invite_expires_at: null })
    .eq("id", parsed.data);

  if (error) return fail(ka.errors.generic);
  return ok(null);
}

/* -------------------------------------------------------------------------- */
/*  child side: join with an invite code                                      */
/* -------------------------------------------------------------------------- */

async function throttle(
  scope: string,
  limit: number,
  windowMs: number,
): Promise<string | null> {
  const key = `${scope}:${clientIpFrom(await headers())}`;
  const { allowed } = rateLimit(key, limit, windowMs);
  return allowed ? key : null;
}

async function findChildByCode(code: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("children")
    .select(
      "id, name, avatar_url, color, profile_id, invite_expires_at, is_active",
    )
    .eq("invite_code", code)
    .maybeSingle();

  if (error) {
    console.error("invite lookup failed", error.code);
    return { ok: false as const, error: ka.errors.generic };
  }
  if (!data) return { ok: false as const, error: ka.auth.inviteInvalid };
  if (data.is_active === false) {
    return { ok: false as const, error: ka.auth.inviteInvalid };
  }
  // `profile_id` may already be set: a parent re-issues a code when a child
  // forgets their PIN, and redeeming it then resets the PIN on the same user.

  const expiresAt = data.invite_expires_at;
  if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
    return { ok: false as const, error: ka.auth.inviteExpired };
  }

  return { ok: true as const, row: data };
}

/** Step 1 of `/join` — validate the code and show the child who they are. */
export async function lookupInviteCode(
  input: unknown,
): Promise<ActionResult<{ name: string; avatarUrl: string | null }>> {
  const parsed = lookupSchema.safeParse(input);
  if (!parsed.success) return fail(ka.auth.inviteInvalid);

  if (!(await throttle("invite-lookup", 15, 10 * 60_000))) {
    return fail(ka.errors.tooManyRequests);
  }

  const found = await findChildByCode(parsed.data.code);
  if (!found.ok) return fail(found.error);

  return ok({ name: found.row.name, avatarUrl: found.row.avatar_url });
}

/**
 * Step 2 of `/join` — set the PIN, provision the child's Supabase user and
 * sign them in on this device.
 */
export async function redeemInviteCode(
  input: unknown,
): Promise<ActionResult<ChildIdentity>> {
  const parsed = redeemSchema.safeParse(input);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    const first =
      flat.fieldErrors.pinConfirm?.[0] ??
      flat.fieldErrors.pin?.[0] ??
      flat.fieldErrors.code?.[0] ??
      ka.errors.generic;
    return fail(first);
  }

  const throttleKey = await throttle("invite-redeem", 10, 10 * 60_000);
  if (!throttleKey) return fail(ka.errors.tooManyRequests);

  const found = await findChildByCode(parsed.data.code);
  if (!found.ok) return fail(found.error);

  const child = found.row;
  const admin = createAdminClient();
  const email = childAuthEmail(child.id);
  const password = childAuthPassword(child.id);

  // Provision the auth user. The password is derived, never stored, never sent
  // to the client — the PIN is what unlocks the ability to derive it later.
  let userId: string | null = child.profile_id;

  if (!userId) {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: child.name },
      app_metadata: { role: "child", child_id: child.id },
    });

    if (created.data.user) {
      userId = created.data.user.id;
    } else if (created.error?.code === "email_exists") {
      // A previous attempt died between creating the user and linking the row.
      // The password is deterministic, so the id can be recovered by using it.
      const recovery = await admin.auth.signInWithPassword({ email, password });
      userId = recovery.data.user?.id ?? null;
    }

    if (!userId) {
      console.error("child user provisioning failed", created.error?.code);
      return fail(ka.errors.generic);
    }
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      role: "child",
      display_name: child.name,
      avatar_url: child.avatar_url,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    console.error("child profile upsert failed", profileError.code);
    return fail(ka.errors.generic);
  }

  // Link, set the PIN and burn the invite code in one statement. Matching on
  // the code itself makes a replayed submission a no-op: the second write
  // finds no row because the first one already cleared it.
  const { data: linked, error: linkError } = await admin
    .from("children")
    .update({
      profile_id: userId,
      pin_hash: hashPin(parsed.data.pin),
      pin_attempts: 0,
      pin_locked_until: null,
      invite_code: null,
      invite_expires_at: null,
    })
    .eq("id", child.id)
    .eq("invite_code", parsed.data.code)
    .select("id")
    .maybeSingle();

  if (linkError || !linked) {
    console.error("child link failed", linkError?.code);
    return fail(ka.auth.inviteUsed);
  }

  const supabase = await createClient({ longLived: true });
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    console.error("child sign-in after join failed", signInError.code);
    return fail(ka.errors.generic);
  }

  resetRateLimit(throttleKey);

  return ok({
    childId: child.id,
    name: child.name,
    avatarUrl: child.avatar_url,
    color: child.color,
  });
}

/* -------------------------------------------------------------------------- */
/*  child side: PIN sign-in                                                   */
/* -------------------------------------------------------------------------- */

function minutesUntil(iso: string): number {
  return Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000));
}

/**
 * Sign a child in from `/kid-login`. `childId` comes from this device's
 * localStorage; it is an identifier, not a secret — the PIN plus the row-level
 * lockout is the actual gate.
 */
export async function signInChildWithPin(
  input: unknown,
): Promise<ActionResult<ChildIdentity>> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return fail(ka.validation.pinDigits);

  const { childId, pin } = parsed.data;

  const throttleKey = await throttle(`pin:${childId}`, 20, 15 * 60_000);
  if (!throttleKey) return fail(ka.errors.tooManyRequests);

  const admin = createAdminClient();
  const { data: child, error } = await admin
    .from("children")
    .select(
      "id, name, avatar_url, color, profile_id, pin_hash, pin_attempts, pin_locked_until, is_active",
    )
    .eq("id", childId)
    .maybeSingle();

  if (error) {
    console.error("pin sign-in lookup failed", error.code);
    return fail(ka.errors.generic);
  }
  if (!child || child.is_active === false) return fail(ka.errors.notFound);
  if (!child.profile_id || !child.pin_hash) return fail(ka.auth.inviteInvalid);

  if (child.pin_locked_until) {
    const lockedUntil = new Date(child.pin_locked_until).getTime();
    if (lockedUntil > Date.now()) {
      return fail(
        t("auth.pinLocked", { minutes: minutesUntil(child.pin_locked_until) }),
      );
    }
  }

  if (!verifyPin(pin, child.pin_hash)) {
    const attempts = (child.pin_attempts ?? 0) + 1;

    if (attempts >= MAX_PIN_ATTEMPTS) {
      const lockedUntil = new Date(
        Date.now() + PIN_LOCK_MINUTES * 60_000,
      ).toISOString();
      await admin
        .from("children")
        .update({ pin_attempts: 0, pin_locked_until: lockedUntil })
        .eq("id", child.id);
      return fail(t("auth.pinLocked", { minutes: PIN_LOCK_MINUTES }));
    }

    await admin
      .from("children")
      .update({ pin_attempts: attempts })
      .eq("id", child.id);

    return fail(
      `${ka.auth.pinWrong}. ${t("auth.pinAttemptsLeft", {
        count: MAX_PIN_ATTEMPTS - attempts,
      })}`,
    );
  }

  const email = childAuthEmail(child.id);
  const password = childAuthPassword(child.id);

  const supabase = await createClient({ longLived: true });
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    console.error("child sign-in failed", signInError.code);
    return fail(ka.errors.generic);
  }

  await admin
    .from("children")
    .update({ pin_attempts: 0, pin_locked_until: null })
    .eq("id", child.id);

  resetRateLimit(throttleKey);

  return ok({
    childId: child.id,
    name: child.name,
    avatarUrl: child.avatar_url,
    color: child.color,
  });
}

/**
 * Refresh the names/avatars shown on `/kid-login` for the children this device
 * remembers. Returns only display data, and silently drops unknown ids.
 */
export async function describeChildrenForDevice(
  childIds: unknown,
): Promise<ActionResult<ChildIdentity[]>> {
  const parsed = z.array(uuidSchema).max(10).safeParse(childIds);
  if (!parsed.success) return fail(ka.errors.generic);
  if (parsed.data.length === 0) return ok([]);

  // Unauthenticated and backed by the service role, so it gets the same kind of
  // throttle as the other two: without one it is a free oracle for "is this
  // uuid a child, and what are they called". Guessing a v4 uuid is hopeless,
  // but the endpoint should still not be hammerable. A shared family tablet
  // calls this once per `/kid-login` visit.
  if (!(await throttle("device-children", 60, 10 * 60_000))) {
    return fail(ka.errors.tooManyRequests);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("children")
    .select("id, name, avatar_url, color, profile_id, is_active")
    .in("id", parsed.data);

  // On failure the caller keeps its cached list rather than wiping it.
  if (error || !data) return fail(ka.errors.generic);

  return ok(
    data
      .filter(
        (row): row is typeof row & { profile_id: string } =>
          Boolean(row.profile_id) && row.is_active !== false,
      )
      .map((row) => ({
        childId: row.id,
        name: row.name,
        avatarUrl: row.avatar_url,
        color: row.color,
      })),
  );
}
