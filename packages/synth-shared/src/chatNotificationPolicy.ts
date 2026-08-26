/**
 * Chat notification policy — shared by web, mobile, the Vercel push webhook and
 * the backend push worker.
 *
 * History worth knowing: chat notifications were switched off entirely on
 * 2026-08-25 (trigger dropped, every read path hard-blocked). They came back on
 * 2026-08-26 with real controls, so the hard blocks are gone and these types are
 * ordinary notifications again. What stops the spam now lives in the database:
 *
 *   - `notify_chat_message_v2()` INSERTs one notification per chat and UPDATEs
 *     it for subsequent messages. The push webhook only fires on INSERT, so a
 *     burst pings once. See supabase/chat-parity-2026-08-25/04 and /05.
 *
 * The switches, most general first:
 *
 *   enable_push_notifications          default true   master switch for push
 *   enable_chat_notifications          default true   chat creates notifications
 *   enable_entity_chat_notifications   default false  genre/event/artist/venue rooms
 *   chat_participants.notifications_muted            per-chat override
 *
 * All four are enforced in the database trigger, which is the only place a chat
 * notification is created. Clients read them to render the settings UI, not to
 * gate delivery — a client-side gate would be a second source of truth.
 */

/** Notification types produced by chat. */
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
 * Chat entity rooms — high-volume, so notifications for them are opt-in via
 * `enable_entity_chat_notifications`. A null entity_type is a direct or
 * ordinary group chat and is governed by `enable_chat_notifications` instead.
 */
export const ENTITY_CHAT_TYPES = ['event', 'artist', 'venue', 'genre', 'scene'] as const;

export type EntityChatType = (typeof ENTITY_CHAT_TYPES)[number];

export function isEntityChatType(entityType: string | null | undefined): boolean {
  return !!entityType && (ENTITY_CHAT_TYPES as readonly string[]).includes(entityType);
}

/** The user-facing notification switches, as stored on user_settings_preferences. */
export interface ChatNotificationSettings {
  /** Master push switch across every notification type. */
  enable_push_notifications: boolean;
  /** Chat messages create notifications at all. */
  enable_chat_notifications: boolean;
  /** Genre / event / artist / venue / scene rooms. Off by default. */
  enable_entity_chat_notifications: boolean;
}

export const DEFAULT_CHAT_NOTIFICATION_SETTINGS: ChatNotificationSettings = {
  enable_push_notifications: true,
  enable_chat_notifications: true,
  // Deliberately off: these rooms can have hundreds of members.
  enable_entity_chat_notifications: false,
};

/**
 * Would a message in this chat notify this user? Mirrors the trigger's filter.
 *
 * For explaining state in the UI ("You won't get notified about this chat"),
 * NOT for gating delivery — the database decides that.
 */
export function wouldNotify(
  settings: Partial<ChatNotificationSettings> | null | undefined,
  chat: { entity_type?: string | null },
  chatMuted: boolean
): boolean {
  if (chatMuted) return false;

  const merged = { ...DEFAULT_CHAT_NOTIFICATION_SETTINGS, ...(settings ?? {}) };
  if (!merged.enable_chat_notifications) return false;
  if (isEntityChatType(chat.entity_type) && !merged.enable_entity_chat_notifications) {
    return false;
  }
  return true;
}

/** Why a chat is silent, for a one-line explanation under the mute toggle. */
export function muteReason(
  settings: Partial<ChatNotificationSettings> | null | undefined,
  chat: { entity_type?: string | null },
  chatMuted: boolean
): string | null {
  if (chatMuted) return 'Muted';

  const merged = { ...DEFAULT_CHAT_NOTIFICATION_SETTINGS, ...(settings ?? {}) };
  if (!merged.enable_chat_notifications) {
    return 'Chat notifications are off in Settings';
  }
  if (isEntityChatType(chat.entity_type) && !merged.enable_entity_chat_notifications) {
    return 'Room notifications are off in Settings';
  }
  if (!merged.enable_push_notifications) {
    return 'Push is off in Settings — you will still see these in notifications';
  }
  return null;
}
