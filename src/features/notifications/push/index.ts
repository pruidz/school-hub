/**
 * Public surface of Web Push.
 *
 * Two things the rest of the app needs:
 *
 *   <PushSettingsCard variant="parent" />   the section in /parent/settings
 *   <PushSettingsCard variant="kid" />      the same in /kid/me
 *
 *   schedulePushForAssignment(assignmentId) one line in every Server Action
 *                                           that can cause a notification,
 *                                           next to the revalidate call.
 *
 * Nothing else is exported on purpose. `send.ts`, `config.ts` and `queries.ts`
 * are `server-only` and reachable by path when a test or a future sweeper needs
 * them, but no screen should be reaching past this file.
 */

export { PushSettingsCard } from "./push-section";
export {
  deliverAssignmentPush,
  schedulePushForAssignment,
} from "./deliver";
export type {
  PushDeviceList,
  PushDeviceView,
  PushEnvelope,
} from "./types";
