/**
 * Public surface of the reports feature (P7).
 *
 * `./queries` is `server-only`, so this barrel may only be imported from a
 * Server Component. The pure halves — `./metrics` and `./windows` — carry no
 * such constraint and can be imported directly if anything ever needs them on
 * the client.
 */

export {
  getChildReport,
  getReportAssignments,
  isReportMetricFilter,
  REPORT_METRIC_FILTERS,
  type RecentReturn,
  type ReportData,
  type ReportListResult,
  type ReportMetricFilter,
  type ReportResult,
} from "./queries";

export {
  bySubject,
  computeMetrics,
  direction,
  percent,
  rowsIn,
  weakTopics,
  weeklyTrend,
  MIN_TOPIC_SAMPLE,
  MIN_WINDOW_SAMPLE,
  type Direction,
  type Metrics,
  type ReportRow,
  type SubjectMetrics,
  type TopicStat,
  type TrendPoint,
  type WeakTopics,
} from "./metrics";

export {
  isWindowKey,
  previousRange,
  resolveWindow,
  termBounds,
  trendWeeks,
  DEFAULT_WINDOW,
  TREND_WEEKS,
  WINDOW_KEYS,
  type DateRange,
  type ResolvedWindow,
  type TrendWeek,
  type WindowKey,
} from "./windows";

export {
  HeadlineStats,
  RecentReturns,
  SubjectBreakdown,
  TrendChart,
  WeakTopicsCard,
  WindowTabs,
  formatRange,
  reportListHref,
  type DrillTarget,
} from "./report-sections";
