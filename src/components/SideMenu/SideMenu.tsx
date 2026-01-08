import React from 'react';
import { Icon } from '@/components/Icon';
import { UserInfo } from '@/components/profile/UserInfo';
import { SynthButton } from '@/components/Button/SynthButton';
import { MenuCategory } from '@/components/MenuCategory';
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
 * - Menu items in exact order: Activity, Profile & Preferences, Event Timeline, Help & Support, About, Settings
 * - Logout button as primary SynthButton
 */
export const SideMenu: React.FC<SideMenuProps> = ({
  isOpen,
  onClose,
  onToggle,
}) => {
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
              name="First Last"
              username="username"
              initial="F"
            />
          </div>

          {/* Primary Navigation Items */}
          <div className="side-menu__list">
            <MenuCategory
              label="Activity"
              icon="bell"
              onPress={() => {
                // TODO: Navigate to activity
                console.log('Activity clicked');
                onClose();
              }}
            />
            <MenuCategory
              label="Profile & Preference"
              icon="user"
              onPress={() => {
                // TODO: Navigate to profile & preference
                console.log('Profile & Preference clicked');
                onClose();
              }}
            />
            <MenuCategory
              label="Event Timeline"
              icon="music"
              onPress={() => {
                // TODO: Navigate to event timeline
                console.log('Event Timeline clicked');
                onClose();
              }}
            />
          </div>

          {/* Secondary Navigation Items */}
          <div className="side-menu__list">
            <MenuCategory
              label="Help & Support"
              icon="questionMark"
              onPress={() => {
                // TODO: Navigate to help & support
                console.log('Help & Support clicked');
                onClose();
              }}
            />
            <MenuCategory
              label="About"
              icon="infoCircle"
              onPress={() => {
                // TODO: Navigate to about
                console.log('About clicked');
                onClose();
              }}
            />
            <MenuCategory
              label="Settings"
              icon="settings"
              onPress={() => {
                // TODO: Navigate to settings
                console.log('Settings clicked');
                onClose();
              }}
            />
          </div>

          {/* Logout Button - Primary SynthButton */}
          <div className="side-menu__logout-section">
            <SynthButton
              variant="primary"
              size="standard"
              fullWidth
              onClick={() => {
                // TODO: Implement logout
                console.log('Logout clicked');
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

