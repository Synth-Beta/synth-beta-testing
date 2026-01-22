import React from 'react';
import { IconText } from '@/components/IconText';
import { type IconName } from '@/config/iconMapping';
import './MenuCategory.css';

export interface MenuCategoryProps {
  /**
   * Label text for the menu category
   */
  label: string;
  
  /**
   * Icon name from the icon mapping
   */
  icon: IconName;
  
  /**
   * Optional click handler
   */
  onPress?: () => void;
  
  /**
   * Optional additional CSS classes
   */
  className?: string;

  /**
   * Optional badge count (shows red dot with number if > 0)
   */
  badgeCount?: number;
}

/**
 * MenuCategory Component
 * 
 * A clickable row component that composes IconText for use in menu lists.
 * 
 * Features:
 * - Fixed height (48px) matching menu item row height
 * - Specific padding and spacing matching Figma design
 * - IconText indented an additional 20px from container left padding
 * - Uses design tokens for all spacing, colors, and typography
 * 
 * Usage:
 *   <MenuCategory label="Activity" icon="bell" onPress={handleActivity} />
 *   <MenuCategory label="Settings" icon="settings" onPress={handleSettings} />
 */
export const MenuCategory: React.FC<MenuCategoryProps> = ({
  label,
  icon,
  onPress,
  className = '',
  badgeCount,
}) => {
  const baseClasses = 'menu-category';
  const clickableClass = onPress ? 'menu-category--clickable' : '';
  const combinedClassName = [
    baseClasses,
    clickableClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <div className="menu-category__content" style={{ position: 'relative' }}>
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <IconText
          text={label}
          icon={icon}
          iconPosition="left"
          className="menu-category__icon-text"
        />
        {typeof badgeCount === 'number' && badgeCount > 0 && (
          <div
            style={{
              position: 'absolute',
              top: -4,
              left: 14,
              backgroundColor: '#EF4444',
              color: '#fff',
              borderRadius: 10,
              minWidth: 18,
              height: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 600,
              paddingLeft: 5,
              paddingRight: 5,
              boxSizing: 'border-box',
            }}
          >
            {badgeCount > 99 ? '99+' : badgeCount}
          </div>
        )}
      </div>
    </div>
  );

  if (onPress) {
    return (
      <button
        className={combinedClassName}
        onClick={onPress}
        type="button"
        aria-label={label}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={combinedClassName}>
      {content}
    </div>
  );
};

export default MenuCategory;

