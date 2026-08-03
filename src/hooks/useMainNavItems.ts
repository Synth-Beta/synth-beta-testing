import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { trackInteraction } from '@/services/interactionTrackingService';

export type MainNavCurrentView =
  | 'feed'
  | 'search'
  | 'profile'
  | 'profile-edit'
  | 'settings'
  | 'analytics'
  | 'events'
  | 'chat'
  | 'notifications'
  | 'onboarding'
  | 'streaming-stats'
  | 'auth';

export interface MainNavItem {
  id: string;
  label: string;
  icon: string;
  onActivate: () => void;
  isActive: boolean;
  isCTA?: boolean;
  hasUnread?: boolean;
  skipReloadWhenActive?: boolean;
}

export type MainNavInteractionSource = 'bottom_nav' | 'web_rail';

interface UseMainNavItemsOptions {
  currentView: MainNavCurrentView;
  onViewChange: (view: MainNavCurrentView) => void;
  onOpenEventReview?: () => void;
  profileUserId?: string;
  /** Passed as `source` on all main-nav `trackInteraction` calls (rail vs bottom bar). */
  interactionSource?: MainNavInteractionSource;
}

/**
 * Shared bottom / rail nav items + click behavior (scroll+reload when re-tapping active tab).
 */
export function useMainNavItems({
  currentView,
  onViewChange,
  onOpenEventReview,
  profileUserId,
  interactionSource = 'bottom_nav',
}: UseMainNavItemsOptions) {
  const { user } = useAuth();
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  // useAuth() calls setUser(session.user) with a *new* object on every
  // TOKEN_REFRESHED event (roughly hourly), even though the logical user
  // hasn't changed. Reading the live user through a ref (rather than via a
  // `[user]` effect dependency) keeps fetchUnreadMessages callable without
  // forcing the realtime subscription below to tear down and resubscribe
  // on every token refresh - any message/read event landing in that
  // resubscribe gap was previously silently dropped, with nothing to
  // trigger a re-check, so the badge could get stuck until the next refresh.
  const userRef = useRef(user);
  userRef.current = user;

  const fetchUnreadMessages = useCallback(async () => {
    const currentUser = userRef.current;
    if (!currentUser) {
      setUnreadMessagesCount(0);
      return;
    }

    try {
      const { data: participantData } = await supabase
        .from('chat_participants')
        .select('chat_id, last_read_at')
        .eq('user_id', currentUser.id);

      if (!participantData || participantData.length === 0) {
        setUnreadMessagesCount(0);
        return;
      }

      let totalUnreadMessages = 0;
      for (const participant of participantData) {
        const lastRead = participant.last_read_at || '1970-01-01';
        const { count, error } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('chat_id', participant.chat_id)
          .neq('sender_id', currentUser.id)
          .gt('created_at', lastRead);

        if (!error && typeof count === 'number') {
          totalUnreadMessages += count;
        }
      }

      setUnreadMessagesCount(totalUnreadMessages);
    } catch (error) {
      console.error('Error fetching unread messages:', error);
    }
  }, []);

  useEffect(() => {
    fetchUnreadMessages();

    if (!user?.id) return;
    const userId = user.id;

    const refreshUnreadAndAppBadge = async () => {
      await fetchUnreadMessages();
      // Dynamic import (not top-level): `badgeService` pulls `notificationService` and Capacitor-only
      // badge APIs. Loading it only from Supabase realtime callbacks defers that module graph until
      // chat activity occurs and keeps this hook’s initial chunk smaller on web (updateBadgeCount no-ops there).
      const { BadgeService } = await import('@/services/badgeService');
      await BadgeService.updateBadgeCount();
    };

    const channel = supabase
      .channel('main-nav-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, refreshUnreadAndAppBadge)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_participants', filter: `user_id=eq.${userId}` },
        refreshUnreadAndAppBadge
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // Depend on user.id (stable primitive), not `user` (new object identity
    // every token refresh) - see comment on userRef above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, fetchUnreadMessages]);

  // Safety net: realtime is not guaranteed to deliver every event (network
  // blips, reconnects, tab throttling). Recompute from the DB directly
  // whenever the tab becomes visible again and whenever the user leaves the
  // chat view, rather than trusting the badge stays in sync purely from
  // postgres_changes callbacks.
  const prevViewRef = useRef(currentView);
  useEffect(() => {
    if (prevViewRef.current === 'chat' && currentView !== 'chat') {
      fetchUnreadMessages();
    }
    prevViewRef.current = currentView;
  }, [currentView, fetchUnreadMessages]);

  useEffect(() => {
    if (!user?.id) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchUnreadMessages();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [user?.id, fetchUnreadMessages]);

  const items: MainNavItem[] = useMemo(() => {
    const isHome = currentView === 'feed';
    const isDiscover = currentView === 'search';
    const isMessages = currentView === 'chat';
    const isProfile =
      currentView === 'profile' && (!profileUserId || profileUserId === user?.id);

    return [
      {
        id: 'home',
        label: 'Home',
        icon: isHome ? 'houseSelected' : 'house',
        onActivate: () => {
          trackInteraction.navigate(currentView, 'feed', { source: interactionSource });
          onViewChange('feed');
        },
        isActive: isHome,
      },
      {
        id: 'discover',
        label: 'Discover',
        icon: isDiscover ? 'discoverSelected' : 'discover',
        onActivate: () => {
          trackInteraction.navigate(currentView, 'search', { source: interactionSource });
          onViewChange('search');
        },
        isActive: isDiscover,
      },
      {
        id: 'post',
        label: 'Post',
        icon: 'plus',
        onActivate: () => {
          trackInteraction.click('view', 'create_post', { source: interactionSource });
          if (onOpenEventReview) {
            onOpenEventReview();
          } else {
            onViewChange('search');
          }
        },
        isActive: false,
        isCTA: true,
      },
      {
        id: 'messages',
        label: 'Messages',
        icon: isMessages ? 'circleCommentSelected' : 'circleComment',
        onActivate: () => {
          trackInteraction.navigate(currentView, 'chat', { source: interactionSource });
          onViewChange('chat');
        },
        isActive: isMessages,
        hasUnread: !isMessages && unreadMessagesCount > 0,
      },
      {
        id: 'profile',
        label: 'Profile',
        icon: isProfile ? 'userSelected' : 'user',
        onActivate: () => {
          trackInteraction.navigate(currentView, 'profile', { source: interactionSource });
          onViewChange('profile');
        },
        isActive: isProfile,
        skipReloadWhenActive: true,
      },
    ];
  }, [
    currentView,
    onViewChange,
    onOpenEventReview,
    profileUserId,
    user?.id,
    unreadMessagesCount,
    interactionSource,
  ]);

  const handleItemClick = useCallback((item: MainNavItem) => {
    if (item.isCTA) {
      item.onActivate();
      return;
    }
    if (item.isActive && !item.skipReloadWhenActive) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // Do not call window.location.reload() — on iOS native it tears down
      // the React app and removes the synthNativeTabSelected event listener,
      // causing subsequent tab taps to be silently dropped during the reload.
    } else {
      item.onActivate();
    }
  }, []);

  return { items, handleItemClick };
}
