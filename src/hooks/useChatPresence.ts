/**
 * Typing indicator + online presence for the open chat thread.
 *
 * Wraps the shared `joinChatPresence` (Realtime broadcast/presence — no table,
 * no migration) in React lifecycle so the channel is torn down when the thread
 * closes or the user switches chats.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { joinChatPresence, type ChatPresenceHandle, type TypingUser } from '@synth/shared';
import { supabase } from '@/integrations/supabase/client';

/** Own display name, for the "<name> is typing…" the other side sees. Fetched once. */
function useOwnDisplayName(userId: string): string {
  const [name, setName] = useState('Someone');

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    void supabase
      .from('users')
      .select('name, username')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const resolved =
          (typeof data.name === 'string' && data.name.trim()) ||
          (typeof data.username === 'string' && data.username.trim()) ||
          '';
        if (resolved) setName(resolved);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return name;
}

export function useChatPresence(chatId: string | null | undefined, userId: string) {
  const userName = useOwnDisplayName(userId);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const handleRef = useRef<ChatPresenceHandle | null>(null);

  // Read through a ref, not a dependency: the name arrives a moment after mount,
  // and putting it in the deps below rejoins the channel on every chat open.
  const userNameRef = useRef(userName);
  userNameRef.current = userName;

  useEffect(() => {
    if (!chatId || !userId) return;

    // Reset immediately: state from the previous chat must never leak into this one.
    setTypingUsers([]);

    const handle = joinChatPresence(supabase, {
      chatId,
      userId,
      userName: () => userNameRef.current,
      onTypingChange: setTypingUsers,
    });
    handleRef.current = handle;

    return () => {
      handleRef.current = null;
      void handle.leave();
    };
  }, [chatId, userId]);

  const setTyping = useCallback((isTyping: boolean) => {
    handleRef.current?.setTyping(isTyping);
  }, []);

  return { typingUsers, setTyping };
}
