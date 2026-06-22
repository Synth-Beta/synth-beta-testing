/**
 * Hook for automatic promotion tracking
 * Tracks promotion interactions when users interact with promoted events
 */

import { useEffect } from 'react';
import { PromotionTrackingService } from '@/services/promotionTrackingService';

interface UsePromotionTrackingProps {
  eventId: string;
  userId: string;
  isPromoted?: boolean;
  interactionType?: 'view' | 'click' | 'conversion';
  metadata?: Record<string, any>;
}

export function usePromotionTracking({
  eventId,
  userId,
  isPromoted = false,
  interactionType = 'view',
  metadata
}: UsePromotionTrackingProps) {
  useEffect(() => {
    if (isPromoted && eventId && userId) {
      // Track promotion interaction
      PromotionTrackingService.trackPromotionInteraction(
        eventId,
        userId,
        interactionType,
        metadata
      );
    }
  }, [eventId, userId, isPromoted, interactionType, metadata]);
}

export default usePromotionTracking;
