import { Skeleton } from "@/components/ui/skeleton";
import { ka } from "@/lib/i18n/ka";

/**
 * Only the right-hand pane. The conversation list is rendered by the layout
 * above this boundary, so it stays on screen — and stays live — while the
 * thread being opened loads.
 */
export default function ParentChatThreadLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={ka.common.loading}
      className="flex h-full min-h-0 flex-col rounded-xl border bg-card"
    >
      <span className="sr-only">{ka.common.loading}</span>

      <div className="grid gap-2 border-b p-3">
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-full" />
          <div className="grid flex-1 gap-1.5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
        <Skeleton className="h-8 w-full rounded-lg" />
      </div>

      <div className="grid flex-1 content-start gap-3 p-3">
        <Skeleton className="h-12 w-3/5 rounded-2xl" />
        <Skeleton className="h-16 w-2/3 justify-self-end rounded-2xl" />
        <Skeleton className="h-12 w-1/2 rounded-2xl" />
      </div>

      <div className="p-3">
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </div>
  );
}
