import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { z } from "zod";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatDueLabel } from "@/features/assignments/dates";
import { AssignmentStatusBadge } from "@/features/assignments/status-badge";
import { MessageThread } from "@/features/messages/message-thread";
import { getThreadContext } from "@/features/messages/queries";
import { ka } from "@/lib/i18n/ka";

/**
 * One conversation, in the right-hand pane of `/parent/chat`.
 *
 * The thread itself is `<MessageThread />` — the very same Server Component the
 * review screen embeds, with the same live client underneath it. Nothing about
 * the conversation is reimplemented here; this page contributes the header, the
 * way back on a phone, and the link through to the assignment.
 *
 * Authorisation is `getThreadContext`, which reads the assignment through the
 * user-scoped client. RLS answers "may this person see it", and anything it
 * will not return is a 404 — a parent from another family gets the same page as
 * an id that never existed.
 */
export default async function ParentChatThreadPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  if (!z.uuid().safeParse(assignmentId).success) notFound();

  const context = await getThreadContext(assignmentId);
  if (!context) notFound();

  // Where the parent most likely wants to go from here. Submitted work can be
  // acted on, so it goes to the review screen; anything else goes to the
  // assignment. The label says which — a bare arrow would not.
  const reviewable = context.status === "submitted";
  const throughHref = reviewable
    ? `/parent/review/${context.assignmentId}`
    : `/parent/assignments/${context.assignmentId}`;
  const throughLabel = reviewable
    ? ka.messages.openReview
    : ka.messages.openAssignment;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border bg-card">
      <header className="grid gap-2 border-b p-3">
        <div className="flex items-start gap-2">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="-ms-1 shrink-0 lg:hidden"
            aria-label={ka.messages.backToThreads}
          >
            <Link href="/parent/chat">
              <ArrowLeft />
            </Link>
          </Button>

          <Avatar className="mt-0.5 size-8 shrink-0">
            {context.childAvatarUrl ? (
              <AvatarImage src={context.childAvatarUrl} alt="" />
            ) : null}
            <AvatarFallback
              className="text-xs font-semibold"
              style={
                context.childColor
                  ? {
                      backgroundColor: `${context.childColor}22`,
                      color: context.childColor,
                    }
                  : undefined
              }
            >
              {(context.childName ?? "?").trim().slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="grid min-w-0 flex-1 gap-0.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span
                className="font-medium"
                style={
                  context.childColor ? { color: context.childColor } : undefined
                }
              >
                {context.childName ?? ka.messages.unknownAuthor}
              </span>
              {context.subjectName ? (
                <span className="text-muted-foreground">
                  {context.subjectName}
                </span>
              ) : null}
              <span className="text-muted-foreground">
                {formatDueLabel(context.dueDate)}
              </span>
              <AssignmentStatusBadge status={context.status} />
            </div>

            {/* `h2`: the screen's `h1` is the list title in the layout, which
                stays on screen beside this on desktop. */}
            <h2 className="truncate text-sm font-semibold sm:text-base">
              {context.title}
            </h2>
          </div>
        </div>

        {/* The explicit ask: get from the conversation to the work it is
            about, in one tap, and know where the tap leads. */}
        <Button asChild variant="outline" size="sm" className="justify-center">
          <Link href={throughHref}>
            <ExternalLink />
            {throughLabel}
          </Link>
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        <MessageThread
          assignmentId={context.assignmentId}
          childId={context.childId}
          className="min-h-0 flex-1"
        />
      </div>
    </div>
  );
}
