import "server-only";

import { CheckCircle2, ChevronDown } from "lucide-react";

import { ka, t } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";
import { formatDateShort } from "@/features/schedule/dates";
import { LessonCard } from "@/features/lessons/lesson-card";
import { LessonsAutoBuild } from "@/features/lessons/lessons-auto-build";
import { lessonUi } from "@/features/lessons/ui-mode";

import { HomeItem } from "./home-item";
import type { HomeLesson, KidHome } from "./queries";
import { homeUi } from "./ui-mode";

/**
 * C1 — the child's home screen (SPEC 4a).
 *
 * The sections are fixed by the spec: გადაცილებული, ჩასაწერი, ხვალისთვის,
 * მოსამზადებელი, გადასაკეთებელი. What makes it a dashboard rather than a list
 * is the hand-off:
 *
 *   while „ჩასაწერი" is not empty it OWNS the screen — full lesson cards, the
 *   camera one tap away, and every other section shrunk to a line with a count;
 *
 *   the moment the last lesson is dealt with, `toRecord` is empty, so this
 *   component renders that section as one green line and gives the lead
 *   treatment to „ხვალისთვის" instead.
 *
 * That switch is a consequence of the data, computed on the server on the next
 * render: no button, no navigation, no client state, and nothing to get out of
 * sync. The child's own action (recording homework, or „დავალება არ მოგვცეს")
 * already refreshes the route, so the screen turns over by itself.
 */
