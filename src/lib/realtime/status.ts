/**
 * Connection state of a realtime subscription, as the UI needs to think about
 * it. Deliberately coarser than Supabase's channel states.
 *
 *   idle        nothing to subscribe to yet (no id, or disabled)
 *   connecting  a channel is joining, first time or after a drop
 *   live        joined; inserts are arriving
 *   offline     dropped or failed; a retry is scheduled and the fallback poll
 *               is running. The screen still works — it just refreshes on a
 *               timer instead of on a socket frame.
 *   unavailable realtime cannot run at all here (no Supabase env vars, or the
 *               client could not be constructed). Never retried.
 *
 * Nothing in the UI may gate rendering on this. A thread renders from its
 * server-rendered messages whatever the socket is doing.
 */
export type RealtimeStatus =
  | "idle"
  | "connecting"
  | "live"
  | "offline"
  | "unavailable";

/** Why the consumer is being asked to re-read from the server. */
export type ResyncReason =
  | "reconnect"
  | "visible"
  | "online"
  | "poll"
  | "manual";

export function isDegraded(status: RealtimeStatus): boolean {
  return status === "offline" || status === "unavailable";
}
