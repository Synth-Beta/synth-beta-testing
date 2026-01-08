import React from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { spacing, sizing, radii, typography } from '@/config/tokens';
import './button.css';

export interface SynthButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Button variant
   * - primary: SynthPink background with OffWhite text/icons
   * - outline: OffWhite background with SynthPink text/icons and border
   * - disabled: Grey50 background with DarkGrey text/icons
   */
  variant?: 'primary' | 'outline' | 'disabled';
  
  /**
   * Button size
   * - standard: 36px height (default)
   * - iconOnly: 44px x 44px square for icon-only buttons
   * - tertiary: 22px height for tertiary buttons
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
   */
  iconPosition?: 'left' | 'right';
  
  /**
   * Make button full width with 20px screen margins
   * When true, button respects screen margins for proper page layout
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
 * Design Rules:
 * - Standard buttons: 36px height
 * - Icon-only buttons: 44px x 44px
 * - Tertiary buttons: 22px height
 * - Corner radius: 10px
 * - Typography: meta (16px, medium weight)
 * - Primary: SynthPink background, OffWhite text/icons
 * - Outline: OffWhite background, SynthPink text/icons
 * - Disabled: Grey50 background, DarkGrey text/icons
 * 
 * Usage:
 *   <SynthButton variant="primary">Click me</SynthButton>
 *   <SynthButton variant="outline" icon="heart" iconPosition="left">Like</SynthButton>
 *   <SynthButton variant="primary" size="iconOnly" icon="house" aria-label="Home" />
 *   <SynthButton variant="primary" fullWidth>Full Width Button</SynthButton>
 */
export const SynthButton: React.FC<SynthButtonProps> = ({
  variant = 'primary',
  size = 'standard',
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
  
  // Build class names
  const baseClasses = 'synth-button';
  const variantClass = `synth-button--${effectiveVariant}`;
  const sizeClass = `synth-button--${size}`;
  const fullWidthClass = fullWidth ? 'synth-button--full-width' : '';
  const iconOnlyClass = size === 'iconOnly' ? 'synth-button--icon-only' : '';
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
    switch (size) {
      case 'iconOnly':
        return 24; // Standard icon size in 44x44 button
      case 'tertiary':
        return 16; // Smaller icon for tertiary buttons
      case 'standard':
      default:
        return 24; // Standard icon size
    }
  };
  
  // Render icon
  const renderIcon = () => {
    if (!icon) return null;
    
    const iconSize = getIconSize();
    
    // For icon-only buttons, don't pass alt to avoid redundancy with button aria-label
    return (
      <Icon
        name={icon}
        size={iconSize}
        className="synth-button__icon"
      />
    );
  };
  
  // Determine if this is truly an icon-only button
  const isIconOnly = size === 'iconOnly' || (!children && icon);
  
  return (
    <button
      type="button"
      className={combinedClassName}
      disabled={isDisabled}
      aria-label={isIconOnly && !props['aria-label'] && !children ? icon : props['aria-label']}
      {...props}
    >
      {icon && iconPosition === 'left' && renderIcon()}
      {children && <span className="synth-button__text">{children}</span>}
      {icon && iconPosition === 'right' && renderIcon()}
      {isIconOnly && !children && renderIcon()}
    </button>
  );
};

export default SynthButton;

