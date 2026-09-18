import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AssignmentStatusBadge } from "@/features/assignments/status-badge";
import { formatDueLabel } from "@/features/assignments/dates";
import { getHelperHome, type HelperQueueItem } from "@/features/helpers/queries";
import { ka, t } from "@/lib/i18n/ka";

export const metadata: Metadata = { title: ka.helpers.homeTitle };

function QueueRow({ item }: { item: HelperQueueItem }) {
  return (
    <li className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0">
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: item.childColor }}
      />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate text-sm font-medium">{item.title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {item.childName}
          {item.subjectName ? ` · ${item.subjectName}` : ""}
          {item.dueDate ? ` · ${formatDueLabel(item.dueDate)}` : ""}
        </span>
      </div>
      <AssignmentStatusBadge status={item.status} />
      <Button asChild size="sm" variant="secondary">
        <Link href={`/helper/assignment/${item.assignmentId}`}>
          {ka.common.open}
        </Link>
      </Button>
    </li>
  );
}

/**
 * The helper's home: their children, what is waiting for a decision, and the
 * recent work. `?child=<id>` narrows it; an id outside the grant is ignored
 * rather than refused, because a helper should never be told that an id they
 * guessed exists.
 */
export default async function HelperHomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { child } = await searchParams;
  const selected = typeof child === "string" ? child : null;

  const { children, waiting, recent, scope } = await getHelperHome(selected);

  if (children.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{ka.helpers.homeEmpty}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {ka.helpers.homeEmptyHint}
          </p>
        </CardContent>
      </Card>
    );
  }

  const active = selected && scope.childIds.includes(selected) ? selected : null;

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {ka.helpers.homeTitle}
        </h1>
        <p className="text-sm text-muted-foreground">
          {ka.helpers.homeSubtitle}
          {!scope.canReview ? ` · ${ka.helpers.viewOnlyExplain}` : ""}
        </p>
      </header>

      {children.length > 1 ? (
        <nav className="flex flex-wrap gap-2" aria-label={ka.parent.childSwitcher}>
          <Button
            asChild
            size="sm"
            variant={active ? "outline" : "secondary"}
          >
            <Link href="/helper">{ka.common.all}</Link>
          </Button>
          {children.map((item) => (
            <Button
              key={item.id}
              asChild
              size="sm"
              variant={active === item.id ? "secondary" : "outline"}
            >
              <Link href={`/helper?child=${item.id}`}>
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.name}
                {item.waitingCount > 0 ? (
                  <Badge variant="default">{item.waitingCount}</Badge>
                ) : null}
              </Link>
            </Button>
          ))}
        </nav>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            {ka.helpers.queueTitle}
            {waiting.length > 0
              ? ` · ${t("inbox.count", { count: waiting.length })}`
              : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {waiting.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">
              {ka.helpers.queueEmpty}
            </p>
          ) : (
            <ul className="grid">
              {waiting.map((item) => (
                <QueueRow key={item.assignmentId} item={item} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ka.helpers.recentTitle}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {recent.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">
              {ka.assignments.empty}
            </p>
          ) : (
            <ul className="grid">
              {recent.map((item) => (
                <QueueRow key={item.assignmentId} item={item} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
