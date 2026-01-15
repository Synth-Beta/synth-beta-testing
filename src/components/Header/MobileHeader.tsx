import React from 'react';
import { Icon } from '@/components/Icon';
import './MobileHeader.css';

export interface MobileHeaderProps {
  /**
   * Whether the menu is open (for swapping hamburger/X icon)
   */
  menuOpen?: boolean;
  
  /**
   * Callback when hamburger/X menu button is clicked
   */
  onMenuClick?: () => void;
  
  /**
   * Optional content to display in the center area
   */
  children?: React.ReactNode;
}

/**
 * Mobile Header Component
 * 
 * Header for mobile preview matching Figma design.
 * Features:
 * - Full width, OffWhite background
 * - Box shadow: 0 4px 4px rgba(0,0,0,0.25)
 * - Centered content
 * - Hamburger button on the right (44x44 hit area)
 * 
 * Design specifications from Figma:
 * - Background: OffWhite (#FCFCFC)
 * - Box shadow: 0 4px 4px rgba(0,0,0,0.25)
 * - Header content centered
 * - Hamburger button: 44x44 hit area
 */
export const MobileHeader: React.FC<MobileHeaderProps> = ({
  menuOpen = false,
  onMenuClick,
  children,
}) => {
  return (
    <header className="mobile-header" role="banner">
      <div className="mobile-header__container">
        {/* Centered content area - can be used for logo, title, or custom content */}
        <div className="mobile-header__center">
          {children}
        </div>

        {/* Hamburger/X button on the right - swaps icon based on menuOpen */}
        <button
          className="mobile-header__menu-button"
          onClick={onMenuClick}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          type="button"
        >
          {menuOpen ? (
            <Icon name="x" size={24} alt="" />
          ) : (
            <Icon name="hamburgerMenu" size={24} alt="" />
          )}
        </button>
      </div>
    </header>
  );
};

export default MobileHeader;

