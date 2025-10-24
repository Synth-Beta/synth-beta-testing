/**
 * PromotedEventBadge Component
 * Displays promotion tier badge on event cards
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Star, Crown } from 'lucide-react';

interface PromotedEventBadgeProps {
  promotionTier: 'basic' | 'premium' | 'featured';
  className?: string;
}

export function PromotedEventBadge({ promotionTier, className = '' }: PromotedEventBadgeProps) {
  const getBadgeConfig = (tier: string) => {
    // All promoted events get gold styling with "Promoted" label
    return {
      icon: Crown,
      text: 'Promoted',
      className: 'bg-gradient-to-r from-yellow-100 to-amber-100 text-yellow-800 border-yellow-300 hover:from-yellow-200 hover:to-amber-200 shadow-lg shadow-yellow-200/50',
      iconClassName: 'text-yellow-600'
    };
  };

  const config = getBadgeConfig(promotionTier);
  const Icon = config.icon;

  return (
    <Badge 
      variant="secondary" 
      className={`flex items-center gap-1 text-xs font-medium ${config.className} ${className}`}
    >
      <Icon className={`w-3 h-3 ${config.iconClassName}`} />
      {config.text}
    </Badge>
  );
}

export default PromotedEventBadge;
