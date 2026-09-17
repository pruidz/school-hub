import "server-only";

/**
 * The two day views A3 embeds in the schedule / "დღეს" screens.
 * Signatures are fixed by the cross-agent contract in CLAUDE.md.
 *
 * Both are Server Components: they read through RLS and render rows. Neither
 * takes a callback, so A3 can drop them anywhere in an RSC tree.
 */

import { requireChild, requireParent } from "@/lib/auth/session";
import { ka } from "@/lib/i18n/ka";

import { AssignmentRow } from "./assignment-row";
import { getDayAssignmentsForChild, listFamilyChildren } from "./queries";
import { createClient } from "@/lib/supabase/server";

export async function KidDayAssignments({
  childId,
  date,
}: {
  childId: string;
  date: string;
}) {
  const child = await requireChild();
  // A child may only ever see their own day, whatever id is passed in.
  if (child.childId !== childId) return null;

  const items = await getDayAssignmentsForChild(child.childId, date);

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {ka.kid.assignmentsEmpty}
      </p>
    );
  }

  return (
    <ul className="grid gap-2">
      {items.map(({ assignment, subject }) => (
        <li key={assignment.id}>
          <AssignmentRow
            assignment={assignment}
            subject={subject}
            href={`/kid/assignments/${assignment.id}`}
            size="lg"
          />
        </li>
      ))}
    </ul>
  );
}

export async function ParentDayAssignments({
  childId,
  date,
}: {
  childId: string;
  date: string;
}) {
  const parent = await requireParent();
  const supabase = await createClient();

  const children = await listFamilyChildren(supabase, parent.familyId);
  const child = children.find((row) => row.id === childId);
  if (!child) return null;

  const items = await getDayAssignmentsForChild(child.id, date);

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{ka.assignments.empty}</p>
    );
  }

  return (
    <ul className="grid gap-2">
      {items.map(({ assignment, subject }) => (
        <li key={assignment.id}>
          <AssignmentRow
            assignment={assignment}
            subject={subject}
            href={
              assignment.status === "submitted"
                ? `/parent/review/${assignment.id}`
                : `/parent/assignments/${assignment.id}`
            }
          />
        </li>
      ))}
    </ul>
  );
}
