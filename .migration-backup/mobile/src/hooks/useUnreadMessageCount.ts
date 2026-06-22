import { useState, useEffect } from 'react';
import { supabase } from '../integrations/supabase/client';

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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return count;
}
