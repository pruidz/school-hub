/**
 * Realtime is the one place in this app where the browser talks to Supabase
 * directly (CLAUDE.md, "Data access rules"). Everything here is a Client
 * Component hook, and none of it writes: a socket event is only ever a signal
 * to re-read through a Server Action, so RLS, joins and signed URLs all stay on
 * the server.
 */

export { isDegraded, type RealtimeStatus, type ResyncReason } from "./status";

export {
  useRealtimeChannel,
  type ChangePayload,
  type PostgresEvent,
  type UseRealtimeChannelOptions,
} from "./use-realtime-channel";

export {
  useRealtimeMessages,
  type LiveMessage,
  type LiveMessageState,
  type SendDraft,
  type UseRealtimeMessagesOptions,
  type UseRealtimeMessagesResult,
} from "./use-realtime-messages";

export {
  useRealtimeNotifications,
  type UseRealtimeNotificationsOptions,
  type UseRealtimeNotificationsResult,
} from "./use-realtime-notifications";
