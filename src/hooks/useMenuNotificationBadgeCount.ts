import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
/** Friend types get their own badge bucket below, so they are excluded here. */
const EXCLUDED_FROM_MENU_BADGE = '(friend_request,friend_accepted)';

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
          .not('type', 'in', EXCLUDED_FROM_MENU_BADGE);

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

    // Realtime doesn't reliably fire for these writes — mark-as-read actions also
    // dispatch this directly so the badge clears immediately, not just on reload.
    window.addEventListener('synth-notifications-read', fetchCounts);

    // `notifications` isn't in the realtime publication, so reads/arrivals from
    // another device or tab never push here. Re-check on focus and periodically.
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchCounts();
    };
    window.addEventListener('focus', fetchCounts);
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(onVisible, 60_000);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('synth-notifications-read', fetchCounts);
      window.removeEventListener('focus', fetchCounts);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
    };
  }, [userId]);

  return count;
}
