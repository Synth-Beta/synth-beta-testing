/**
 * Typing indicators for a chat thread.
 *
 * Uses Supabase Realtime Broadcast, which is transported over the websocket and
 * never touches Postgres — so this needs no table, no migration and no row in the
 * `supabase_realtime` publication. It is also why typing state is correctly
 * ephemeral: nothing to clean up when someone force-quits the app.
 *
 * Shared by web and mobile so both platforms agree on the channel name and payload
 * shape. A web client and a mobile client in the same chat see each other.
 *
 * ---------------------------------------------------------------------------
 * Two things here are deliberate, both learned from a crash:
 *
 * 1. NO Supabase Presence. `RealtimeChannel.on()` throws
 *    "cannot add presence callbacks after joining a channel" if a presence
 *    listener is registered on an already-joined channel — and
 *    `RealtimeClient.channel(topic)` returns an EXISTING channel for a topic
 *    rather than making a new one. React remounts (StrictMode, Fast Refresh, or
 *    just reopening the same chat) therefore hit a joined channel and threw.
 *    Presence was only ever feeding an `onlineUserIds` value that no screen
 *    rendered, so it is gone. Broadcast listeners have no such guard.
 *
 * 2. ONE channel per chat, created once and reused. Because `channel()` dedupes
 *    by topic and `removeChannel()` awaits a full unsubscribe round trip, tearing
 *    the channel down on unmount races any remount that follows. Instead the
 *    channel is kept and only the listeners come and go.
 *
 * ponytail: channels accumulate one per chat visited per session and are never
 * removed. Fine for realistic use (Supabase allows ~100 per client); add LRU
 * eviction of listener-less rooms if a session could ever open that many chats.
 * ---------------------------------------------------------------------------
 */

import type { SynthSupabaseClient } from './supabaseClientType';

/** A typing indicator expires this long after the last keystroke broadcast. */
export const TYPING_TIMEOUT_MS = 5000;

/** Keystrokes are throttled to at most one broadcast per this interval. */
export const TYPING_BROADCAST_INTERVAL_MS = 2000;

export interface TypingUser {
  userId: string;
  name: string;
}

export interface ChatPresenceOptions {
  chatId: string;
  userId: string;
  /**
   * Display name shown as "<name> is typing…".
   *
   * Accepts a getter so callers whose name loads asynchronously do not have to
   * put it in an effect dependency — passing a changing string there tears the
   * subscription down and rebuilds it on every chat open.
   */
  userName: string | (() => string);
  /** Fires whenever the set of *other* users currently typing changes. */
  onTypingChange?: (users: TypingUser[]) => void;
}

export interface ChatPresenceHandle {
  /**
   * Call on every keystroke. Throttled internally, so calling it per character is
   * fine. Pass `false` when the composer is cleared or the message is sent.
   */
  setTyping(isTyping: boolean): void;
  /** Detach this subscriber. Safe to call twice. */
  leave(): Promise<void>;
}

interface TypingPayload {
  userId: string;
  name: string;
  isTyping: boolean;
}

type TypingListener = (users: TypingUser[]) => void;

interface TypingRoom {
  channel: any;
  listeners: Set<TypingListener>;
  /** Who is currently typing, excluding the local user. */
  typingUsers: Map<string, TypingUser>;
  /** Per-user expiry, so a sender who crashes stops showing as typing. */
  timers: Map<string, ReturnType<typeof setTimeout>>;
}

/** Keyed by channel topic. One room per chat for the life of the session. */
const rooms = new Map<string, TypingRoom>();

function emit(room: TypingRoom) {
  const users = [...room.typingUsers.values()];
  for (const listener of room.listeners) listener(users);
}

function clearTypingFor(room: TypingRoom, userId: string) {
  const timer = room.timers.get(userId);
  if (timer) clearTimeout(timer);
  room.timers.delete(userId);
  if (room.typingUsers.delete(userId)) emit(room);
}

/**
 * Gets the room for a chat, creating and subscribing the channel on first use.
 * `localUserId` only decides whose broadcasts to ignore; it is the same for every
 * subscriber on a device.
 */
