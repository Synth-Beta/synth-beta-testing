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
   * Custom right button element (replaces hamburger menu button entirely)
   */
  rightButton?: React.ReactNode;
  
  /**
   * Whether to align content to the left instead of center
   */
  alignLeft?: boolean;
  
  /**
   * Custom icon name for the left button (e.g., "chevronLeft")
   */
  leftIcon?: string;
  
  /**
   * Callback when left button is clicked (if leftIcon is provided)
   */
  onLeftIconClick?: () => void;
  
  /**
   * Optional badge count to display on the hamburger menu button
   */
  badgeCount?: number;
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
  leftIcon,
  onLeftIconClick,
  rightButton,
  badgeCount,
}) => {
  return (
    <header className="mobile-header" role="banner">
      <div className="mobile-header__container">
        {/* Content area - can be centered or left-aligned */}
        <div className={alignLeft ? "mobile-header__left" : "mobile-header__center"} style={leftIcon ? { 
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          paddingLeft: 'var(--spacing-screen-margin-x, 20px)'
        } : undefined}>
          {/* Left button - if provided, render inline with content */}
          {leftIcon && onLeftIconClick && (
            <button
              className="mobile-header__left-button-inline"
              onClick={onLeftIconClick}
              aria-label="Back"
              type="button"
            >
              <Icon name={leftIcon} size={35} alt="" color="var(--neutral-900)" />
            </button>
          )}
          {children}
        </div>

        {/* Right button - hamburger/X or custom icon */}
        {rightButton ? (
          rightButton
        ) : !rightIcon ? (
          <button
            className="mobile-header__menu-button"
            onClick={onMenuClick}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            type="button"
            style={{ position: 'relative', overflow: 'visible' }}
          >
            {menuOpen ? (
              <Icon name="x" size={24} alt="" color="var(--neutral-900)" />
            ) : (
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                <Icon name="hamburgerMenu" size={24} alt="" color="var(--neutral-900)" />
                {typeof badgeCount === 'number' && badgeCount > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      backgroundColor: '#EF4444',
                      color: '#fff',
                      borderRadius: 10,
                      minWidth: 20,
                      height: 20,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 600,
                      paddingLeft: 6,
                      paddingRight: 6,
                      boxSizing: 'border-box',
                      zIndex: 1000,
                      border: '2px solid #fff',
                      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
                      pointerEvents: 'none',
                    }}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </div>
                )}
              </div>
            )}
          </button>
        ) : (
          <button
            className="mobile-header__menu-button"
            onClick={onRightIconClick}
            aria-label="More options"
            type="button"
          >
            {rightIcon === 'ellipsisVertical' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--neutral-900)' }}>
                <circle cx="12" cy="12" r="1"/>
                <circle cx="12" cy="5" r="1"/>
                <circle cx="12" cy="19" r="1"/>
              </svg>
            ) : (
              <Icon name={rightIcon} size={24} alt="" color="var(--neutral-900)" />
            )}
          </button>
        )}
      </div>
    </header>
  );
};

export default MobileHeader;

