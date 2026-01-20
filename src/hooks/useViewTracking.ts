/**
 * useViewTracking Hook
 * 
 * Tracks view events when a component mounts.
 * Useful for tracking page views and component views.
 * 
 * Usage:
 * useViewTracking('view', 'home_feed', { source: 'home' });
 * useViewTracking('event', event.id, getEventMetadata(event), event.id);
 */

import { useEffect, useRef } from 'react';
import { trackInteraction } from '@/services/interactionTrackingService';

interface ViewTrackingOptions {
  enabled?: boolean;
  delay?: number; // Delay in ms before tracking (for debouncing)
}

/**
 * Track a view event when component mounts
 * 
 * @param entityType - Entity type ('view', 'event', 'artist', 'venue', etc.)
 * @param entityId - Entity identifier (required for all entity types)
 * @param metadata - Optional metadata object
 * @param entityUuid - Optional UUID (required for event, artist, venue, user, review)
 * @param options - Tracking options
 */
export function useViewTracking(
  entityType: string,
  entityId: string,
  metadata?: Record<string, any>,
  entityUuid?: string | null,
  options: ViewTrackingOptions = {}
) {
  const { enabled = true, delay = 0 } = options;
  const trackedRef = useRef(false);

  useEffect(() => {
    if (!enabled || trackedRef.current || !entityId) {
      return;
    }

    const trackView = () => {
      try {
        trackInteraction.view(entityType, entityId, undefined, {
          ...metadata,
          tracked_via: 'useViewTracking'
        }, entityUuid || undefined);
        trackedRef.current = true;
      } catch (error) {
        console.error('Error tracking view:', error);
      }
    };

    if (delay > 0) {
      const timeout = setTimeout(trackView, delay);
      return () => clearTimeout(timeout);
    } else {
      trackView();
    }
  }, [entityType, entityId, entityUuid, enabled, delay]); // metadata intentionally omitted to avoid re-tracking on metadata changes
}
