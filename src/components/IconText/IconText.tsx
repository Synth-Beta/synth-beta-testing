import React from 'react';
import { Icon } from '@/components/Icon';
import { type IconName } from '@/config/icons';
import './IconText.css';

export interface IconTextProps {
  /**
   * Text content to display
   */
  text: string;
  
  /**
   * Icon name from the icon mapping
   */
  icon: IconName;
  
  /**
   * Icon position relative to text
   * - "left": icon on left, text on right
   * - "right": text on left, icon on right
   */
  iconPosition: 'left' | 'right';
  
  /**
   * Optional additional CSS classes
   */
  className?: string;
  
  /**
   * Optional click handler
   */
  onClick?: () => void;
}

/**
 * IconText Component
 * 
 * A reusable component that displays an icon and text side by side.
 * 
 * Features:
 * - Two variants: leftIcon (icon left, text right) and rightIcon (text left, icon right)
 * - Responsive: max-width respects screen margins
 * - Uses design tokens for spacing and typography
 * - Uses Icon component for type-safe icon rendering
 * 
 * Usage:
 *   <IconText text="Home" icon="house" iconPosition="left" />
 *   <IconText text="Next" icon="right" iconPosition="right" onClick={handleNext} />
 */
export const IconText: React.FC<IconTextProps> = ({
  text,
  icon,
  iconPosition,
  className = '',
  onClick,
}) => {
  const baseClasses = 'icon-text';
  const positionClass = `icon-text--${iconPosition}`;
  const clickableClass = onClick ? 'icon-text--clickable' : '';
  const combinedClassName = [
    baseClasses,
    positionClass,
    clickableClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {iconPosition === 'left' && (
        <>
          <Icon name={icon} size={24} alt="" className="icon-text__icon" />
          <span className="icon-text__text">{text}</span>
        </>
      )}
      {iconPosition === 'right' && (
        <>
          <span className="icon-text__text">{text}</span>
          <Icon name={icon} size={24} alt="" className="icon-text__icon" />
        </>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        className={combinedClassName}
        onClick={onClick}
        type="button"
        aria-label={text}
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

export default IconText;

