import { Check, Clock, RotateCcw, Star } from "lucide-react";

import { formatDateTime } from "@/features/assignments/dates";
import { splitEvidence } from "@/features/attachments/audio";
import { EvidenceGallery } from "@/features/attachments/evidence-gallery";
import type { ReviewAttempt, AttemptVerdict } from "@/features/review/attempts";
import { ka, t } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";

/**
 * SPEC 4b — the chronology. One vertical rail, one block per attempt, oldest
 * first, so the question this screen exists to answer ("is the child getting
 * better?") is answered by scrolling down it.
 *
 * A Server Component on purpose. Collapsing an older attempt is a `<details>`,
 * not React state: it works before hydration, it is what a screen reader
 * already understands, and it keeps the whole timeline out of the client
 * bundle. The only Client Component below it is the gallery, and it is handed
 * server-signed URLs so it makes no round trip of its own.
 *
 * Each attempt is colour-coded by its verdict, which is the entire point of the
 * screen: three blocks have to be tellable apart at a glance, on a phone, from
 * bed.
 */

type Tone = "approved" | "redo" | "awaiting" | "open";

function toneOf(attempt: ReviewAttempt): Tone {
  const last = attempt.verdicts[attempt.verdicts.length - 1];
  if (last) return last.status === "approved" ? "approved" : "redo";
  return attempt.submittedAt ? "awaiting" : "open";
}

const RAIL: Record<Tone, string> = {
  approved: "border-emerald-500/60 bg-emerald-500/[0.06]",
  redo: "border-destructive/50 bg-destructive/[0.05]",
  awaiting: "border-primary/50 bg-primary/[0.05]",
  open: "border-border bg-muted/30",
};

const DOT: Record<Tone, string> = {
  approved: "bg-emerald-600 text-white",
  redo: "bg-destructive text-white",
  awaiting: "bg-primary text-primary-foreground",
  open: "bg-muted-foreground/20 text-muted-foreground",
};

const CHIP: Record<Tone, string> = {
  approved: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400",
  redo: "bg-destructive/15 text-destructive",
  awaiting: "bg-primary/15 text-primary",
  open: "bg-muted text-muted-foreground",
};

function chipLabel(tone: Tone): string {
  switch (tone) {
    case "approved":
      return ka.review.attemptApproved;
    case "redo":
      return ka.review.attemptRedo;
    case "awaiting":
      return ka.review.attemptAwaiting;
    default:
      return ka.review.attemptNotSubmitted;
  }
}

/** „3 ფოტო · 1 ჩანაწერი", or only the half that exists. */
function evidenceSummary(photos: number, recordings: number): string {
  if (photos > 0 && recordings > 0) {
    return t("review.evidenceCount", { photos, recordings });
  }
  if (recordings > 0) return t("review.recordingsOnly", { count: recordings });
  if (photos > 0) return t("review.photosOnly", { count: photos });
  return ka.review.attemptNoEvidence;
}

export function AttemptTimeline({
  attempts,
  urls,
}: {
  attempts: ReviewAttempt[];
  /** `storage_path` -> signed URL, signed once for the whole page. */
  urls: Record<string, string>;
}) {
  const total = attempts.length;

  return (
    <section className="grid gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          {ka.review.attemptsTitle}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {t("review.attemptCount", { count: total })}
        </span>
      </div>

      <ol className="grid gap-2.5">
        {attempts.map((attempt) => (
          <li key={attempt.index}>
            <AttemptBlock
              attempt={attempt}
              total={total}
              urls={urls}
              // Newest open, older folded away but one tap from here.
              expanded={attempt.index === total}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

function AttemptBlock({
  attempt,
  total,
  urls,
  expanded,
}: {
  attempt: ReviewAttempt;
  total: number;
  urls: Record<string, string>;
  expanded: boolean;
}) {
  const tone = toneOf(attempt);

  // Task photos live once, at the top of the page; repeating them inside every
  // round would be the old undifferentiated pile again.
  const evidence = attempt.attachments.filter(
    (file) => file.kind !== "task_source",
  );
  const solution = evidence.filter((file) => file.kind !== "review");
  const annotations = evidence.filter((file) => file.kind === "review");
  const { photos, recordings } = splitEvidence(solution);

  const header = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span
        aria-hidden
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums",
          DOT[tone],
        )}
      >
        {attempt.index}
      </span>

      <span className="text-sm font-semibold">
        {attempt.index === total && total > 1
          ? t("review.attemptOf", { index: attempt.index, total })
          : t("review.attempt", { index: attempt.index })}
      </span>

      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[11px] font-medium",
          CHIP[tone],
        )}
      >
        {chipLabel(tone)}
      </span>

      <span className="text-xs text-muted-foreground">
        {attempt.submittedAt
          ? t("review.attemptSubmitted", {
              date: formatDateTime(attempt.submittedAt),
            })
          : ka.review.attemptCurrent}
      </span>

      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
        {evidenceSummary(photos.length, recordings.length)}
      </span>
    </div>
  );

  const body = (
    <div className="grid gap-3 pt-3">
      {solution.length > 0 ? (
        <EvidenceGallery
          attachments={solution}
          zoom
          initialUrls={urls}
          // Thumbnails, not page-width images: four across even on a 375px
          // phone, tapped to open the existing full-screen zoom.
          gridClassName="grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 2xl:grid-cols-8"
          emptyLabel={ka.review.attemptNoEvidence}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          {ka.review.attemptNoEvidence}
        </p>
      )}

      {annotations.length > 0 ? (
        <div className="grid gap-1.5">
          <h4 className="text-xs font-medium text-muted-foreground">
            {ka.review.annotations}
          </h4>
          <EvidenceGallery
            attachments={annotations}
            zoom
            initialUrls={urls}
            gridClassName="grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 2xl:grid-cols-8"
          />
        </div>
      ) : null}

      <ChildFeedback attempt={attempt} />

      {attempt.verdicts.map((verdict) => (
        <Verdict key={verdict.id} verdict={verdict} />
      ))}
    </div>
  );

  const frame = cn("rounded-xl border-l-4 border bg-card p-3", RAIL[tone]);

  if (expanded) {
    return (
      <section className={frame}>
        {header}
        {body}
      </section>
    );
  }

  return (
    <details className={cn(frame, "group")}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {header}
      </summary>
      {body}
    </details>
  );
}

