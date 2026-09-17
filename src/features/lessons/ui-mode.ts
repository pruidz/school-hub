import type { ChildUiMode } from "@/lib/db.types";

/**
 * `children.ui_mode` in one place.
 *
 * Every difference between the two kid modes is a field of this object, so a
 * component reads `ui.showNotes` instead of testing `mode === "simple"` in a
 * dozen places. Adding a third mode later means adding one entry here.
 *
 *   simple — a 7-year-old: two controls per lesson (what we covered, a photo),
 *            oversized targets, no numbers to read.
 *   full   — a teenager: notes for the parent, topic suggestions, counters.
 */
export type LessonUi = {
  mode: ChildUiMode;
  /** The free-text note the parent reads. */
  showNotes: boolean;
  /** Topic chips taken from `topics` of that subject. */
  showTopicSuggestions: boolean;
  /** Progress counters ("3/6 filled in") and per-lesson badges. */
  showCounters: boolean;
  /** shadcn size token for the primary controls. */
  controlSize: "default" | "lg";
  /** Tailwind classes, kept here so the two modes cannot drift apart. */
  cardPadding: string;
  subjectTextClass: string;
  inputClass: string;
  actionClass: string;
};

const SIMPLE: LessonUi = {
  mode: "simple",
  showNotes: false,
  showTopicSuggestions: false,
  showCounters: false,
  controlSize: "lg",
  cardPadding: "p-4",
  subjectTextClass: "text-xl font-bold",
  inputClass: "h-14 text-lg",
  actionClass: "h-14 text-base",
};

const FULL: LessonUi = {
  mode: "full",
  showNotes: true,
  showTopicSuggestions: true,
  showCounters: true,
  controlSize: "default",
  cardPadding: "p-4",
  subjectTextClass: "text-lg font-semibold",
  inputClass: "h-11",
  actionClass: "h-11",
};

export function lessonUi(mode: ChildUiMode): LessonUi {
  return mode === "simple" ? SIMPLE : FULL;
}
