/**
 * usePromotionRealtime Hook
 * Provides realtime updates for promotion analytics
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PromotionAnalyticsService } from '@/services/promotionAnalyticsService';

interface UsePromotionRealtimeOptions {
  userId: string;
  enabled?: boolean;
}

export function usePromotionRealtime({ userId, enabled = true }: UsePromotionRealtimeOptions) {
  const [isLive, setIsLive] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    if (!enabled || !userId) return;

    // Set up realtime subscription for event_promotions table
    const channel = supabase
      .channel('promotion_analytics')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_promotions',
          filter: `promoted_by_user_id=eq.${userId}`
        },
        (payload) => {
          console.log('Promotion data changed:', payload);
          setLastUpdate(new Date());
          setIsLive(true);
          
          // Reset live indicator after 5 seconds
          setTimeout(() => setIsLive(false), 5000);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jambase_events',
          filter: `active_promotion_id=is.not.null`
        },
        (payload) => {
          console.log('Event promotion status changed:', payload);
          setLastUpdate(new Date());
          setIsLive(true);
          
          // Reset live indicator after 5 seconds
          setTimeout(() => setIsLive(false), 5000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, enabled]);

  return {
    isLive,
    lastUpdate
  };
}

export default usePromotionRealtime;
