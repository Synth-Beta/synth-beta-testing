import React from 'react';
import { Icon } from '@/components/Icon';
import './GlobalHamburgerButton.css';

export interface GlobalHamburgerButtonProps {
  /**
   * Whether the menu is open (for swapping hamburger/X icon)
   */
  menuOpen?: boolean;
  
  /**
   * Callback when hamburger/X button is clicked
   */
  onMenuClick?: () => void;
}

/**
 * GlobalHamburgerButton Component
 * 
 * A floating hamburger/X button that sits above page content.
 * Used to open/close the SideMenu without replacing existing page headers.
 * 
 * Features:
 * - Fixed position in top-right corner
 * - Swaps between hamburger and X icon based on menuOpen state
 * - 44x44 tap target for accessibility
 * - High z-index to sit above page content
 */
export const GlobalHamburgerButton: React.FC<GlobalHamburgerButtonProps> = ({
  menuOpen = false,
  onMenuClick,
}) => {
  return (
    <button
      className="global-hamburger-button"
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
  );
};

export default GlobalHamburgerButton;

