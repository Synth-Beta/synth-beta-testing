/**
 * Trending Badge
 * Shows if an event is trending based on recent activity
 * Leverages existing interactions data
 */

import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Flame } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface TrendingBadgeProps {
  eventId: string;
  className?: string;
}

export function TrendingBadge({ eventId, className }: TrendingBadgeProps) {
  const [isTrending, setIsTrending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkIfTrending();
  }, [eventId]);

  const checkIfTrending = async () => {
    try {
      // Check interactions in last 24 hours
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      const { count, error } = await supabase
        .from('interactions')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', 'event')
        .eq('entity_id', eventId)
        .gte('occurred_at', twentyFourHoursAgo.toISOString());

      if (error) {
        // Silently fail if table doesn't exist or query fails
        if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
          return;
        }
        throw error;
      }

      // Event is trending if it has 20+ interactions in 24 hours
      setIsTrending((count || 0) >= 20);
    } catch (error) {
      // Silently fail - trending badge is non-critical
      console.debug('Trending status check failed (non-critical):', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !isTrending) {
    return null;
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: '25px',
        paddingLeft: 'var(--spacing-small, 12px)',
        paddingRight: 'var(--spacing-small, 12px)',
        borderRadius: 'var(--radius-corner, 10px)',
        background: 'linear-gradient(135deg, #f97316 0%, #ec4899 100%)',
        border: '2px solid var(--brand-pink-500)',
        fontFamily: 'var(--font-family)',
        fontSize: 'var(--typography-meta-size, 16px)',
        fontWeight: 'var(--typography-meta-weight, 500)',
        lineHeight: 'var(--typography-meta-line-height, 1.5)',
        color: 'var(--neutral-50)',
        boxShadow: '0 4px 4px 0 var(--shadow-color)',
        gap: 'var(--spacing-inline, 6px)'
      }}
      className={className}
    >
      <Flame size={19} style={{ fill: 'currentColor' }} />
      <span>Trending</span>
    </div>
  );
}

export default TrendingBadge;

