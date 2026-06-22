/**
 * PromotedEventBadge Component
 * Displays promotion tier badge on event cards
 */

import React from 'react';

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
    <span style={{ display: 'inline-flex', alignItems: 'center', height: '25px', padding: '0 var(--spacing-small, 12px)', gap: 'var(--spacing-inline, 6px)', backgroundColor: 'var(--brand-pink-050)', color: 'var(--brand-pink-500)', border: '2px solid var(--brand-pink-500)', borderRadius: '999px', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>
      <Icon className={`w-3 h-3 ${config.iconClassName}`} />
      {config.text}
    </span>
  );
}

export default PromotedEventBadge;
