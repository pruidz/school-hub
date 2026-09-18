import type { ChildUiMode } from "@/lib/db.types";

/**
 * `children.ui_mode` for the home screen, in one place — the same idea as
 * `features/lessons/ui-mode.ts`, so a component asks `ui.collapsePrepare`
 * instead of testing `mode === "simple"` in a dozen render branches.
 *
 *   simple — a seven-year-old: fewer sections open at once and bigger targets.
 *            „მოსამზადებელი" is folded to a single line rather than removed:
 *            hiding open homework from the child who owns it would be a lie,
 *            and the work is still one tap away.
 *   full   — a teenager: every section expanded, counts visible.
 */
export type HomeUi = {
  mode: ChildUiMode;
  /** Row size for homework items. */
  itemSize: "default" | "lg";
  /** Fold „მოსამზადებელი" into a one-line disclosure. */
  collapsePrepare: boolean;
  /** Per-section counts next to the heading. */
  showCounters: boolean;
  headingClass: string;
  /** The section that currently owns the screen. */
  leadHeadingClass: string;
};

const SIMPLE: HomeUi = {
  mode: "simple",
  itemSize: "lg",
  collapsePrepare: true,
  showCounters: false,
  headingClass: "text-lg font-semibold",
  leadHeadingClass: "text-2xl font-bold",
};

const FULL: HomeUi = {
  mode: "full",
  itemSize: "default",
  collapsePrepare: false,
  showCounters: true,
  headingClass: "text-base font-semibold",
  leadHeadingClass: "text-xl font-bold",
};

export function homeUi(mode: ChildUiMode): HomeUi {
  return mode === "simple" ? SIMPLE : FULL;
}
