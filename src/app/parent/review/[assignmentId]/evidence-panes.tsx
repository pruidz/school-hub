"use client";

/**
 * The split view: task source on the left, the child's solution on the right,
 * each independently scrollable and zoomable.
 *
 * Photos and recordings share a pane rather than getting one each. A parent
 * checking a recited poem has to press play and press ✓ without scrolling
 * between two boxes, and half of a mixed submission — the photo of the
 * exercise and the reading of the passage — is not a reviewable thing on its
 * own. `EvidenceGallery` is what keeps them together; the tab counters count
 * both, for the same reason.
 *
 * On a phone the two panes collapse into tabs. Both `TabsContent` use
 * `forceMount` so each gallery mounts exactly once — signing the URLs twice
 * just to switch layout would be a wasted round trip.
 */

import * as React from "react";
import { Headphones } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { splitEvidence } from "@/features/attachments/audio";
import { EvidenceGallery } from "@/features/attachments/evidence-gallery";
import type { Attachment } from "@/lib/db.types";
import { ka } from "@/lib/i18n/ka";

export function EvidencePanes({
  taskAttachments,
  solutionAttachments,
}: {
  taskAttachments: Attachment[];
  solutionAttachments: Attachment[];
}) {
  const solutionRecordings = React.useMemo(
    () => splitEvidence(solutionAttachments).recordings,
    [solutionAttachments],
  );

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
            emptyLabel={ka.review.noSolutionEvidence}
            hint={
              solutionRecordings.length > 0 ? ka.review.listenHint : undefined
            }
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
  hint,
}: {
  heading: string;
  attachments: Attachment[];
  emptyLabel: string;
  hint?: string;
}) {
  return (
    <section className="grid min-w-0 gap-2 rounded-xl border bg-card p-3">
      <h2 className="hidden text-sm font-medium text-muted-foreground lg:block">
        {heading}
      </h2>

      {/* Says "this one has to be listened to", so a parent skimming a queue of
          written work does not tick off a recitation they never heard. */}
      {hint ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary">
          <Headphones className="size-3.5 shrink-0" />
          {hint}
        </p>
      ) : null}

      <div className="max-h-[60vh] min-h-32 overflow-y-auto overscroll-contain pr-1">
        <EvidenceGallery
          attachments={attachments}
          zoom
          emptyLabel={emptyLabel}
          gridClassName="grid-cols-2"
        />
      </div>
    </section>
  );
}
