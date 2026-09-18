/**
 * Public surface of the assignments feature (A4).
 *
 * `KidDayAssignments` / `ParentDayAssignments` are Server Components, so this
 * barrel pulls in `server-only` code — import it from a Server Component. A
 * Client Component that only needs the badge should import
 * `@/features/assignments/status-badge` directly.
 */

export { KidDayAssignments, ParentDayAssignments } from "./day-assignments";
export { AssignmentStatusBadge } from "./status-badge";
export { AssignmentRow } from "./assignment-row";

export {
  dueState,
  formatDateTime,
  formatDueLabel,
  formatLongDate,
  formatShortDate,
  formatTimeOnly,
  formatWaitedFor,
  parseCalendarDate,
  todayString,
  toDateString,
  weekBounds,
  type DueState,
} from "./dates";

export { KidQuickAdd, type KidQuickAddProps } from "./kid-quick-add";

export {
  assignmentAuthor,
  getAssignmentEditorData,
  getDashboard,
  getDayAssignmentsForChild,
  getInbox,
  getKidAssignmentDetail,
  getKidAssignments,
  getParentAssignments,
  getReviewBundle,
  listFamilyChildren,
  listSubjects,
  nextSchoolDay,
  type AssignmentAuthor,
  type AssignmentEditorData,
  type ChildDashboard,
  type ChildLite,
  type InboxData,
  type InboxItem,
  type KidAssignmentDetail,
  type KidAssignmentItem,
  type KidAssignmentList,
  type ParentAssignmentItem,
  type ParentAssignmentList,
  type ReviewBundle,
  type ReviewComment,
  type SubjectLite,
} from "./queries";

export {
  approveAssignmentAction,
  createAssignmentAction,
  createAssignmentAsChildAction,
  deleteAssignmentAction,
  reopenAssignmentAction,
  requestRedoAction,
  startAssignmentAction,
  submitAssignmentAction,
  updateAssignmentAction,
  type AssignmentFormState,
} from "./actions";

export { assignmentErrorMessage } from "./errors";
