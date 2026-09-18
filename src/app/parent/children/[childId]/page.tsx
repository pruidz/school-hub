import { ka } from "@/lib/i18n/ka";
import { isIsoDate, todayIso } from "@/features/schedule/dates";
import { ChildDay } from "@/features/children/child-day";
import { ChildDayNav } from "@/features/children/child-day-nav";
import { requireFamilyChild } from "@/features/children/child-scope";
import { ParentDayAssignments } from "@/features/assignments";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * P4 / „დღეს“ — the parent's read-only mirror of the child's day.
 *
 * `?d=` may point at any past day (the whole reason a parent opens this weeks
 * later), but a future date is clamped back to today rather than 404-ing: the
 * links that produce one come from the app's own history rows, and a stale
 * bookmark should land on something useful.
 */
export default async function ChildDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ childId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { childId } = await params;
  // Page-level guard; the layout runs it too, but `cache()` makes that free.
  const child = await requireFamilyChild(childId);

  const { d } = await searchParams;
  const today = todayIso();
  const requested = typeof d === "string" && isIsoDate(d) ? d : today;
  const date = requested > today ? today : requested;

  return (
    <div className="grid gap-5">
      <ChildDayNav childId={child.id} date={date} />

      <ChildDay childId={child.id} date={date} />

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">
          {ka.children.dayAssignmentsHeading}
        </h2>
        {/* Owned by A4 — the contract view this screen was written for. */}
        <ParentDayAssignments childId={child.id} date={date} />
      </section>
    </div>
  );
}
