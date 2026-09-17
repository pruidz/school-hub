import "server-only";

import type { ChildUiMode } from "@/lib/db.types";
import { ka, t } from "@/lib/i18n/ka";
import { isoWeekday } from "@/features/schedule/dates";
import { listTopics } from "@/features/schedule/queries";

import { LessonCard } from "./lesson-card";
import { LessonsAutoBuild } from "./lessons-auto-build";
import { countPendingLessons, listDayLessons } from "./queries";
import { lessonUi } from "./ui-mode";

/**
 * The day's lessons for one child, already materialised from the timetable.
 *
 * Server Component: it reads, decides whether anything still has to be created
 * and hands the writing to `<LessonsAutoBuild />`.
 */
export async function DayLessons({
  childId,
  date,
  uiMode,
  readOnly = false,
}: {
  childId: string;
  date: string;
  uiMode: ChildUiMode;
  readOnly?: boolean;
}) {
  const ui = lessonUi(uiMode);

  const [lessons, topics, pending] = await Promise.all([
    listDayLessons(childId, date),
    listTopics(childId),
    readOnly ? Promise.resolve(0) : countPendingLessons(childId, date, isoWeekday(date)),
  ]);

  const suggestionsFor = (subjectId: string | null) =>
    subjectId
      ? topics
          .filter((topic) => topic.subjectId === subjectId)
          .map((topic) => topic.name)
      : [];

  const filled = lessons.filter(
    (lesson) => (lesson.topic ?? "").trim().length > 0 || lesson.noHomework,
  ).length;

  return (
    <section className="grid gap-3">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{ka.kid.lessonsHeading}</h2>
        {ui.showCounters && lessons.length > 0 ? (
          <span className="text-sm text-muted-foreground">
            {t("kid.dayDoneCount", { done: filled, total: lessons.length })}
          </span>
        ) : null}
      </header>

      {readOnly ? null : (
        <LessonsAutoBuild childId={childId} date={date} missing={pending} />
      )}

      {lessons.length === 0 && pending === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center">
          <p className="font-medium">{ka.lessons.empty}</p>
          <p className="text-sm text-muted-foreground">
            {ka.lessons.emptyHint}
          </p>
        </div>
      ) : null}

      {lessons.map((lesson) => (
        <LessonCard
          key={`${lesson.id}:${lesson.topic ?? ""}:${lesson.notes ?? ""}:${lesson.noHomework}`}
          lesson={lesson}
          ui={ui}
          childId={childId}
          topicSuggestions={suggestionsFor(lesson.subjectId)}
          readOnly={readOnly}
        />
      ))}
    </section>
  );
}