function getRoom(
  supabase: SynthSupabaseClient,
  topic: string,
  localUserId: string
): TypingRoom {
  const existing = rooms.get(topic);
  if (existing) return existing;

  const channel = supabase.channel(topic);
  const room: TypingRoom = {
    channel,
    listeners: new Set(),
    typingUsers: new Map(),
    timers: new Map(),
  };
  rooms.set(topic, room);

  channel
    .on('broadcast', { event: 'typing' }, ({ payload }: { payload: TypingPayload }) => {
      // Never render yourself as typing.
      if (!payload?.userId || payload.userId === localUserId) return;

      if (!payload.isTyping) {
        clearTypingFor(room, payload.userId);
        return;
      }

      const previous = room.timers.get(payload.userId);
      if (previous) clearTimeout(previous);

      const before = room.typingUsers.size;
      room.typingUsers.set(payload.userId, {
        userId: payload.userId,
        name: payload.name || 'Someone',
      });
      room.timers.set(
        payload.userId,
        setTimeout(() => clearTypingFor(room, payload.userId), TYPING_TIMEOUT_MS)
      );

      if (room.typingUsers.size !== before) emit(room);
    })
    .subscribe();

  return room;
}

/**
 * Subscribes to typing activity for one chat.
 *
 * The returned handle must be `leave()`d when the thread closes, or the caller's
 * callback keeps firing after unmount.
 */
export function joinChatPresence(
  supabase: SynthSupabaseClient,
  options: ChatPresenceOptions
): ChatPresenceHandle {
  const { chatId, userId, userName, onTypingChange } = options;

  const topic = `chat-typing-${chatId}`;
  const room = getRoom(supabase, topic, userId);

  const listener: TypingListener = (users) => onTypingChange?.(users);
  room.listeners.add(listener);

  // A subscriber joining an active room should see who is already typing.
  if (room.typingUsers.size > 0) listener([...room.typingUsers.values()]);

  /** Resolved at broadcast time, so a late-loading name is still correct. */
  const resolveUserName = (): string =>
    (typeof userName === 'function' ? userName() : userName) || 'Someone';

  let lastBroadcastAt = 0;
  let selfTypingResetTimer: ReturnType<typeof setTimeout> | null = null;
  let left = false;

  function broadcastTyping(isTyping: boolean) {
    void room.channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId, name: resolveUserName(), isTyping } satisfies TypingPayload,
    });
  }

  return {
    setTyping(isTyping: boolean) {
      if (left) return;

      if (!isTyping) {
        if (selfTypingResetTimer) {
          clearTimeout(selfTypingResetTimer);
          selfTypingResetTimer = null;
        }
        lastBroadcastAt = 0;
        broadcastTyping(false);
        return;
      }

      // Throttle: one broadcast per interval no matter how fast someone types.
      const now = Date.now();
      if (now - lastBroadcastAt >= TYPING_BROADCAST_INTERVAL_MS) {
        lastBroadcastAt = now;
        broadcastTyping(true);
      }

      // Tell the others to stop showing the indicator if typing stops without a
      // send — otherwise their own expiry timer is the only thing clearing it.
      if (selfTypingResetTimer) clearTimeout(selfTypingResetTimer);
      selfTypingResetTimer = setTimeout(() => {
        lastBroadcastAt = 0;
        broadcastTyping(false);
      }, TYPING_TIMEOUT_MS - TYPING_BROADCAST_INTERVAL_MS);
    },

    async leave() {
      if (left) return;
      left = true;

      if (selfTypingResetTimer) clearTimeout(selfTypingResetTimer);
      room.listeners.delete(listener);

      try {
        broadcastTyping(false);
      } catch {
        /* channel may already be closed */
      }

      // The channel itself is intentionally left subscribed — see the note at the
      // top of this file. With no listeners nothing renders, and reopening this
      // chat reuses it instead of racing a half-finished teardown.
      if (room.listeners.size === 0) {
        for (const timer of room.timers.values()) clearTimeout(timer);
        room.timers.clear();
        room.typingUsers.clear();
      }
    },
  };
}

/** "Alex is typing…" / "Alex and Sam are typing…" / "3 people are typing…" */
export function formatTypingIndicator(users: TypingUser[]): string {
  if (users.length === 0) return '';
  if (users.length === 1) return `${users[0]!.name} is typing…`;
  if (users.length === 2) return `${users[0]!.name} and ${users[1]!.name} are typing…`;
  return `${users.length} people are typing…`;
}
