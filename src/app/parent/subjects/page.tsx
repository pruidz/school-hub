import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireParent } from "@/lib/auth/session";
import { ka } from "@/lib/i18n/ka";
import { resolveActiveChild } from "@/features/children/queries";
import { listSubjects, listTopics } from "@/features/schedule/queries";
import {
  SubjectFormDialog,
  SubjectsManager,
} from "@/features/schedule/subjects-manager";

export const metadata: Metadata = { title: ka.subjects.title };

/**
 * P6 — subjects and topics for the child selected in the shell's switcher.
 */
export default async function ParentSubjectsPage() {
  await requireParent();

  const { active } = await resolveActiveChild();

  if (!active) {
    return <NoChildren />;
  }

  const [subjects, topics] = await Promise.all([
    listSubjects(active.id),
    listTopics(active.id),
  ]);

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {ka.subjects.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {active.name} · {ka.subjects.subtitle}
          </p>
        </div>
        {subjects.length > 0 ? <SubjectFormDialog childId={active.id} /> : null}
      </header>

      <SubjectsManager
        childId={active.id}
        subjects={subjects}
        topics={topics}
      />
    </div>
  );
}

function NoChildren() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{ka.parent.noChildren}</CardTitle>
      </CardHeader>
      <CardContent className="grid justify-items-start gap-4">
        <p className="text-sm text-muted-foreground">
          {ka.parent.noActiveChild}
        </p>
        <Button asChild variant="outline">
          <Link href="/parent/children">{ka.parent.manageChildren}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
