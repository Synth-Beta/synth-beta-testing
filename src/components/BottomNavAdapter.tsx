import React from 'react';
import { Icon } from '@/components/Icon';
import './BottomNav/BottomNav.css';
import { trackInteraction } from '@/services/interactionTrackingService';

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
  // Map MainApp views to nav states
  const isHome = currentView === 'feed';
  const isDiscover = currentView === 'search';
  const isMessages = currentView === 'chat';
  const isProfile = currentView === 'profile';

  const handleNavClick = (onClick: () => void, isActive: boolean) => {
    if (isActive) {
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
                onClick={() => handleNavClick(item.onClick, item.isActive)}
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
              onClick={() => handleNavClick(item.onClick, item.isActive)}
              aria-label={item.label}
              aria-current={item.isActive ? 'page' : undefined}
              type="button"
            >
              <Icon name={item.icon as any} size={24} alt="" />
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavAdapter;

