import React from 'react';
import { Icon } from '@/components/Icon';
import { type IconName } from '@/config/iconMapping';
import './EmptyState.css';

export interface EmptyStateProps {
  /**
   * Icon name to display (large size)
   * Should be a large icon variant if available
   */
  icon: IconName;
  
  /**
   * Main heading text (body typography, off black)
   */
  heading: string;
  
  /**
   * Subtitle/description text (meta typography, dark grey)
   */
  description: string;
  
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * EmptyState Component
 * 
 * A reusable component for displaying empty/blank states.
 * 
 * Layout:
 * - Centered vertically
 * - 6px spacing between icon, heading, and description
 * - Large icon (dark grey)
 * - Heading: body typography, off black
 * - Description: meta typography, dark grey
 * 
 * Usage:
 *   <EmptyState 
 *     icon="music" 
 *     heading="No events yet" 
 *     description="Check back later for upcoming events" 
 *   />
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  heading,
  description,
  className = '',
}) => {
  return (
    <div className={`empty-state ${className}`}>
      <div className="empty-state__icon">
        <Icon name={icon} size={60} alt="" />
      </div>
      <h2 className="empty-state__heading">{heading}</h2>
      <p className="empty-state__description">{description}</p>
    </div>
  );
};

export default EmptyState;

