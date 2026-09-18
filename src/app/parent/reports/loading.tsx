import { Skeleton } from "@/components/ui/skeleton";
import { ka } from "@/lib/i18n/ka";

/**
 * The report's own skeleton. The shared `/parent/loading.tsx` draws a grid of
 * child cards, which is the wrong silhouette here — five narrow stat tiles, a
 * chart and two tables — and a skeleton that reflows into something else is
 * worse than none.
 */
export default function ReportsLoading() {
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
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-72 rounded-lg" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>

      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-56 rounded-xl" />
    </div>
  );
}
