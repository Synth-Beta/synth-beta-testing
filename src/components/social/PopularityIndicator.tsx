/**
 * Popularity Indicator
 * Shows event popularity based on interest and attendance
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
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
    <Badge className={`${popularity.className} ${className}`}>
      <Icon className="h-3 w-3 mr-1 fill-current" />
      {popularity.label}
    </Badge>
  );
}

export default PopularityIndicator;

