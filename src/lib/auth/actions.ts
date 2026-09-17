"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ka } from "@/lib/i18n/ka";
import { createClient } from "@/lib/supabase/server";

import {
  ACTIVE_CHILD_COOKIE,
  ACTIVE_CHILD_COOKIE_MAX_AGE,
} from "./active-child";
import { fail, ok, type ActionResult } from "./result";
import { getSessionUser } from "./session";

/** Sign out and land on the sign-in screen that matches the role. */
export async function signOut(): Promise<never> {
  const user = await getSessionUser();
  const target = user?.role === "child" ? "/kid-login" : "/login";

  const supabase = await createClient();
  await supabase.auth.signOut();

  redirect(target);
}

const childIdSchema = z.uuid();

/** Remember which child the parent is working on. */
export async function setActiveChild(
  childId: string,
): Promise<ActionResult<null>> {
  const parsed = childIdSchema.safeParse(childId);
  if (!parsed.success) return fail(ka.errors.notFound);

  const user = await getSessionUser();
  if (!user || (user.role !== "parent" && user.role !== "helper")) {
    return fail(ka.errors.unauthorized);
  }

  // RLS decides whether this parent may see the child at all.
  const supabase = await createClient();
  const { data: child } = await supabase
    .from("children")
    .select("id")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!child) return fail(ka.errors.notFound);

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_CHILD_COOKIE, parsed.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACTIVE_CHILD_COOKIE_MAX_AGE,
  });

  revalidatePath("/parent", "layout");
  return ok(null);
}
