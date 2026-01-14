import React from 'react';
import { bottomNavSelectedIcons } from '@/config/icons';
import { shouldKeepAsSvg, getLucideIconName, type IconName } from '@/config/iconMapping';
import { getLucideIcon } from './lucideIconMap';
import './Icon.css';

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
   * Color for the icon (CSS color value or design token)
   * If provided, applies this color via CSS. If not provided, icon inherits parent color.
   * Examples: "#CC2486", "var(--brand-pink-500)", "currentColor"
   */
  color?: string;
  
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
 * Renders icons using lucide-react for most icons, or SVG files for bottom nav selected-state icons.
 * 
 * Features:
 * - Type-safe icon names via IconName type
 * - Default size of 24px (standard icon size)
 * - Optional color prop for precise color control
 * - Icons use currentColor by default (inherit from parent)
 * - Preserves aspect ratio and allows resizing
 * - Accessible with optional alt text
 * 
 * Usage:
 *   <Icon name="house" size={24} alt="Home" />
 *   <Icon name="heart" size={35} color="#CC2486" />
 *   <Icon name="house" color="var(--brand-pink-500)" />
 * 
 * Note: For clickable icons in buttons, wrap this component in a 44x44 clickable area
 * when the icon is smaller than 44x44. This should be done at the usage site, not here.
 */
export const Icon: React.FC<IconProps> = ({
  name,
  size = 24,
  color,
  alt,
  className,
}) => {
  const shouldUseSvg = shouldKeepAsSvg(name);
  const iconSrc = shouldUseSvg
    ? bottomNavSelectedIcons[name as keyof typeof bottomNavSelectedIcons]
    : null;

  // Check if this icon should remain as SVG (bottom nav selected-state icons only)
  if (shouldUseSvg) {
    if (!iconSrc) {
      console.error(`❌ Icon "${name}" not found in icons mapping`);
      return (
        <span
          style={{
            display: 'inline-block',
            width: `${size}px`,
            height: `${size}px`,
            backgroundColor: '#ff0000',
            color: '#fff',
            fontSize: '10px',
            textAlign: 'center',
            lineHeight: `${size}px`,
          }}
          title={`Missing icon: ${name}`}
        >
          ?
        </span>
      );
    }

    return (
      <img
        src={iconSrc}
        alt={alt || `${name} icon`}
        width={size}
        height={size}
        className={`synth-icon ${className || ''}`}
        style={{
          display: 'block',
          flexShrink: 0,
          margin: 0,
          padding: 0,
          verticalAlign: 'middle',
          objectFit: 'contain',
          objectPosition: 'center',
        }}
      />
    );
  }
  
  // Use lucide-react for all other icons
  const lucideName = getLucideIconName(name);
  const LucideIconComponent = lucideName ? getLucideIcon(lucideName) : null;
  
  if (!LucideIconComponent) {
    console.error(`❌ Icon "${name}" not found in lucide-react mapping`);
    return (
      <span
        style={{
          display: 'inline-block',
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: '#ff0000',
          color: '#fff',
          fontSize: '10px',
          textAlign: 'center',
          lineHeight: `${size}px`,
        }}
        title={`Missing icon: ${name}`}
      >
        ?
      </span>
    );
  }
  
  // Render lucide-react icon
  return (
    <span
      className={`synth-icon ${className || ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        margin: 0,
        padding: 0,
        verticalAlign: 'middle',
        width: `${size}px`,
        height: `${size}px`,
        lineHeight: 0,
        color: color || undefined,
      }}
      aria-label={alt || `${name} icon`}
      role="img"
    >
      <LucideIconComponent
        size={size}
        color={color || 'currentColor'}
        strokeWidth={2}
        aria-hidden="true"
      />
    </span>
  );
};

export default Icon;
