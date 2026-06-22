/**
 * Popularity Indicator
 * Shows event popularity based on interest and attendance
 */

import React from 'react';

import { Star, Crown, Sparkles } from 'lucide-react';

interface PopularityIndicatorProps {
  interestedCount: number;
  attendanceCount?: number;
  className?: string;
}

export function PopularityIndicator({
  interestedCount,
  attendanceCount,
  className,
}: PopularityIndicatorProps) {
  const getPopularityTier = () => {
    const totalInterest = interestedCount + (attendanceCount || 0);

    if (totalInterest >= 100) {
      return {
        tier: 'mega',
        label: 'Mega Popular',
        icon: Crown,
        className: 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white',
      };
    } else if (totalInterest >= 50) {
      return {
        tier: 'very',
        label: 'Very Popular',
        icon: Sparkles,
        className: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
      };
    } else if (totalInterest >= 20) {
      return {
        tier: 'popular',
        label: 'Popular',
        icon: Star,
        className: 'bg-blue-100 text-blue-800',
      };
    }

    return null;
  };

  const popularity = getPopularityTier();

  if (!popularity) {
    return null;
  }

  const Icon = popularity.icon;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', height: '25px', padding: '0 var(--spacing-small, 12px)', gap: 'var(--spacing-inline, 6px)', backgroundColor: 'var(--brand-pink-050)', color: 'var(--brand-pink-500)', border: '2px solid var(--brand-pink-500)', borderRadius: '999px', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>
      <Icon className="h-3 w-3 mr-1 fill-current" />
      {popularity.label}
    </span>
  );
}

export default PopularityIndicator;

