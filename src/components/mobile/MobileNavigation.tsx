import React from 'react';
import { Icon } from '@/components/Icon';
import { Home, Compass, MessageCircle, User, Plus } from 'lucide-react';

interface MobileNavigationProps {
  currentView: 'feed' | 'search' | 'profile' | 'chat';
  onViewChange: (view: 'feed' | 'search' | 'profile' | 'chat') => void;
  onOpenEventReview?: () => void;
}

/**
 * Mobile Navigation Component
 * 
 * Bottom navigation bar for mobile preview matching Figma design.
 * Uses SVG icons from /src/assets/icons with selected variants for active states.
 * 
 * Design specifications:
 * - Background: LightPink (#fdf2f7)
 * - Border: Grey50 (rgba(201,201,201,0.5)) on top
 * - Corner radius: 10px (top corners only)
 * - Spacing: 43px gap between items, 23px horizontal padding, 20px vertical padding
 * - Plus button: 40px height, 70px width, SynthPink (#cc2486) background, 20px corner radius
 * - Icon size: 24px
 */
export const MobileNavigation: React.FC<MobileNavigationProps> = ({
  currentView,
  onViewChange,
  onOpenEventReview,
}) => {
  const handlePlusClick = () => {
    if (onOpenEventReview) {
      onOpenEventReview();
    } else {
      // Fallback: navigate to search if callback not provided
      onViewChange('search');
    }
  };


  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40"
      style={{
        margin: 0,
        padding: 0,
      }}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Container matching Figma design */}
      <div
        className="w-full"
        style={{
          backgroundColor: 'var(--light-pink, #fdf2f7)',
          borderTop: '2px solid var(--grey50, rgba(201, 201, 201, 0.5))',
          borderTopLeftRadius: '10px',
          borderTopRightRadius: '10px',
          margin: 0,
        }}
      >
        <div
          className="flex items-center justify-center mx-auto"
          style={{
            gap: '43px',
            padding: '20px 23px',
            paddingBottom: 'max(20px, calc(20px + env(safe-area-inset-bottom)))',
            width: '393px',
            maxWidth: '100%',
            minWidth: '320px',
          }}
        >
          {/* Home */}
          <button
            onClick={() => onViewChange('feed')}
            aria-label="Home"
            aria-current={currentView === 'feed' ? 'page' : undefined}
            className="flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-80"
            style={{
              width: '24px',
              height: '24px',
            }}
          >
            {currentView === 'feed' ? (
              <Icon name="houseSelected" size={24} alt="Home" />
            ) : (
              <Home size={24} strokeWidth={2} aria-hidden="true" />
            )}
          </button>

          {/* Discover */}
          <button
            onClick={() => onViewChange('search')}
            aria-label="Discover"
            aria-current={currentView === 'search' ? 'page' : undefined}
            className="flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-80"
            style={{
              width: '24px',
              height: '24px',
            }}
          >
            {currentView === 'search' ? (
              <Icon name="discoverSelected" size={24} alt="Discover" />
            ) : (
              <Compass size={24} strokeWidth={2} aria-hidden="true" />
            )}
          </button>

          {/* Plus Button */}
          <button
            onClick={handlePlusClick}
            aria-label="Create Event Entry"
            className="flex items-center justify-center flex-shrink-0 transition-all hover:opacity-90 active:scale-95"
            style={{
              width: '70px',
              height: '40px',
              backgroundColor: 'var(--synth-pink, #cc2486)',
              borderRadius: '20px',
            }}
          >
            <Plus size={24} strokeWidth={2} style={{ color: 'var(--neutral-50)' }} aria-hidden="true" />
          </button>

          {/* Messages */}
          <button
            onClick={() => onViewChange('chat')}
            aria-label="Messages"
            aria-current={currentView === 'chat' ? 'page' : undefined}
            className="flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-80"
            style={{
              width: '24px',
              height: '24px',
            }}
          >
            {currentView === 'chat' ? (
              <Icon name="circleCommentSelected" size={24} alt="Messages" />
            ) : (
              <MessageCircle size={24} strokeWidth={2} aria-hidden="true" />
            )}
          </button>

          {/* Profile */}
          <button
            onClick={() => onViewChange('profile')}
            aria-label="Profile"
            aria-current={currentView === 'profile' ? 'page' : undefined}
            className="flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-80"
            style={{
              width: '24px',
              height: '24px',
            }}
          >
            {currentView === 'profile' ? (
              <Icon name="userSelected" size={24} alt="Profile" />
            ) : (
              <User size={24} strokeWidth={2} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </nav>
  );
};

