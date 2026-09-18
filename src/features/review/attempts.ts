/**
 * Turning one assignment's audit trail into a list of attempts.
 *
 * SPEC 4b: an *attempt* is one submission plus the verdict on it, and the
 * review screen is a chronology of them — `redo_count = 2` means three
 * attempts. `attachments` carries no attempt number, so the grouping is DERIVED
 * here from `assignment_events`, which is append-only and has been written by
 * the trigger in `0003_functions.sql` since the first row of live data existed.
 * That is what makes assignments created before this screen group correctly:
 * nothing has to have been recorded at upload time.
 *
 * The derivation in one sentence: an attempt begins when work resumes after the
 * previous attempt was handed in, and ends when it is handed in itself.
 *
 *   insert (-> assigned)            attempt 1 opens
 *   ... -> submitted                attempt 1 closes, verdict pending
 *   -> redo (comment)               attempt 1's verdict
 *   redo -> in_progress             attempt 2 opens   (redo_count += 1)
 *   ... -> submitted                attempt 2 closes
 *
 * `approved -> in_progress` (the parent's own correction) opens a new attempt
 * on exactly the same rule, which is why the boundary is "work resumed after a
 * submission" rather than "redo_count changed" — the two differ, and only one
 * of them is right.
 *
 * Evidence is placed by timestamp: a file belongs to the last attempt that had
 * opened when it was created. That puts the child's photos in the attempt they
 * were taken for, and a parent's `review` annotation — uploaded after the
 * submission but before the child starts again — on the attempt it annotates.
 *
 * Pure and dependency-free: a Server Component builds this and the UI only
 * renders it.
 */

import type { Attachment } from "@/lib/db.types";
import type { AssignmentStatus } from "@/lib/assignment-status";

/** One row of `assignment_events`, as the review query selects it. */
export type AttemptEventInput = {
  id: string;
  createdAt: string;
  fromStatus: AssignmentStatus | null;
  toStatus: AssignmentStatus;
  comment: string | null;
  actorName: string | null;
};

/** A parent's decision on one attempt. */
export type AttemptVerdict = {
  id: string;
  status: Extract<AssignmentStatus, "approved" | "redo">;
  comment: string | null;
  at: string;
  actorName: string | null;
};

export type ReviewAttempt = {
  /** 1-based, in chronological order. */
  index: number;
  /** When work on this attempt started. `null` for the first one. */
  startedAt: string | null;
  /** `null` while the attempt is still being worked on. */
  submittedAt: string | null;
  /**
   * Usually one. More than one only when the parent revisited an already
   * approved attempt (`approved -> redo`), which is a correction on the same
   * work and belongs on the same block.
   */
  verdicts: AttemptVerdict[];
  /** Everything uploaded inside this attempt's window, any kind. */
  attachments: Attachment[];
  /** Nothing was handed in yet — this is the round in progress. */
  open: boolean;
  /**
   * `self_rating` / `minutes_spent` / `difficulty_note` are columns on
   * `assignments`, so a re-submission overwrites them. Only the most recent
   * submitted attempt can honestly claim them; for every earlier one the
   * numbers are gone and the UI says so instead of repeating today's values.
   */
  selfRating: number | null;
  minutesSpent: number | null;
  difficultyNote: string | null;
  /** False when this attempt's self-assessment was overwritten by a later one. */
  feedbackKnown: boolean;
};

type Draft = Omit<
  ReviewAttempt,
  "open" | "selfRating" | "minutesSpent" | "difficultyNote" | "feedbackKnown"
>;

function ms(iso: string): number {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? 0 : value;
}

export type BuildAttemptsInput = {
  assignment: {
    status: AssignmentStatus;
    self_rating: number | null;
    minutes_spent: number | null;
    difficulty_note: string | null;
  };
  events: AttemptEventInput[];
  attachments: Attachment[];
};

/**
 * Attempts oldest-first. Always at least one, so a brand-new assignment still
 * renders a block to drop evidence into rather than an empty screen.
 */
export function buildAttempts({
  assignment,
  events,
  attachments,
}: BuildAttemptsInput): ReviewAttempt[] {
  const ordered = [...events].sort(
    (a, b) => ms(a.createdAt) - ms(b.createdAt) || a.id.localeCompare(b.id),
  );

  const drafts: Draft[] = [
    { index: 1, startedAt: null, submittedAt: null, verdicts: [], attachments: [] },
  ];
  let current = drafts[0]!;

  for (const event of ordered) {
    if (event.toStatus === "submitted") {
      // A second `-> submitted` inside one attempt cannot happen (the status
      // machine forbids submitted -> submitted), so this never overwrites.
      current.submittedAt = event.createdAt;
      continue;
    }

    if (event.toStatus === "approved" || event.toStatus === "redo") {
      current.verdicts.push({
        id: event.id,
        status: event.toStatus,
        comment: event.comment,
        at: event.createdAt,
        actorName: event.actorName,
      });
      continue;
    }

    // Work resumed. Only a NEW round if the current one was already handed in —
    // `assigned -> in_progress` at the very start is the same attempt.
    if (current.submittedAt) {
      current = {
        index: drafts.length + 1,
        startedAt: event.createdAt,
        submittedAt: null,
        verdicts: [],
        attachments: [],
      };
      drafts.push(current);
    }
  }

  // ---- evidence, by the window it was created in -----------------------------
  for (const attachment of attachments) {
    const at = ms(attachment.created_at);
    let target = drafts[0]!;
    for (const draft of drafts) {
      if (draft.startedAt !== null && ms(draft.startedAt) <= at) target = draft;
    }
    target.attachments.push(attachment);
  }

  for (const draft of drafts) {
    draft.attachments.sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        ms(a.created_at) - ms(b.created_at) ||
        a.id.localeCompare(b.id),
    );
  }

  // ---- the one attempt whose self-assessment survives -------------------------
  const lastSubmitted = [...drafts]
    .reverse()
    .find((draft) => draft.submittedAt !== null);

  return drafts.map((draft) => {
    const owns = lastSubmitted !== undefined && draft.index === lastSubmitted.index;
    return {
      ...draft,
      open: draft.submittedAt === null,
      selfRating: owns ? assignment.self_rating : null,
      minutesSpent: owns ? assignment.minutes_spent : null,
      difficultyNote: owns ? assignment.difficulty_note : null,
      feedbackKnown: owns,
    };
  });
}

/**
 * The attempt the parent is acting on: the newest one. Rendered expanded, with
 * every older attempt collapsed behind it.
 */
export function latestAttempt(attempts: ReviewAttempt[]): ReviewAttempt | null {
  return attempts[attempts.length - 1] ?? null;
}
