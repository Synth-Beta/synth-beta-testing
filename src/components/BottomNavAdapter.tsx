import React, { useState, useEffect } from 'react';
import { Icon } from '@/components/Icon';
import './BottomNav/BottomNav.css';
import { trackInteraction } from '@/services/interactionTrackingService';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface BottomNavAdapterProps {
  currentView: 'feed' | 'search' | 'profile' | 'profile-edit' | 'analytics' | 'events' | 'chat' | 'notifications' | 'onboarding';
  onViewChange: (view: 'feed' | 'search' | 'profile' | 'analytics' | 'events' | 'chat') => void;
  onOpenEventReview?: () => void;
}

/**
 * BottomNavAdapter
 * 
 * TEMPORARY BETA SCAFFOLDING - Phase 2 Preparation
 * 
 * Adapter component that bridges MainApp's view-based routing with BottomNav's route-based system.
 * Maps MainApp views to navigation actions using the new BottomNav styling.
 * 
 * TODO (Phase 2): Consider integrating directly into MainApp or replacing with route-based navigation
 * This adapter exists to minimize changes to existing MainApp logic during beta.
 */
export const BottomNavAdapter: React.FC<BottomNavAdapterProps> = ({
  currentView,
  onViewChange,
  onOpenEventReview,
}) => {
  const { user } = useAuth();
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  // Fetch unread messages count
  useEffect(() => {
    const fetchUnreadMessages = async () => {
      if (!user) {
        setUnreadMessagesCount(0);
        return;
      }

      try {
        // Get chats where user is a participant
        const { data: participantData } = await supabase
          .from('chat_participants')
          .select('chat_id, last_read_at')
          .eq('user_id', user.id);

        if (!participantData || participantData.length === 0) {
          setUnreadMessagesCount(0);
          return;
        }

        // Count unread messages across all chats
        let totalUnread = 0;
        for (const participant of participantData) {
          const lastRead = participant.last_read_at || '1970-01-01';
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('chat_id', participant.chat_id)
            .neq('sender_id', user.id)
            .gt('created_at', lastRead);
          
          totalUnread += count || 0;
        }

        setUnreadMessagesCount(totalUnread);
      } catch (error) {
        console.error('Error fetching unread messages:', error);
      }
    };

    fetchUnreadMessages();

    // Set up real-time subscription for new messages
    const channel = supabase
      .channel('bottom-nav-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        fetchUnreadMessages();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Map MainApp views to nav states
  const isHome = currentView === 'feed';
  const isDiscover = currentView === 'search';
  const isMessages = currentView === 'chat';
  const isProfile = currentView === 'profile';

  const handleNavClick = (onClick: () => void, isActive: boolean, skipReloadWhenActive?: boolean) => {
    if (isActive && !skipReloadWhenActive) {
      // If clicking the currently active icon, scroll to top and refresh
      window.scrollTo({ top: 0, behavior: 'smooth' });
      window.location.reload();
    } else {
      onClick();
    }
  };

  const navItems = [
    {
      id: 'home',
      label: 'Home',
      icon: isHome ? 'houseSelected' : 'house',
      onClick: () => {
        trackInteraction.navigate(currentView, 'feed', { source: 'bottom_nav' });
        onViewChange('feed');
      },
      isActive: isHome,
    },
    {
      id: 'discover',
      label: 'Discover',
      icon: isDiscover ? 'discoverSelected' : 'discover',
      onClick: () => {
        trackInteraction.navigate(currentView, 'discover', { source: 'bottom_nav' });
        onViewChange('search');
      },
      isActive: isDiscover,
    },
    {
      id: 'post',
      label: 'Post',
      icon: 'plus',
      onClick: () => {
        trackInteraction.click('view', 'create_post', { source: 'bottom_nav' });
        if (onOpenEventReview) {
          onOpenEventReview();
        } else {
          onViewChange('search');
        }
      },
      isCTA: true,
    },
    {
      id: 'messages',
      label: 'Messages',
      icon: isMessages ? 'circleCommentSelected' : 'circleComment',
      onClick: () => {
        trackInteraction.navigate(currentView, 'chat', { source: 'bottom_nav' });
        onViewChange('chat');
      },
      isActive: isMessages,
      badgeCount: unreadMessagesCount,
    },
    {
      id: 'profile',
      label: 'Profile',
      icon: isProfile ? 'userSelected' : 'user',
      onClick: () => {
        trackInteraction.navigate(currentView, 'profile', { source: 'bottom_nav' });
        onViewChange('profile');
      },
      isActive: isProfile,
      // When on a friend's profile, clicking Profile should go to *your* profile, not reload (reload sends you to Home). Always run onClick so MainApp can setProfileUserId(undefined).
      skipReloadWhenActive: true,
    },
  ];

  return (
    <nav className="bottom-nav" role="navigation" aria-label="Main navigation">
      <div className="bottom-nav__container">
        {navItems.map((item) => {
          if (item.isCTA) {
            return (
              <button
                key={item.id}
                className="bottom-nav__item bottom-nav__item--cta"
                onClick={() => handleNavClick(item.onClick, item.isActive, item.skipReloadWhenActive)}
                aria-label={item.label}
                aria-current={item.isActive ? 'page' : undefined}
                type="button"
              >
                <Icon name={item.icon as any} size={24} alt="" />
              </button>
            );
          }

          return (
            <button
              key={item.id}
              className={`bottom-nav__item ${item.isActive ? 'bottom-nav__item--active' : ''}`}
              onClick={() => handleNavClick(item.onClick, item.isActive, item.skipReloadWhenActive)}
              aria-label={item.label}
              aria-current={item.isActive ? 'page' : undefined}
              type="button"
              style={{ position: 'relative' }}
            >
              <Icon name={item.icon as any} size={24} alt="" />
              {typeof item.badgeCount === 'number' && item.badgeCount > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    backgroundColor: '#EF4444',
                    color: '#fff',
                    borderRadius: '50%',
                    minWidth: 16,
                    height: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 600,
                    paddingLeft: 4,
                    paddingRight: 4,
                    border: '2px solid var(--neutral-50)',
                  }}
                >
                  {item.badgeCount > 99 ? '99+' : item.badgeCount}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavAdapter;

