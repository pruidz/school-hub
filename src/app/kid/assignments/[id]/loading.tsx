import { Skeleton } from "@/components/ui/skeleton";
import { ka } from "@/lib/i18n/ka";

/**
 * C3 gets its own skeleton because it is the one kid screen whose shape is not
 * a card stack: back link, header, two photo sections, the submit panel and
 * the thread. This is also the slowest navigation in the app (detail query,
 * signed URLs, messages), which is exactly where a frozen screen makes a child
 * tap the tile again.
 */
export default function KidAssignmentLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={ka.common.loading}
      className="grid gap-4 pb-8"
    >
      <span className="sr-only">{ka.common.loading}</span>

      <Skeleton className="h-9 w-24 justify-self-start rounded-lg" />

      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-3 rounded-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-4 w-1/2" />
      </div>

      {/* task photos / your work */}
      {[0, 1].map((section) => (
        <div key={section} className="grid gap-2 rounded-xl border bg-card p-3">
          <Skeleton className="h-5 w-32" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Skeleton className="aspect-square w-full rounded-lg" />
            <Skeleton className="aspect-square w-full rounded-lg" />
          </div>
          {section === 1 ? (
            <div className="flex gap-2">
              <Skeleton className="h-12 flex-1 rounded-lg" />
              <Skeleton className="h-12 flex-1 rounded-lg" />
            </div>
          ) : null}
        </div>
      ))}

      {/* submit panel */}
      <div className="grid gap-3 rounded-xl border bg-card p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>

      {/* thread */}
      <div className="grid gap-2 rounded-xl border bg-card p-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-16 w-4/5 rounded-lg" />
        <Skeleton className="h-16 w-4/5 justify-self-end rounded-lg" />
      </div>
    </div>
  );
}
