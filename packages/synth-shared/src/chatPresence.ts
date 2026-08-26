/**
 * Typing indicators and online presence for a chat thread.
 *
 * Uses Supabase Realtime Broadcast + Presence, which are transported over the
 * websocket and never touch Postgres — so this needs no table, no migration and no
 * row in the `supabase_realtime` publication. It is also why typing state is
 * correctly ephemeral: nothing to clean up when someone force-quits the app.
 *
 * Shared by web and mobile so both platforms agree on channel names and payload
 * shape. A web client and a mobile client in the same chat see each other.
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
   * channel down and rejoins it on every chat open.
   */
  userName: string | (() => string);
  /** Fires whenever the set of *other* users currently typing changes. */
  onTypingChange?: (users: TypingUser[]) => void;
  /** Fires whenever the set of *other* users present in the thread changes. */
  onPresenceChange?: (userIds: string[]) => void;
}

export interface ChatPresenceHandle {
  /**
   * Call on every keystroke. Throttled internally, so calling it per character is
   * fine. Pass `false` when the composer is cleared or the message is sent.
   */
  setTyping(isTyping: boolean): void;
  /** Unsubscribe and clear all timers. Safe to call twice. */
  leave(): Promise<void>;
}

interface TypingPayload {
  userId: string;
  name: string;
  isTyping: boolean;
}

/**
 * Joins the presence channel for one chat.
 *
 * The returned handle must be `leave()`d when the thread closes — otherwise the
 * channel stays subscribed and the user shows as present in a chat they have left.
 */
export function joinChatPresence(
  supabase: SynthSupabaseClient,
  options: ChatPresenceOptions
): ChatPresenceHandle {
  const { chatId, userId, userName, onTypingChange, onPresenceChange } = options;

  /** Resolved at broadcast time, so a late-loading name is still correct. */
  const resolveUserName = (): string =>
    (typeof userName === 'function' ? userName() : userName) || 'Someone';

  // Per-chat channel name, shared by both platforms. Do not change without
  // changing it on both, or web and mobile stop seeing each other.
  const channel = supabase.channel(`chat-presence-${chatId}`, {
    config: { presence: { key: userId } },
  });

  /** userId -> timer that removes them from the typing set if they go quiet. */
  const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const typingUsers = new Map<string, TypingUser>();

  let lastBroadcastAt = 0;
  let selfTypingResetTimer: ReturnType<typeof setTimeout> | null = null;
  let left = false;

  function emitTyping() {
    onTypingChange?.([...typingUsers.values()]);
  }

  function clearTypingFor(id: string) {
    const timer = typingTimers.get(id);
    if (timer) clearTimeout(timer);
    typingTimers.delete(id);
    if (typingUsers.delete(id)) emitTyping();
  }

  function markTyping(payload: TypingPayload) {
    // Never render yourself as typing.
    if (!payload?.userId || payload.userId === userId) return;

    if (!payload.isTyping) {
      clearTypingFor(payload.userId);
      return;
    }

    const existing = typingTimers.get(payload.userId);
    if (existing) clearTimeout(existing);

    const before = typingUsers.size;
    typingUsers.set(payload.userId, {
      userId: payload.userId,
      name: payload.name || 'Someone',
    });

    // Expiry is what makes this safe: a sender who crashes mid-keystroke stops
    // showing as typing without needing to tell us anything.
    typingTimers.set(
      payload.userId,
      setTimeout(() => clearTypingFor(payload.userId), TYPING_TIMEOUT_MS)
    );

    if (typingUsers.size !== before) emitTyping();
  }

  channel
    .on('broadcast', { event: 'typing' }, ({ payload }: { payload: TypingPayload }) => {
      markTyping(payload);
    })
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState() as Record<string, unknown[]>;
      const others = Object.keys(state).filter((id) => id !== userId);
      onPresenceChange?.(others);
    })
    .on('presence', { event: 'leave' }, ({ key }: { key: string }) => {
      // Someone closing the thread should not leave a stale "typing…" behind.
      clearTypingFor(key);
    })
    .subscribe((status: string) => {
      if (status === 'SUBSCRIBED' && !left) {
        void channel.track({ userId, online_at: new Date().toISOString() });
      }
    });

  function broadcastTyping(isTyping: boolean) {
    void channel.send({
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
      for (const timer of typingTimers.values()) clearTimeout(timer);
      typingTimers.clear();
      typingUsers.clear();

      try {
        broadcastTyping(false);
        await channel.untrack();
      } catch {
        /* channel may already be closed */
      }
      await supabase.removeChannel(channel);
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