/**
 * The child's own read on the work. `self_rating`, `minutes_spent` and
 * `difficulty_note` are columns on `assignments`, so a re-submission overwrites
 * them: only the latest submitted attempt can honestly show numbers. For every
 * earlier one this says so rather than repeating today's values on all three
 * blocks, which would be a fabricated comparison in exactly the place the
 * parent goes to compare.
 */
function ChildFeedback({ attempt }: { attempt: ReviewAttempt }) {
  if (!attempt.feedbackKnown) {
    if (!attempt.submittedAt) return null;
    return (
      <p className="text-[11px] text-muted-foreground italic">
        {ka.review.attemptFeedbackLost}
      </p>
    );
  }

  const hasNothing =
    attempt.selfRating === null &&
    attempt.minutesSpent === null &&
    !attempt.difficultyNote;
  if (hasNothing) return null;

  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-1 rounded-lg bg-background/60 px-2.5 py-2 text-xs">
      {attempt.selfRating !== null ? (
        <span className="inline-flex items-center gap-1 font-medium">
          <Star className="size-3.5 fill-amber-400 text-amber-500" />
          {attempt.selfRating} / 5
        </span>
      ) : null}

      {attempt.minutesSpent !== null ? (
        <span className="inline-flex items-center gap-1 font-medium">
          <Clock className="size-3.5 text-muted-foreground" />
          {attempt.minutesSpent} {ka.assignments.minutesUnit}
        </span>
      ) : null}

      {attempt.difficultyNote ? (
        <span className="min-w-0 flex-1 whitespace-pre-wrap text-muted-foreground">
          „{attempt.difficultyNote}“
        </span>
      ) : null}
    </div>
  );
}

function Verdict({ verdict }: { verdict: AttemptVerdict }) {
  const approved = verdict.status === "approved";

  return (
    <div
      className={cn(
        "grid gap-1 rounded-lg px-2.5 py-2",
        approved ? "bg-emerald-600/10" : "bg-destructive/10",
      )}
    >
      <p
        className={cn(
          "flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-semibold",
          approved
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-destructive",
        )}
      >
        {approved ? (
          <Check className="size-3.5" />
        ) : (
          <RotateCcw className="size-3.5" />
        )}
        {approved ? ka.review.attemptApproved : ka.review.attemptRedo}
        <span className="ml-auto font-normal text-muted-foreground">
          {verdict.actorName ? `${verdict.actorName} · ` : ""}
          {formatDateTime(verdict.at)}
        </span>
      </p>

      <p className="text-sm whitespace-pre-wrap">
        {verdict.comment ?? (
          <span className="text-muted-foreground">
            {ka.review.attemptNoComment}
          </span>
        )}
      </p>
    </div>
  );
}

/** Used by the page header to say "listen to this one" before scrolling. */
export function hasRecordings(attempts: ReviewAttempt[]): boolean {
  return attempts.some(
    (attempt) =>
      splitEvidence(
        attempt.attachments.filter((file) => file.kind === "solution"),
      ).recordings.length > 0,
  );
}
