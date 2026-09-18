import type { ReactNode } from "react";
import { cookies } from "next/headers";

import { ParentShell } from "@/components/layout/parent-shell";
import { PwaRegister } from "@/components/layout/pwa-register";
import { ACTIVE_CHILD_COOKIE } from "@/lib/auth/active-child";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function ParentLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Page-level guard. Middleware does the same check first, but a Server
  // Component must never depend on it alone.
  const parent = await requireParent();

  const supabase = await createClient();
  const { data: childRows } = await supabase
    .from("children")
    .select("id, name, avatar_url")
    .eq("is_active", true)
    .order("name", { ascending: true });

  const childList = (childRows ?? []).map((child) => ({
    id: child.id,
    name: child.name,
    avatarUrl: child.avatar_url,
  }));

  const cookieStore = await cookies();
  const storedChildId = cookieStore.get(ACTIVE_CHILD_COOKIE)?.value ?? null;
  const activeChildId =
    childList.find((child) => child.id === storedChildId)?.id ??
    childList[0]?.id ??
    null;

  return (
    <ParentShell
      displayName={parent.displayName}
      email={parent.email}
      avatarUrl={parent.avatarUrl}
      childList={childList}
      activeChildId={activeChildId}
    >
      {/* Parents install this too, and push needs a registered worker
          before they ever open the settings page. */}
      <PwaRegister />
      {children}
    </ParentShell>
  );
}
