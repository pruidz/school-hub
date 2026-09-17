"use client";

/**
 * The split view: task source on the left, the child's solution on the right,
 * each independently scrollable and zoomable.
 *
 * On a phone the two panes collapse into tabs. Both `TabsContent` use
 * `forceMount` so each gallery mounts exactly once — signing the URLs twice
 * just to switch layout would be a wasted round trip.
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PhotoGallery } from "@/features/attachments/photo-gallery";
import type { Attachment } from "@/lib/db.types";
import { ka } from "@/lib/i18n/ka";

export function EvidencePanes({
  taskAttachments,
  solutionAttachments,
}: {
  taskAttachments: Attachment[];
  solutionAttachments: Attachment[];
}) {
  return (
    <Tabs defaultValue="solution" className="w-full gap-3">
      <TabsList className="w-full lg:hidden">
        <TabsTrigger value="task">
          {ka.review.taskSide} ({taskAttachments.length})
        </TabsTrigger>
        <TabsTrigger value="solution">
          {ka.review.solutionSide} ({solutionAttachments.length})
        </TabsTrigger>
      </TabsList>

      <div className="grid gap-4 lg:grid-cols-2">
        <TabsContent
          value="task"
          forceMount
          className="data-[state=inactive]:hidden lg:data-[state=inactive]:block"
        >
          <Pane
            heading={ka.review.taskSide}
            attachments={taskAttachments}
            emptyLabel={ka.review.noTaskPhotos}
          />
        </TabsContent>

        <TabsContent
          value="solution"
          forceMount
          className="data-[state=inactive]:hidden lg:data-[state=inactive]:block"
        >
          <Pane
            heading={ka.review.solutionSide}
            attachments={solutionAttachments}
            emptyLabel={ka.review.noSolutionPhotos}
          />
        </TabsContent>
      </div>
    </Tabs>
  );
}

function Pane({
  heading,
  attachments,
  emptyLabel,
}: {
  heading: string;
  attachments: Attachment[];
  emptyLabel: string;
}) {
  return (
    <section className="grid min-w-0 gap-2 rounded-xl border bg-card p-3">
      <h2 className="hidden text-sm font-medium text-muted-foreground lg:block">
        {heading}
      </h2>
      <div className="max-h-[60vh] min-h-32 overflow-y-auto overscroll-contain pr-1">
        <PhotoGallery
          attachments={attachments}
          zoom
          emptyLabel={emptyLabel}
          gridClassName="grid-cols-2"
        />
      </div>
    </section>
  );
}
