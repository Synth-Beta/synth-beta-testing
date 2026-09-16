import React from 'react';
import { Icon } from '@/components/Icon';
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
 * A clickable row component for use in menu lists.
 *
 * Features:
 * - Fixed height (48px) matching menu item row height
 * - Specific padding and spacing matching Figma design
 * - Optional count badge anchored to the row icon
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
    <div className="menu-category__content">
      <span className="menu-category__icon-wrap">
        <Icon name={icon} size={24} alt="" className="icon-text__icon" />
        {typeof badgeCount === 'number' && badgeCount > 0 && (
          <span className="menu-category__badge" aria-hidden="true">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </span>
      <span className="menu-category__label">{label}</span>
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