export function KidDashboard({
  home,
  childId,
}: {
  home: KidHome;
  childId: string;
}) {
  const ui = homeUi(home.uiMode);
  const lessonCards = lessonUi(home.uiMode);

  // The one decision this screen turns on.
  const recording = home.toRecord.length > 0;

  return (
    <div className="grid gap-5">
      {/* 1 — გადაცილებული. Above everything, including the day's recording. */}
      {home.overdue.length > 0 ? (
        <section className="grid gap-2" aria-labelledby="sec-overdue">
          <h2
            id="sec-overdue"
            className={cn(ui.headingClass, "text-destructive")}
          >
            {ka.kid.sectionOverdue}
            {ui.showCounters ? ` (${home.overdue.length})` : null}
          </h2>
          <ul className="grid gap-2">
            {home.overdue.map((item) => (
              <li key={item.id}>
                <HomeItem item={item} tone="overdue" size={ui.itemSize} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 2 — ჩასაწერი. */}
      <RecordSection
        home={home}
        childId={childId}
        recording={recording}
        lessonUiMode={lessonCards}
        headingClass={recording ? ui.leadHeadingClass : ui.headingClass}
        showCounters={ui.showCounters}
      />

      {/* 3 — ხვალისთვის. Takes the lead the moment nothing is left to record.
          The bucket is `due <= tomorrow`, so it can hold work due TODAY. When it
          does, „ხვალისთვის" is a lie that reads as permission to leave it. */}
      <Section
        id="sec-tomorrow"
        heading={
          home.tomorrowItems.some(
            (item) => item.dueDate !== null && item.dueDate <= home.today,
          )
            ? ka.kid.sectionUrgent
            : ka.kid.sectionTomorrow
        }
        note={t("kid.forDate", { date: formatDateShort(home.tomorrow) })}
        count={home.tomorrowItems.length}
        showCounters={ui.showCounters}
        lead={!recording}
        headingClass={recording ? ui.headingClass : ui.leadHeadingClass}
        emptyLabel={ka.kid.tomorrowEmpty}
      >
        {home.tomorrowItems.map((item) => (
          <li key={item.id}>
            <HomeItem
              item={item}
              tone="plain"
              size={recording ? "default" : ui.itemSize}
            />
          </li>
        ))}
      </Section>

      {/* 4 — მოსამზადებელი. */}
      {home.prepare.length > 0 ? (
        ui.collapsePrepare || recording ? (
          <Disclosure
            summary={`${ka.kid.sectionPrepare} · ${home.prepare.length}`}
          >
            <ul className="grid gap-2 pt-2">
              {home.prepare.map((item) => (
                <li key={item.id}>
                  <HomeItem item={item} tone="plain" />
                </li>
              ))}
            </ul>
          </Disclosure>
        ) : (
          <Section
            id="sec-prepare"
            heading={ka.kid.sectionPrepare}
            count={home.prepare.length}
            showCounters={ui.showCounters}
            headingClass={ui.headingClass}
            emptyLabel={ka.kid.prepareEmpty}
          >
            {home.prepare.map((item) => (
              <li key={item.id}>
                <HomeItem item={item} tone="plain" size={ui.itemSize} />
              </li>
            ))}
          </Section>
        )
      ) : null}

      {/* 5 — გადასაკეთებელი. Never collapsed: the parent's comment is the
          whole point of the section, so it is always open, always in colour. */}
      {home.returned.length > 0 ? (
        <section className="grid gap-2" aria-labelledby="sec-returned">
          <h2 id="sec-returned" className={cn(ui.headingClass, "text-amber-700 dark:text-amber-500")}>
            {ka.kid.sectionReturned}
            {ui.showCounters ? ` (${home.returned.length})` : null}
          </h2>
          <ul className="grid gap-2">
            {home.returned.map((item) => (
              <li key={item.id}>
                <HomeItem item={item} tone="returned" size={ui.itemSize} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  ჩასაწერი                                                                   */
/* -------------------------------------------------------------------------- */

function RecordSection({
  home,
  childId,
  recording,
  lessonUiMode,
  headingClass,
  showCounters,
}: {
  home: KidHome;
  childId: string;
  recording: boolean;
  lessonUiMode: ReturnType<typeof lessonUi>;
  headingClass: string;
  showCounters: boolean;
}) {
  const pending = new Set(home.toRecord.map((lesson) => lesson.id));
  const done = home.lessons.filter((lesson) => !pending.has(lesson.id));

  const card = (lesson: HomeLesson) => (
    <LessonCard
      // Keyed on the stored values so a card whose server data changed
      // remounts with fresh state, while one being typed into is left alone.
      key={`${lesson.id}:${lesson.topic ?? ""}:${lesson.notes ?? ""}:${lesson.noHomework}`}
      lesson={lesson}
      ui={lessonUiMode}
      childId={childId}
      topicSuggestions={
        lesson.subjectId
          ? (home.topicsBySubject.get(lesson.subjectId) ?? [])
          : []
      }
      // SPEC 4a: not "the next school day" but the next lesson of THIS subject.
      defaultDueDate={lesson.defaultDueDate}
    />
  );

  return (
    <section className="grid gap-3" aria-labelledby="sec-record">
      <LessonsAutoBuild
        childId={childId}
        date={home.date}
        missing={home.pendingLessons}
      />

      {recording ? (
        <>
          <header className="grid gap-0.5">
            <h2 id="sec-record" className={headingClass}>
              {ka.kid.sectionToRecord}
            </h2>
            <p className="text-sm text-muted-foreground">
              {showCounters
                ? t("kid.toRecordCount", { count: home.toRecord.length })
                : ka.kid.toRecordHint}
            </p>
          </header>

          {home.toRecord.map(card)}

          {done.length > 0 ? (
            <Disclosure summary={`${ka.kid.recordedAlready} · ${done.length}`}>
              <div className="grid gap-3 pt-3">{done.map(card)}</div>
            </Disclosure>
          ) : null}
        </>
      ) : home.lessons.length === 0 ? (
        <p id="sec-record" className="text-sm text-muted-foreground">
          {home.pendingLessons > 0 ? ka.common.loading : ka.kid.nothingToday}
        </p>
      ) : (
        /* The collapse. One green line, and the day's cards one tap behind it
           for the child who wants to fix what they wrote. */
        <details className="group rounded-xl border border-emerald-600/30 bg-emerald-500/10">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 py-2 font-medium text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="size-5 shrink-0" />
            <span id="sec-record">{ka.kid.allRecorded}</span>
            <ChevronDown className="ms-auto size-4 transition-transform group-open:rotate-180" />
            <span className="sr-only">{ka.kid.allRecordedOpen}</span>
          </summary>
          <div className="grid gap-3 p-3 pt-0">{home.lessons.map(card)}</div>
        </details>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  building blocks                                                            */
/* -------------------------------------------------------------------------- */

function Section({
  id,
  heading,
  note,
  count,
  showCounters,
  lead = false,
  headingClass,
  emptyLabel,
  children,
}: {
  id: string;
  heading: string;
  note?: string;
  count: number;
  showCounters: boolean;
  lead?: boolean;
  headingClass: string;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "grid gap-2",
        lead && count > 0 && "rounded-xl border bg-card p-3",
      )}
      aria-labelledby={id}
    >
      <header className="flex flex-wrap items-baseline gap-x-2">
        <h2 id={id} className={headingClass}>
          {heading}
          {showCounters && count > 0 ? ` (${count})` : null}
        </h2>
        {note ? (
          <span className="text-sm text-muted-foreground">{note}</span>
        ) : null}
      </header>

      {count === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="grid gap-2">{children}</ul>
      )}
    </section>
  );
}

/** A one-line, zero-JavaScript disclosure. */
function Disclosure({
  summary,
  children,
}: {
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border bg-card px-3 text-sm font-medium text-muted-foreground">
        {summary}
        <ChevronDown className="ms-auto size-4 transition-transform group-open:rotate-180" />
      </summary>
      {children}
    </details>
  );
}
