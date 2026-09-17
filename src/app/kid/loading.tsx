import { Skeleton } from "@/components/ui/skeleton";
import { ka } from "@/lib/i18n/ka";

/**
 * Covers every `/kid/*` screen that does not ship its own skeleton.
 *
 * It sits at the segment root rather than on each leaf because the kid screens
 * (C1 today, C4 chat, C5 me, the assignment list) are all the same shape: a
 * title line and a stack of full-width cards inside `KidShell`. The shell
 * itself — header and bottom tab bar — stays mounted, so only this block
 * swaps out and the page does not jump when the real content arrives.
 */
export default function KidLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={ka.common.loading}
      className="grid gap-5"
    >
      <span className="sr-only">{ka.common.loading}</span>

      {/* day / section nav */}
      <div className="flex items-center gap-2">
        <Skeleton className="size-12 rounded-xl" />
        <Skeleton className="h-7 flex-1 rounded-lg" />
        <Skeleton className="size-12 rounded-xl" />
      </div>

      {/* card stack */}
      {[0, 1, 2].map((index) => (
        <div key={index} className="grid gap-3 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <Skeleton className="size-3 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="ms-auto h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}
