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

    // Only the newest run may write, so a slow older total can't overwrite a newer one.
    let latestRun = 0;

    const fetchUnread = async () => {
      const run = ++latestRun;
      const write = (n: number) => { if (run === latestRun) setCount(n); };
      try {
        // DMs and group chats only. Genre/event/artist/venue rooms (entity_type set) get
        // daily automated posts and have no unread marker in the list, so counting them
        // kept the dot on after every conversation was read.
        const { data: participantData, error: partError } = await supabase
          .from('chat_participants')
          .select('chat_id, last_read_at, chats!inner(entity_type)')
          .eq('user_id', userId)
          .is('chats.entity_type', null);
        if (partError) return; // keep the last known badge

        if (!participantData?.length) {
          write(0);
          return;
        }
        const chatIds = new Set(participantData.map((p) => p.chat_id));

        // One grouped query; falls back to per-chat counts if the RPC isn't deployed yet.
        const { data: counts, error: rpcError } = await supabase.rpc('get_my_chat_unread_counts');
        if (!rpcError && Array.isArray(counts)) {
          write(
            counts
              .filter((r: { chat_id: string }) => chatIds.has(r.chat_id))
              .reduce((sum: number, r: { unread_count: number | string }) => sum + Number(r.unread_count || 0), 0),
          );
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
        write(total);
      } catch {
        // Keep the last known badge rather than flashing to zero on a network blip.
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
