import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Headphones, ImageOff } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatWaitedFor, formatDueLabel } from "@/features/assignments/dates";
import { FilterBar } from "@/features/assignments/filter-bar";
import { getInbox } from "@/features/assignments/queries";
import { getSignedUrls } from "@/features/attachments/signed-urls";
import { getUnreadCounts } from "@/features/messages/queries";
import { ka, t } from "@/lib/i18n/ka";

export const metadata: Metadata = { title: ka.inbox.title };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * P2 — every `submitted` assignment across all children, newest first.
 * This is the screen a parent is meant to open first each evening.
 */
export default async function ParentInboxPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const childFilter = first(params.child);
  const subjectFilter = first(params.subject);

  const { items, children, subjects } = await getInbox({
    childId: childFilter,
    subjectId: subjectFilter,
  });

  const thumbnailPaths = items
    .map((item) => item.thumbnailPath)
    .filter((path): path is string => Boolean(path));

  const [urls, unread] = await Promise.all([
    getSignedUrls(thumbnailPaths),
    getUnreadCounts(items.map((item) => item.assignment.id)),
  ]);

  // Only offer subjects that belong to the children currently in scope.
  const subjectOptions = subjects
    .filter((subject) => !childFilter || subject.childId === childFilter)
    .map((subject) => ({ value: subject.id, label: subject.name }));

  return (
    <div className="grid gap-5">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {ka.inbox.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {items.length > 0
            ? t("inbox.count", { count: items.length })
            : ka.inbox.subtitle}
        </p>
      </header>

      {children.length > 1 || subjectOptions.length > 0 ? (
        // `FilterBar` reads `useSearchParams`, which Next wants behind a
        // Suspense boundary so the shell can still be prerendered.
        <Suspense fallback={<div className="h-9" />}>
          <FilterBar
            filters={[
              {
                name: "child",
                label: ka.assignments.filterChild,
                value: childFilter,
                options: children.map((child) => ({
                  value: child.id,
                  label: child.name,
                })),
              },
              {
                name: "subject",
                label: ka.assignments.filterSubject,
                value: subjectFilter,
                options: subjectOptions,
              },
            ]}
          />
        </Suspense>
      ) : null}

      {items.length === 0 ? (
        <Card>
          <CardContent className="grid place-items-center gap-2 py-12 text-center">
            <CheckCircle2 className="size-8 text-emerald-600" />
            <p className="text-lg font-medium">
              {childFilter || subjectFilter
                ? ka.inbox.emptyFiltered
                : ka.inbox.empty}
            </p>
            <p className="text-sm text-muted-foreground">
              {ka.inbox.emptyHint}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {items.map(({
            assignment,
            child,
            subject,
            thumbnailPath,
            recordingCount,
          }) => {
            const url = thumbnailPath ? urls[thumbnailPath] : null;
            const unreadCount = unread[assignment.id] ?? 0;

            return (
              <li key={assignment.id}>
                <Link
                  href={`/parent/review/${assignment.id}`}
                  className="flex items-stretch gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/60"
                >
                  <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted">
                    {url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={url}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : recordingCount > 0 ? (
                      // Oral homework: nothing to show, something to hear.
                      <Headphones
                        className="size-6 text-primary"
                        aria-label={ka.attachments.recording}
                      />
                    ) : (
                      <ImageOff className="size-5 text-muted-foreground" />
                    )}
                  </span>

                  <span className="grid min-w-0 flex-1 content-center gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      {child ? (
                        <span
                          className="inline-flex items-center gap-1.5 text-xs font-medium"
                          style={{ color: child.color }}
                        >
                          <span
                            aria-hidden
                            className="size-2 rounded-full"
                            style={{ backgroundColor: child.color }}
                          />
                          {child.name}
                        </span>
                      ) : null}
                      {subject ? (
                        <span className="text-xs text-muted-foreground">
                          {subject.name}
                        </span>
                      ) : null}
                      {unreadCount > 0 ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          {t("messages.unreadCount", { count: unreadCount })}
                        </span>
                      ) : null}
                    </span>

                    <span className="truncate font-medium">
                      {assignment.title}
                    </span>

                    <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span>{formatDueLabel(assignment.due_date)}</span>
                      {assignment.submitted_at ? (
                        <span>
                          {t("inbox.waiting", {
                            duration: formatWaitedFor(assignment.submitted_at),
                          })}
                        </span>
                      ) : null}
                      {assignment.redo_count > 0 ? (
                        <span>
                          {t("assignments.redoCount", {
                            count: assignment.redo_count,
                          })}
                        </span>
                      ) : null}
                    </span>
                  </span>

                  <span className="hidden shrink-0 items-center sm:flex">
                    <span className="rounded-lg border px-3 py-1.5 text-sm font-medium">
                      {ka.inbox.review}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
