import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap, Users } from "lucide-react";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { homePathForRole } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { ka } from "@/lib/i18n/ka";

export default async function LandingPage() {
  const user = await getSessionUser();
  if (user) redirect(homePathForRole(user.role));

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-16">
      <div className="absolute end-4 top-4">
        <ThemeToggle />
      </div>

      <div className="space-y-3 text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          {ka.auth.appName}
        </h1>
        <p className="text-lg text-muted-foreground">{ka.auth.tagline}</p>
      </div>

      <div className="w-full max-w-md space-y-4">
        <p className="text-center text-sm font-medium text-muted-foreground">
          {ka.auth.chooseRole}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Button asChild size="lg" className="h-24 flex-col gap-2 text-base">
            <Link href="/login">
              <Users className="size-7" />
              {ka.auth.roleParent}
            </Link>
          </Button>

          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-24 flex-col gap-2 text-base"
          >
            <Link href="/kid-login">
              <GraduationCap className="size-7" />
              {ka.auth.roleStudent}
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
