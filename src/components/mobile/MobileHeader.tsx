import React, { useState } from 'react';
import { Icon } from '@/components/Icon/Icon';

interface MobileHeaderProps {
  currentUserId: string;
  onNavigateToNotifications?: () => void;
  onMenuClick?: () => void;
  className?: string;
}

/**
 * Mobile Header Component
 * 
 * Header for mobile preview matching Figma design.
 * Features:
 * - Synth logo and text on the left
 * - Hamburger menu icon on the left (replacing logo area)
 * - Notification bell on the right
 * 
 * Design specifications:
 * - Background: OffWhite (#fcfcfc)
 * - Height: 59px
 * - Horizontal padding: 20px (matching design tokens)
 * - Shadow: 0px 4px 4px 0px rgba(0,0,0,0.25)
 * - Notification button: 44px height/width, SynthPink background, 10px corner radius
 */
export const MobileHeader: React.FC<MobileHeaderProps> = ({
  currentUserId,
  onNavigateToNotifications,
  onMenuClick,
  className,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleMenuClick = () => {
    setMenuOpen(!menuOpen);
    if (onMenuClick) {
      onMenuClick();
    }
  };

  return (
    <header
      className={`fixed left-0 right-0 z-50 ${className || ''}`}
      style={{
        top: 'env(safe-area-inset-top, 0px)',
        backgroundColor: 'var(--off-white, #fcfcfc)',
        boxShadow: '0px 4px 4px 0px rgba(0, 0, 0, 0.25)',
      }}
      role="banner"
    >
      <div
        className="flex items-center justify-between"
        style={{
          height: '59px',
          paddingLeft: 'var(--margin-horizontal, 20px)',
          paddingRight: 'var(--margin-horizontal, 20px)',
          paddingBottom: '16px',
        }}
      >
        {/* Left side: Hamburger Menu and Logo */}
        <div className="flex items-center gap-3">
          {/* Hamburger Menu Button */}
          <button
            onClick={handleMenuClick}
            aria-label="Menu"
            aria-expanded={menuOpen}
            className="flex items-center justify-center transition-opacity hover:opacity-80 active:opacity-60"
            style={{
              width: '24px',
              height: '24px',
            }}
          >
            <Icon name="hamburgerMenu" size={24} color="var(--neutral-900)" />
          </button>

          {/* Synth Logo and Text */}
          <div className="flex items-center gap-1">
            <div
              className="relative shrink-0"
              style={{
                width: '50px',
                height: '50px',
              }}
            >
              <img
                src="/Logos/Main logo black background.png"
                alt="Synth Logo"
                className="absolute inset-0 max-w-none object-cover pointer-events-none w-full h-full"
              />
            </div>
            <p
              className="font-bold relative shrink-0 whitespace-pre-wrap"
              style={{
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                fontSize: '36px',
                lineHeight: 'normal',
                color: '#0e0e0e',
                width: '93px',
                height: '52px',
              }}
            >
              ynth
            </p>
          </div>
        </div>

        {/* Right side: Notification Bell Button */}
        <button
          onClick={onNavigateToNotifications}
          aria-label="Notifications"
          className="flex items-center justify-center transition-all hover:opacity-90 active:scale-95"
          style={{
            width: '44px',
            height: '44px',
            backgroundColor: 'var(--synth-pink, #cc2486)',
            borderRadius: 'var(--corner-radius, 10px)',
            boxShadow: '0px 4px 4px 0px rgba(0, 0, 0, 0.25)',
          }}
        >
          <Icon name="bell" size={24} color="var(--neutral-50)" />
        </button>
      </div>
    </header>
  );
};

