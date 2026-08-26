/**
 * Chat is deliberately OUTSIDE the notification system.
 *
 * Unread messages are surfaced by the red dot on the chat icon — which reads
 * `messages` / `chat_participants.last_read_at`, never the `notifications`
 * table. Chat must therefore never produce:
 *   - a push notification
 *   - a bell entry
 *   - a bell badge count
 *
 * These types are excluded at every layer that reads or sends notifications, so
 * a stray row (a database trigger, an old backlog) still cannot reach the user.
 * The rows are stopped at source by
 * supabase/chat-parity-2026-08-25/03_disable_message_notifications.sql; this
 * constant is the belt to that migration's braces.
 */

/** Notification types that chat must never surface through. */
export const CHAT_NOTIFICATION_TYPES = [
  'message',
  'chat_message',
  'group_chat_invite',
] as const;

export type ChatNotificationType = (typeof CHAT_NOTIFICATION_TYPES)[number];

export function isChatNotificationType(type: string | null | undefined): boolean {
  return !!type && (CHAT_NOTIFICATION_TYPES as readonly string[]).includes(type);
}

/**
 * PostgREST `in` list for excluding chat types in a query:
 *   query.not('type', 'in', chatNotificationTypesFilter())
 *
 * Filtering in the query rather than in each caller means a new screen that
 * forgets to filter still cannot show chat notifications.
 */
export function chatNotificationTypesFilter(): string {
  return `(${CHAT_NOTIFICATION_TYPES.join(',')})`;
}
