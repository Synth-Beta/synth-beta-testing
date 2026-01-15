import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { UserInfo } from '@/components/profile/UserInfo';
import { SynthButton } from '@/components/Button/SynthButton';
import { MenuCategory } from '@/components/MenuCategory';
import { useAuth } from '@/hooks/useAuth';
import { useAccountType } from '@/hooks/useAccountType';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/types/database.types';
import { VerificationStatusCard } from '@/components/verification/VerificationStatusCard';
import './SideMenu.css';

export interface SideMenuProps {
  /**
   * Whether the menu is open
   */
  isOpen: boolean;
  
  /**
   * Callback to close the menu
   */
  onClose: () => void;
  
  /**
   * Callback when hamburger/X button is clicked (for swapping icon)
   */
  onToggle?: () => void;
  
  /**
   * Navigation callbacks
   */
  onNavigateToNotifications?: () => void;
  onNavigateToProfile?: (userId?: string, tab?: 'timeline' | 'interested') => void;
  onNavigateToSettings?: () => void;
  onNavigateToVerification?: () => void;
  
  /**
   * Optional callback for sign out action
   * If not provided, will sign out and navigate to "/"
   */
  onSignOut?: () => void;
}

/**
 * SideMenu Component
 * 
 * Right-side drawer menu that slides in from the right.
 * 
 * Layout:
 * - Drawer width = screen width - 78px
 * - 78px overlay (OffBlack50) on the left
 * - Safe area spacer + 44px header bar with X button
 * - UserInfo component at top of content
 * - Menu items in exact order: Notifications, Timeline, Interested, Settings
 * - Logout button as primary SynthButton
 */
export const SideMenu: React.FC<SideMenuProps> = ({
  isOpen,
  onClose,
  onToggle,
  onNavigateToNotifications,
  onNavigateToProfile,
  onNavigateToSettings,
  onNavigateToVerification,
  onSignOut,
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { accountInfo } = useAccountType();
  const [userProfile, setUserProfile] = useState<Tables<'users'> | null>(null);

  // Fetch user profile data
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user) {
        setUserProfile(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('users')
          .select('name, username, avatar_url')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error && error.code === 'PGRST116') {
          const { data: fallbackData } = await supabase
            .from('users')
            .select('name, username, avatar_url')
            .eq('id', user.id)
            .maybeSingle();
          setUserProfile(fallbackData || null);
        } else if (!error) {
          setUserProfile(data || null);
        } else {
          setUserProfile(null);
        }
      } catch (error) {
        console.error('SideMenu: Error fetching user profile', error);
        setUserProfile(null);
      }
    };

    fetchUserProfile();
  }, [isOpen, user]);

  const getInitial = (name: string | null | undefined): string => {
    if (!name) return '?';
    const trimmed = name.trim();
    if (!trimmed) return '?';
    return trimmed[0].toUpperCase();
  };
  // Handle overlay click (78px area on the left)
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only close if clicking directly on overlay, not on drawer
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Handle X button click
  const handleCloseClick = () => {
    onClose();
    if (onToggle) {
      onToggle();
    }
  };

  // Handle logout button click
  const handleLogout = async () => {
    onClose(); // Close the menu first
    
    if (onSignOut) {
      // Use provided sign out handler (e.g., from MainApp)
      await onSignOut();
    } else {
      try {
        await supabase.auth.signOut();
      } catch (error) {
        console.error('Error signing out:', error);
      }
      navigate('/');
    }
  };
  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Overlay (78px on the left) */}
      <div
        className="side-menu__overlay"
        onClick={handleOverlayClick}
        aria-hidden="true"
      />
      
      {/* Drawer (screen width - 78px) */}
      <aside
        className="side-menu__drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Safe area spacer - seamless background */}
        <div className="side-menu__safe-area-spacer" />
        
        {/* Header bar - 44px height with X button */}
        <div className="side-menu__header-bar">
          <button
            className="side-menu__close-button"
            onClick={handleCloseClick}
            aria-label="Close menu"
            type="button"
          >
            <Icon name="x" size={24} alt="" />
          </button>
        </div>

        {/* Menu Content - starts 20px after header bar */}
        <div className="side-menu__content">
          {/* User Info Section */}
          <div className="side-menu__user-info-section">
            <UserInfo
              variant="user"
              name={userProfile?.name || user?.email?.split('@')[0] || 'User'}
              username={userProfile?.username || undefined}
              initial={getInitial(userProfile?.name || user?.email)}
              imageUrl={userProfile?.avatar_url || undefined}
            />
          </div>

          {/* Primary Navigation Items */}
          <div className="side-menu__list">
            <MenuCategory
              label="Notifications"
              icon="bell"
              onPress={() => {
                if (onNavigateToNotifications) {
                  onNavigateToNotifications();
                }
                onClose();
              }}
            />
            <MenuCategory
              label="Event Timeline"
              icon="music"
              onPress={() => {
                if (onNavigateToProfile) {
                  sessionStorage.setItem('profileTab', 'timeline');
                  onNavigateToProfile(undefined, 'timeline');
                }
                onClose();
              }}
            />
            <MenuCategory
              label="Interested"
              icon="heart"
              onPress={() => {
                if (onNavigateToProfile) {
                  sessionStorage.setItem('profileTab', 'interested');
                  onNavigateToProfile(undefined, 'interested');
                }
                onClose();
              }}
            />
            <MenuCategory
              label="Settings"
              icon="settings"
              onPress={() => {
                if (onNavigateToSettings) {
                  onNavigateToSettings();
                } else {
                  console.log('Settings clicked');
                }
                onClose();
              }}
            />
          </div>

          {/* Verification Status Section */}
          {user && accountInfo && (
            <>
              <div className="side-menu__section-divider" aria-hidden="true" />
              <div className="side-menu__verification-section">
                <VerificationStatusCard
                  userId={user.id}
                  accountType={accountInfo.account_type || 'user'}
                  verified={accountInfo.verified || false}
                />
              </div>
              <div className="side-menu__verification-divider" aria-hidden="true" />
            </>
          )}
          {/* Logout Button - Primary SynthButton */}
          <div className="side-menu__logout-section">
            <SynthButton
              variant="primary"
              size="standard"
              fullWidth
              onClick={handleLogout}
            >
              Log out
            </SynthButton>
          </div>
        </div>
      </aside>
    </>
  );
};

export default SideMenu;

