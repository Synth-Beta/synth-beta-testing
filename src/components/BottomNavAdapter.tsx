import React from 'react';
import { Icon } from '@/components/Icon';
import './BottomNav/BottomNav.css';
import type { MainNavItem } from '@/hooks/useMainNavItems';

interface BottomNavAdapterProps {
  items: MainNavItem[];
  onItemClick: (item: MainNavItem) => void;
}

/**
 * Bottom tab bar for web-mobile and Capacitor Android. Items come from `useMainNavItems` in MainApp.
 */
export const BottomNavAdapter: React.FC<BottomNavAdapterProps> = ({ items, onItemClick }) => {
  return (
    <nav
      className="bottom-nav"
      role="navigation"
      aria-label="Main navigation"
      data-testid="web-bottom-nav"
    >
      <div className="bottom-nav__container">
        {items.map((item) => {
          if (item.isCTA) {
            return (
              <button
                key={item.id}
                className="bottom-nav__item bottom-nav__item--cta"
                onClick={() => onItemClick(item)}
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
              onClick={() => onItemClick(item)}
              aria-label={item.label}
              aria-current={item.isActive ? 'page' : undefined}
              type="button"
              style={{ position: 'relative' }}
            >
              <Icon name={item.icon as any} size={24} alt="" />
              {item.hasUnread ? (
                <span
                  className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full ring-2 ring-white"
                  aria-label="Unread messages"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavAdapter;
