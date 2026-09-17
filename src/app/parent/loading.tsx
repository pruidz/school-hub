import { Skeleton } from "@/components/ui/skeleton";
import { ka } from "@/lib/i18n/ka";

/**
 * Covers every `/parent/*` screen that does not ship its own skeleton.
 *
 * One boundary at the segment root is enough because the parent screens share
 * one frame — page title, an action on the right, then a grid of cards or a
 * table — and `ParentShell` (sidebar, child switcher) stays mounted above it.
 */
export default function ParentLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={ka.common.loading}
      className="grid gap-6"
    >
      <span className="sr-only">{ka.common.loading}</span>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-40 rounded-lg" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="grid gap-4 rounded-xl border bg-card p-6">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <Skeleton className="h-5 w-32" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
            </div>
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
