import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LogOut } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { signOut } from "@/lib/auth/actions";
import { requireChild } from "@/lib/auth/session";
import { ka, t } from "@/lib/i18n/ka";
import { getKidProfile } from "@/features/children/queries";
import { getKidStats } from "@/features/children/kid-stats";
import { ColorDot } from "@/features/children/form-ui";
import { listSubjects } from "@/features/schedule/queries";

export const metadata: Metadata = { title: ka.kid.meTitle };

/**
 * C5 — the child's own page.
 *
 * Statistics appear only when the parent enabled `children.show_own_stats`;
 * when it is off the section is absent altogether, not greyed out. A locked
 * teaser would tell the child there is a number being kept from them, which is
 * exactly what the setting is there to avoid.
 */
export default async function KidMePage() {
  const child = await requireChild();

  const profile = await getKidProfile(child.childId);
  if (!profile) notFound();

  const [subjects, stats] = await Promise.all([
    listSubjects(child.childId),
    profile.showOwnStats ? getKidStats(child.childId) : Promise.resolve(null),
  ]);

  return (
    <div className="grid gap-5">
      <header className="flex items-center gap-4">
        <Avatar className="size-16">
          {profile.avatarUrl ? (
            <AvatarImage src={profile.avatarUrl} alt="" />
          ) : null}
          <AvatarFallback style={{ backgroundColor: `${profile.color}22` }}>
            {profile.name.trim().slice(0, 1).toUpperCase() || "?"}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{profile.name}</h1>
          <p className="text-sm text-muted-foreground">
            {profile.grade
              ? t("children.gradeValue", { grade: profile.grade })
              : ka.children.gradeNone}
            {profile.school ? ` · ${profile.school}` : ""}
          </p>
        </div>
      </header>

      {stats ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{ka.kid.myStats}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="grid gap-1">
              <span className="text-3xl font-bold">{stats.weekSubmitted}</span>
              <span className="text-sm text-muted-foreground">
                {ka.kid.statsWeekDone}
              </span>
            </div>
            <div className="grid gap-1">
              <span className="text-3xl font-bold">{stats.streak}</span>
              <span className="text-sm text-muted-foreground">
                {ka.kid.statsStreak}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{ka.kid.mySubjects}</CardTitle>
        </CardHeader>
        <CardContent>
          {subjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {ka.kid.mySubjectsEmpty}
            </p>
          ) : (
            <ul className="grid gap-2">
              {subjects.map((subject) => (
                <li key={subject.id} className="flex items-center gap-2">
                  <ColorDot color={subject.color} />
                  <span className="truncate">{subject.name}</span>
                  {subject.teacherName ? (
                    <span className="truncate text-sm text-muted-foreground">
                      · {subject.teacherName}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <form action={signOut}>
        <Button type="submit" variant="outline" size="lg" className="h-12 w-full">
          <LogOut />
          {ka.auth.signOut}
        </Button>
      </form>
    </div>
  );
}
