import React from 'react';
import { Icon } from '@/components/Icon';
import { type IconName } from '@/config/iconMapping';
import { spacing, sizing, radii, typography } from '@/config/tokens';
import './button.css';

export interface SynthButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Button role/variant
   * - primary: SynthPink background with OffWhite text/icons
   * - secondary: OffWhite background with SynthPink text/icons and 2px border
   * - tertiary: 25px height, matches Primary styling, labels only, small icons, no full-width
   * - disabled: Grey50 background with DarkGrey text/icons, not clickable
   */
  variant?: 'primary' | 'secondary' | 'tertiary' | 'disabled';
  
  /**
   * Button size
   * - standard: 36px height (default)
   * - iconOnly: 44px x 44px square for icon-only buttons (12px margin all sides)
   * - tertiary: 25px height for tertiary buttons (automatically set when variant="tertiary")
   */
  size?: 'standard' | 'iconOnly' | 'tertiary';
  
  /**
   * Icon name to display (optional)
   * If provided, icon will be shown. For icon-only buttons, use size="iconOnly"
   */
  icon?: IconName;
  
  /**
   * Icon position relative to text
   * Only applies when both icon and children are provided
   * - left: Icon before text
   * - right: Icon after text
   */
  iconPosition?: 'left' | 'right';
  
  /**
   * Make button full width (calc(100vw - 40px))
   * When true, button spans full viewport width minus 40px (20px margins on each side)
   * Note: Tertiary buttons cannot be full-width
   */
  fullWidth?: boolean;
  
  /**
   * Button content (text or React node)
   */
  children?: React.ReactNode;
}

/**
 * SynthButton Component
 * 
 * A button component matching Synth design system specifications.
 * 
 * Button Roles:
 * - primary: SynthPink background, OffWhite text/icons
 * - secondary: OffWhite background, SynthPink text/icons/border (2px)
 * - tertiary: 25px height, matches Primary styling, labels only, small icons, no full-width
 * - disabled: Grey50 background, DarkGrey text/icons, not clickable
 * 
 * Shared Rules (ALL buttons):
 * - Border radius: 10px
 * - Height (default): 36px
 * - Typography: Meta (16px, medium)
 * - Box shadow: 0 4px 4px 0 rgba(0, 0, 0, 0.25)
 * - Vertical margins: 12px top and bottom
 * - Text + icon same color
 * 
 * Width Rules:
 * - Full-width: calc(100vw - 40px)
 * - Content-hugging: fits content, 12px left/right padding
 * 
 * Icon-only buttons:
 * - Size: 44x44
 * - Margin: 12px on all sides
 * - Icon centered
 * - States: Primary, Secondary, Disabled (no tertiary, no full-width)
 * 
 * Usage:
 *   <SynthButton variant="primary">Click me</SynthButton>
 *   <SynthButton variant="secondary" icon="heart" iconPosition="left">Like</SynthButton>
 *   <SynthButton variant="primary" size="iconOnly" icon="house" aria-label="Home" />
 *   <SynthButton variant="primary" fullWidth>Full Width Button</SynthButton>
 *   <SynthButton variant="tertiary" icon="star">Label</SynthButton>
 */
export const SynthButton: React.FC<SynthButtonProps> = ({
  variant = 'primary',
  size,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  children,
  className = '',
  disabled,
  ...props
}) => {
  // Determine if button should be disabled
  const isDisabled = disabled || variant === 'disabled';
  
  // Determine effective variant (disabled overrides)
  const effectiveVariant = isDisabled ? 'disabled' : variant;
  
  // Auto-set size for tertiary variant
  const effectiveSize = size || (variant === 'tertiary' ? 'tertiary' : 'standard');
  
  // Enforce rules: tertiary cannot be full-width or icon-only
  const effectiveFullWidth = variant === 'tertiary' ? false : fullWidth;
  const effectiveIconOnly = variant === 'tertiary' ? false : (effectiveSize === 'iconOnly');
  
  // Enforce rules: icon-only only allowed for primary, secondary, disabled
  if (effectiveIconOnly && !['primary', 'secondary', 'disabled'].includes(effectiveVariant)) {
    console.warn(`Icon-only buttons are only allowed for primary, secondary, or disabled variants. Using standard size instead.`);
  }
  
  // Build class names
  const baseClasses = 'synth-button';
  const variantClass = `synth-button--${effectiveVariant}`;
  const sizeClass = `synth-button--${effectiveSize}`;
  const fullWidthClass = effectiveFullWidth ? 'synth-button--full-width' : '';
  const iconOnlyClass = effectiveIconOnly ? 'synth-button--icon-only' : '';
  const combinedClassName = [
    baseClasses,
    variantClass,
    sizeClass,
    fullWidthClass,
    iconOnlyClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  
  // Icon size based on button size
  const getIconSize = (): number => {
    switch (effectiveSize) {
      case 'iconOnly':
        return 24; // Standard icon size in 44x44 button
      case 'tertiary':
        return 19; // Smaller icon for tertiary buttons (as per spec)
      case 'standard':
      default:
        return 24; // Standard icon size
    }
  };
  
  // Render icon
  const renderIcon = () => {
    if (!icon) return null;
    
    const iconSize = getIconSize();
    
    // Icons inside labeled buttons should be decorative to avoid double announcement.
    // - Icon-only buttons rely on the button's aria-label
    // - Text buttons already have visible text
    const shouldHideIconFromSR =
      isIconOnly ||
      Boolean(children) ||
      Boolean(props['aria-label']);

    return (
      <Icon
        name={icon}
        size={iconSize}
        alt={shouldHideIconFromSR ? '' : undefined}
        ariaHidden={shouldHideIconFromSR}
        className="synth-button__icon"
      />
    );
  };
  
  // Determine if this is truly an icon-only button
  const isIconOnly = effectiveIconOnly || (!children && icon && effectiveSize === 'iconOnly');
  
  return (
    <button
      type="button"
      className={combinedClassName}
      disabled={isDisabled}
      aria-label={isIconOnly && !props['aria-label'] && !children ? icon : props['aria-label']}
      {...props}
    >
      {isIconOnly ? (
        // Icon-only: render single centered icon
        renderIcon()
      ) : (
        // Text buttons: render icon and text based on iconPosition
        <>
          {icon && iconPosition === 'left' && renderIcon()}
          {children && <span className="synth-button__text">{children}</span>}
          {icon && iconPosition === 'right' && renderIcon()}
        </>
      )}
    </button>
  );
};

export default SynthButton;

