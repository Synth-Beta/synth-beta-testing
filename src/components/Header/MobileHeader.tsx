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
  
  /**
   * Custom icon name for the right button (replaces hamburger menu)
   */
  rightIcon?: string;
  
  /**
   * Callback when right button is clicked (if rightIcon is provided)
   */
  onRightIconClick?: () => void;
  
  /**
   * Whether to align content to the left instead of center
   */
  alignLeft?: boolean;
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
  rightIcon,
  onRightIconClick,
  alignLeft = false,
}) => {
  return (
    <header className="mobile-header" role="banner">
      <div className="mobile-header__container">
        {/* Content area - can be centered or left-aligned */}
        <div className={alignLeft ? "mobile-header__left" : "mobile-header__center"}>
          {children}
        </div>

        {/* Right button - hamburger/X or custom icon */}
        <button
          className="mobile-header__menu-button"
          onClick={rightIcon ? onRightIconClick : onMenuClick}
          aria-label={rightIcon ? (rightIcon === "ellipsis" ? "More options" : "Menu") : (menuOpen ? "Close menu" : "Open menu")}
          aria-expanded={menuOpen}
          type="button"
        >
          {rightIcon ? (
            <Icon name={rightIcon} size={24} alt="" color="var(--neutral-900)" />
          ) : menuOpen ? (
            <Icon name="x" size={24} alt="" color="var(--neutral-900)" />
          ) : (
            <Icon name="hamburgerMenu" size={24} alt="" color="var(--neutral-900)" />
          )}
        </button>
      </div>
    </header>
  );
};

export default MobileHeader;

