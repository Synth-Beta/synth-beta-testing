import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Unread counts for SideMenu / web rail "Menu" — matches HomeFeed MobileHeader badge logic.
 */
export function useMenuNotificationBadgeCount(userId: string | undefined) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }

    const fetchCounts = async () => {
      try {
        // Non-chat, non-friend-request notifications
        const { count: notifCount } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_read', false)
          .not('type', 'in', '(friend_request,friend_accepted,message,group_chat_invite)');

        // Friend request / accepted notifications (separate bucket)
        const { count: friendReqCount } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_read', false)
          .in('type', ['friend_request', 'friend_accepted']);

        // Chat notifications are intentionally excluded — they show on the chat icon only
        setCount((notifCount || 0) + (friendReqCount || 0));
      } catch (e) {
        console.error('useMenuNotificationBadgeCount', e);
      }
    };

    fetchCounts();

    const channel = supabase
      .channel('menu-notification-badge')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => {
          fetchCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return count;
}
