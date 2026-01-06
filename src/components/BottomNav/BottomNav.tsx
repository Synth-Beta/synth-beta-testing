import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import './BottomNav.css';

/**
 * Bottom Navigation Component
 * 
 * Fixed bottom navigation bar for mobile preview matching Figma design.
 * 
 * Features:
 * - Fixed to bottom, full width
 * - Inner container: max-width 393px, centered
 * - 5 items: Home, Discover, Post (center CTA), Messages, Profile
 * - Selected state uses Selected icon variants
 * - Navigation using React Router
 * 
 * Design specifications from Figma:
 * - Padding: 20px 23px
 * - Gap: 43px
 * - Border radius: 10px 10px 0 0
 * - Border: 2px solid rgba(201,201,201,0.5) (Grey50)
 * - Background: LightPink (#FDF2F7)
 */
export const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Determine current route
  const currentPath = location.pathname;
  const isHome = currentPath === '/mobile-preview/home' || currentPath === '/mobile-preview';
  const isDiscover = currentPath === '/mobile-preview/discover';
  const isPost = currentPath === '/mobile-preview/post';
  const isMessages = currentPath === '/mobile-preview/messages';
  const isProfile = currentPath === '/mobile-preview/profile';

  const navItems = [
    {
      id: 'home',
      label: 'Home',
      icon: isHome ? 'houseSelected' : 'house',
      path: '/mobile-preview/home',
      isActive: isHome,
    },
    {
      id: 'discover',
      label: 'Discover',
      icon: isDiscover ? 'discoverSelected' : 'discover',
      path: '/mobile-preview/discover',
      isActive: isDiscover,
    },
    {
      id: 'post',
      label: 'Post',
      icon: 'plus',
      path: '/mobile-preview/post',
      isActive: isPost,
      isCTA: true,
    },
    {
      id: 'messages',
      label: 'Messages',
      icon: isMessages ? 'circleCommentSelected' : 'circleComment',
      path: '/mobile-preview/messages',
      isActive: isMessages,
    },
    {
      id: 'profile',
      label: 'Profile',
      icon: isProfile ? 'userSelected' : 'user',
      path: '/mobile-preview/profile',
      isActive: isProfile,
    },
  ];

  const handleNavClick = (path: string) => {
    navigate(path);
  };

  return (
    <nav className="bottom-nav" role="navigation" aria-label="Main navigation">
      <div className="bottom-nav__container">
        {navItems.map((item) => {
          if (item.isCTA) {
            // Center CTA button (Post)
            return (
              <button
                key={item.id}
                className="bottom-nav__item bottom-nav__item--cta"
                onClick={() => handleNavClick(item.path)}
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
              onClick={() => handleNavClick(item.path)}
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

export default BottomNav;

