import { useState, useEffect } from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';
import { supabase } from '../integrations/supabase/client';

/** Emitted by the chat screen right after mark_chat_as_read succeeds - see chat/[id].tsx. */
export const CHAT_READ_EVENT = 'synth:chat-read';

/**
 * Total unread DMs across chats (parity with web `useMainNavItems` / bottom nav dot).
 */
export function useUnreadMessageCount(userId: string | undefined): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }

    const fetchUnread = async () => {
      try {
        const { data: participantData } = await supabase
          .from('chat_participants')
          .select('chat_id, last_read_at')
          .eq('user_id', userId);

        if (!participantData?.length) {
          setCount(0);
          return;
        }

        let total = 0;
        for (const participant of participantData) {
          const lastRead = participant.last_read_at || '1970-01-01';
          const { count: c, error } = await supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('chat_id', participant.chat_id)
            .neq('sender_id', userId)
            .gt('created_at', lastRead);

          if (!error && typeof c === 'number') total += c;
        }
        setCount(total);
      } catch {
        setCount(0);
      }
    };

    fetchUnread();

    const channel = supabase
      .channel('expo-tab-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        fetchUnread();
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_participants', filter: `user_id=eq.${userId}` },
        () => {
          fetchUnread();
        }
      )
      .subscribe();

    // Safety net: realtime isn't guaranteed to deliver every event, and
    // backgrounding an Expo app suspends/reconnects its websocket - any
    // event during that gap is silently missed, with nothing else to
    // trigger a re-check. Recompute directly whenever the app foregrounds.
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        fetchUnread();
      }
    });

    // Direct signal from the chat screen the instant it marks a chat as
    // read - switching tabs doesn't background the app, so the AppState
    // listener above never fires for "read messages, then switch tabs"
    // without this.
    const chatReadSub = DeviceEventEmitter.addListener(CHAT_READ_EVENT, fetchUnread);

    return () => {
      supabase.removeChannel(channel);
      appStateSub.remove();
      chatReadSub.remove();
    };
  }, [userId]);

  return count;
}
