import { Skeleton } from "@/components/ui/skeleton";
import { ka } from "@/lib/i18n/ka";

/**
 * Sits inside the `[childId]` layout, so the child's name and the tab strip
 * stay on screen while a tab (or another day) loads — switching tabs should not
 * blank the header out.
 */
export default function ChildPageLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={ka.common.loading}
      className="grid gap-4"
    >
      <span className="sr-only">{ka.common.loading}</span>
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="size-9 rounded-lg" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="size-9 rounded-lg" />
      </div>
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-28 rounded-xl" />
      ))}
    </div>
  );
}
