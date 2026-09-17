import { Skeleton } from "@/components/ui/skeleton";
import { ka } from "@/lib/i18n/ka";

/**
 * P3 overrides the segment skeleton: the review screen is a two-column split
 * (evidence left, actions and thread right), not the card grid every other
 * parent screen uses, and it is the slowest parent route — the bundle query,
 * two sets of signed URLs and the thread.
 */
export default function ReviewLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={ka.common.loading}
      className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start"
    >
      <span className="sr-only">{ka.common.loading}</span>

      <div className="grid min-w-0 gap-4">
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="size-3 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>

        {/* split evidence panes */}
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((pane) => (
            <div key={pane} className="grid gap-2 rounded-xl border bg-card p-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="aspect-[4/3] w-full rounded-lg" />
              <div className="flex gap-2">
                <Skeleton className="size-14 rounded-md" />
                <Skeleton className="size-14 rounded-md" />
                <Skeleton className="size-14 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-3 rounded-xl border bg-card p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1 rounded-lg" />
            <Skeleton className="h-10 flex-1 rounded-lg" />
          </div>
        </div>

        <div className="grid gap-2 rounded-xl border bg-card p-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-14 w-4/5 rounded-lg" />
          <Skeleton className="h-14 w-4/5 justify-self-end rounded-lg" />
        </div>
      </div>
    </div>
  );
}
