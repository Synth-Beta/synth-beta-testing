import React, { useEffect, useState } from 'react';
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
  onNavigateToProfile?: (tab?: 'timeline' | 'interested') => void;
  onNavigateToSettings?: () => void;
  onNavigateToVerification?: () => void;
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
 * - Menu items in exact order: Activity, Profile & Preferences, Event Timeline, Settings
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
}) => {
  const { user } = useAuth();
  const { accountInfo } = useAccountType();
  const [userProfile, setUserProfile] = useState<Tables<'users'> | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch user profile data
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user) {
        console.log('SideMenu: No user, setting loading to false');
        setLoading(false);
        setUserProfile(null);
        return;
      }

      // Fetch when menu opens or when user becomes available
      // (Don't block on menu state since we want data ready when menu opens)

      try {
        console.log('SideMenu: Fetching user profile for user.id:', user.id);
        setLoading(true);
        
        // Try fetching by user_id first (primary key relationship)
        const { data, error } = await supabase
          .from('users')
          .select('name, username, avatar_url')
          .eq('user_id', user.id)
          .maybeSingle();

        console.log('SideMenu: Query result by user_id:', { data, error });

        if (error) {
          if (error.code === 'PGRST116') {
            // No rows found - try fallback
            console.log('SideMenu: No user found by user_id, trying by id');
            const { data: fallbackData, error: fallbackError } = await supabase
              .from('users')
              .select('name, username, avatar_url')
              .eq('id', user.id)
              .maybeSingle();
            
            console.log('SideMenu: Fallback query result by id:', { fallbackData, fallbackError });
            
            if (fallbackError && fallbackError.code !== 'PGRST116') {
              console.error('SideMenu: Error in fallback query:', fallbackError);
            }
            
            if (fallbackData) {
              console.log('SideMenu: Setting profile from fallback:', fallbackData);
              setUserProfile(fallbackData);
            } else {
              console.warn('SideMenu: No user profile found in database');
              setUserProfile(null);
            }
          } else {
            console.error('SideMenu: Error fetching user profile:', error);
            setUserProfile(null);
          }
        } else if (data) {
          console.log('SideMenu: Setting profile from primary query:', data);
          setUserProfile(data);
        } else {
          console.warn('SideMenu: No data returned from query');
          setUserProfile(null);
        }
      } catch (error) {
        console.error('SideMenu: Exception in fetchUserProfile:', error);
        setUserProfile(null);
      } finally {
        setLoading(false);
        console.log('SideMenu: Loading set to false');
      }
    };

    fetchUserProfile();
  }, [isOpen, user]);

  // Extract initial from name
  const getInitial = (name: string | null | undefined): string => {
    if (!name) return '?';
    const trimmed = name.trim();
    if (trimmed.length === 0) return '?';
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

  // Handle logout
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (error) {
      console.error('Error signing out:', error);
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
            {loading ? (
              <div className="flex items-center gap-3">
                <div className="w-[45px] h-[45px] rounded-full bg-gray-200 animate-pulse" />
                <div className="flex-1">
                  <div className="h-5 w-32 bg-gray-200 rounded animate-pulse mb-2" />
                  <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                </div>
              </div>
            ) : (
              <UserInfo
                variant="user"
                name={userProfile?.name || user?.email?.split('@')[0] || 'User'}
                username={userProfile?.username || undefined}
                initial={getInitial(userProfile?.name || user?.email)}
                imageUrl={userProfile?.avatar_url || undefined}
              />
            )}
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
            <div className="side-menu__verification-section">
              <VerificationStatusCard
                userId={user.id}
                accountType={accountInfo.account_type || 'user'}
                verified={accountInfo.verified || false}
              />
            </div>
          )}

          {/* Logout Button - Primary SynthButton */}
          <div className="side-menu__logout-section">
            <SynthButton
              variant="primary"
              size="standard"
              fullWidth
              onClick={() => {
                handleLogout();
                onClose();
              }}
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

