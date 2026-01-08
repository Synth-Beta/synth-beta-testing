import React from 'react';
import { icons, type IconName } from '@/config/icons';

export interface IconProps {
  /**
   * Name of the icon from the icons mapping
   */
  name: IconName;
  
  /**
   * Size of the icon in pixels
   * Default: 24px (standard icon size)
   * Use non-24 sizes only when Figma token explicitly specifies:
   * - Mini: 7px
   * - Small: 17px
   * - Medium: 35px
   * - Large: 60px
   */
  size?: number;
  
  /**
   * Alt text for accessibility
   * Optional but recommended for meaningful icons
   */
  alt?: string;
  
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * Icon Component
 * 
 * Renders an SVG icon from the assets/icons directory.
 * Uses the icon mapping from src/config/icons.ts for type-safe icon names.
 * 
 * Features:
 * - Type-safe icon names via IconName type
 * - Default size of 24px (standard icon size)
 * - No CSS filters applied (SVGs should already have correct colors)
 * - Accessible with optional alt text
 * 
 * Usage:
 *   <Icon name="house" size={24} alt="Home" />
 *   <Icon name="heart" size={35} /> // Medium size from Figma token
 * 
 * Note: For clickable icons in buttons, wrap this component in a 44x44 clickable area
 * when the icon is smaller than 44x44. This should be done at the usage site, not here.
 */
export const Icon: React.FC<IconProps> = ({
  name,
  size = 24,
  alt,
  className,
}) => {
  const iconSrc = icons[name];
  
  if (!iconSrc) {
    console.warn(`Icon "${name}" not found in icons mapping`);
    return null;
  }
  
  return (
    <img
      src={iconSrc}
      alt={alt || `${name} icon`}
      width={size}
      height={size}
      className={className}
      style={{
        display: 'block',
        flexShrink: 0,
        margin: 0,
        padding: 0,
        verticalAlign: 'middle',
      }}
    />
  );
};

export default Icon;

