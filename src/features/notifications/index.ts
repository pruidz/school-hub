/**
 * Public surface of the notifications feature (phase 2).
 *
 * `<NotificationBell />` is a Client Component with no required props — mount
 * it anywhere inside an authenticated shell:
 *
 *   parent header  <NotificationBell />
 *   kid header     <NotificationBell variant="kid" />
 *
 * `<NotificationCountBadge />` is the same data with no popover, for
 * decorating an existing link such as the kid tab bar's chat tab.
 */

export {
  NotificationBell,
  NotificationCountBadge,
  type NotificationBellProps,
} from "./notification-bell";

export {
  notificationHref,
  notificationSubtitle,
  notificationTitle,
  parseNotificationPayload,
} from "./payload";

export {
  NOTIFICATION_TYPES,
  isNotificationType,
  type NotificationAudience,
  type NotificationFeed,
  type NotificationItem,
  type NotificationPayload,
  type NotificationType,
} from "./types";

export {
  loadNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "./actions";
