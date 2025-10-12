/**
 * Trending Badge
 * Shows if an event is trending based on recent activity
 * Leverages existing user_interactions data
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

      const { data, error } = await supabase
        .from('user_interactions')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', 'event')
        .eq('entity_id', eventId)
        .gte('occurred_at', twentyFourHoursAgo.toISOString());

      if (error) throw error;

      // Event is trending if it has 20+ interactions in 24 hours
      setIsTrending((data as any) >= 20);
    } catch (error) {
      console.error('Error checking trending status:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !isTrending) {
    return null;
  }

  return (
    <Badge variant="default" className={`bg-gradient-to-r from-orange-500 to-pink-500 ${className}`}>
      <Flame className="h-3 w-3 mr-1 fill-current" />
      Trending
    </Badge>
  );
}

export default TrendingBadge;

