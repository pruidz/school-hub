import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDashboard, type ChildDashboard } from "@/features/assignments/queries";
import { requireParent } from "@/lib/auth/session";
import { ka } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: ka.parent.dashboardTitle };

/**
 * P1 — one card per child: today's lessons, what is due today, what is waiting
 * for review, this week's completion and this week's redo count. Every number
 * is a link into the list it stands for. Charts are a later phase; the only
 * graphic here is a seven-day sparkline.
 */
export default async function ParentDashboardPage() {
  const parent = await requireParent();
  const { cards } = await getDashboard();

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {ka.parent.dashboardTitle}
          </h1>
          <p className="text-sm text-muted-foreground">
            {parent.displayName} · {ka.parent.dashboardSubtitle}
          </p>
        </div>

        {cards.length > 0 ? (
          <Button asChild>
            <Link href="/parent/assignments/new">
              <Plus />
              {ka.parent.newAssignment}
            </Link>
          </Button>
        ) : null}
      </header>

      {cards.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{ka.parent.noChildren}</CardTitle>
            <CardDescription>{ka.parent.manageChildren}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/parent/children">{ka.parent.addChild}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {cards.map((card) => (
              <ChildCard key={card.child.id} card={card} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {ka.parent.dashboardHint}
          </p>
        </>
      )}
    </div>
  );
}

function ChildCard({ card }: { card: ChildDashboard }) {
  const { child } = card;

  return (
    <Card className="overflow-hidden">
      <span
        aria-hidden
        className="block h-1 w-full"
        style={{ backgroundColor: child.color }}
      />
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {child.name}
          {child.grade ? (
            <span className="text-sm font-normal text-muted-foreground">
              {child.grade}
            </span>
          ) : null}
        </CardTitle>
        {card.awaitingReview > 0 ? (
          <CardDescription className="font-medium text-primary">
            {ka.parent.awaitingReview}: {card.awaitingReview}
          </CardDescription>
        ) : null}
      </CardHeader>

      <CardContent className="grid gap-4">
        <div className="grid grid-cols-3 gap-2">
          <Stat
            label={ka.parent.todayLessons}
            value={card.todayLessons}
            href={`/parent/schedule?child=${child.id}`}
          />
          <Stat
            label={ka.parent.dueToday}
            value={card.dueToday}
            href={`/parent/assignments?child=${child.id}&due=today`}
          />
          <Stat
            label={ka.parent.awaitingReview}
            value={card.awaitingReview}
            href={`/parent/inbox?child=${child.id}`}
            highlight={card.awaitingReview > 0}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stat
            label={ka.parent.weekCompletion}
            value={
              card.weekPercent === null ? "—" : `${card.weekPercent}%`
            }
            hint={
              card.weekTotal === 0
                ? ka.parent.weekCompletionEmpty
                : `${card.weekApproved}/${card.weekTotal}`
            }
            href={`/parent/assignments?child=${child.id}&due=week`}
          />
          <Stat
            label={ka.parent.weekRedo}
            value={card.weekRedo}
            href={`/parent/assignments?child=${child.id}&status=redo`}
            highlight={card.weekRedo > 0}
          />
        </div>

        <Sparkline values={card.weekSpark} color={child.color} />
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  href,
  hint,
  highlight = false,
}: {
  label: string;
  value: number | string;
  href: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "grid gap-0.5 rounded-lg border p-2 transition-colors hover:bg-muted/60",
        highlight && "border-primary/40 bg-primary/5",
      )}
    >
      <span className="text-xl font-semibold tabular-nums">{value}</span>
      <span className="text-[11px] leading-tight text-muted-foreground">
        {label}
      </span>
      {hint ? (
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </Link>
  );
}

/** Seven Monday-to-Sunday bars of approved work. Deliberately not a chart. */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values);

  return (
    <div className="flex h-8 items-end gap-1" aria-hidden>
      {values.map((value, index) => (
        <span
          key={index}
          className="flex-1 rounded-sm bg-muted"
          style={{
            height: `${Math.max(8, (value / max) * 100)}%`,
            backgroundColor: value > 0 ? color : undefined,
            opacity: value > 0 ? 0.75 : 1,
          }}
        />
      ))}
    </div>
  );
}
