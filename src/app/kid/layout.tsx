import type { ReactNode } from "react";

import { KidShell } from "@/components/layout/kid-shell";
import { PwaRegister } from "@/components/layout/pwa-register";
import { requireChild } from "@/lib/auth/session";

export default async function KidLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Page-level guard; middleware is the first line, not the only one.
  const child = await requireChild();

  return (
    <>
      <PwaRegister />
      <KidShell displayName={child.displayName} avatarUrl={child.avatarUrl}>
        {children}
      </KidShell>
    </>
  );
}
