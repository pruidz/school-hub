import { Skeleton } from "@/components/ui/skeleton";
import { ka } from "@/lib/i18n/ka";

/**
 * P3 overrides the segment skeleton: the review screen is a chronology of
 * attempts with the actions and the thread beside it, not the card grid every
 * other parent screen uses, and it is the slowest parent route — the bundle
 * query, one batch of signed URLs and the thread.
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

        {/* the task strip */}
        <div className="grid gap-2 rounded-xl border bg-card p-3">
          <Skeleton className="h-4 w-24" />
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
            {[0, 1, 2].map((tile) => (
              <Skeleton key={tile} className="aspect-square rounded-lg" />
            ))}
          </div>
        </div>

        {/* the attempt chronology */}
        <div className="grid gap-2.5">
          <Skeleton className="h-4 w-20" />
          {[0, 1].map((attempt) => (
            <div
              key={attempt}
              className="grid gap-3 rounded-xl border border-l-4 bg-card p-3"
            >
              <div className="flex items-center gap-2">
                <Skeleton className="size-6 rounded-full" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24 rounded-full" />
              </div>
              {attempt === 0 ? null : (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-6">
                  {[0, 1, 2, 3].map((tile) => (
                    <Skeleton key={tile} className="aspect-square rounded-lg" />
                  ))}
                </div>
              )}
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
