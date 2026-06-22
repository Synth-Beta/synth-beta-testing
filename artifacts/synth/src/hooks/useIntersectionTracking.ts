/**
 * useIntersectionTracking Hook
 * 
 * Tracks when elements become visible in the viewport using IntersectionObserver.
 * Used for tracking event impressions, review impressions, etc.
 * 
 * Usage:
 * const trackRef = useIntersectionTracking(
 *   'event',           // entity type
 *   eventId,           // entity ID
 *   { position: 0 },   // metadata
 *   { threshold: 0.5 } // options
 * );
 * 
 * <div ref={trackRef}>...</div>
 */

import { useEffect, useRef, useCallback } from 'react';
import { trackInteraction } from '@/services/interactionTrackingService';

interface IntersectionTrackingOptions {
  threshold?: number; // 0.0 to 1.0, default 0.5 (50% visible)
  rootMargin?: string; // e.g., '0px' or '100px 0px'
  trackOnce?: boolean; // If true, only track first impression
  debounce?: number; // Debounce time in ms, default 500
}

interface TrackingMetadata {
  [key: string]: any;
}

const DEFAULT_OPTIONS: IntersectionTrackingOptions = {
  threshold: 0.5,
  rootMargin: '0px',
  trackOnce: true,
  debounce: 500
};

/**
 * Custom hook to track element visibility using IntersectionObserver
 */
export function useIntersectionTracking(
  entityType: string,
  entityId: string,
  metadata: TrackingMetadata = {},
  options: IntersectionTrackingOptions = {}
) {
  const elementRef = useRef<HTMLElement | null>(null);
  const hasTrackedRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  const trackImpression = useCallback(() => {
    // Skip if already tracked and trackOnce is enabled
    if (mergedOptions.trackOnce && hasTrackedRef.current) {
      return;
    }

    // Skip if no entity ID
    if (!entityId) {
      return;
    }

    // Track the impression
    trackInteraction.view(entityType, entityId, undefined, {
      ...metadata,
      viewport_time: Date.now(),
      tracked_via: 'intersection_observer'
    });

    hasTrackedRef.current = true;
  }, [entityType, entityId, metadata, mergedOptions.trackOnce]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // Create IntersectionObserver
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Element is visible, track after debounce
            if (debounceTimerRef.current) {
              clearTimeout(debounceTimerRef.current);
            }

            debounceTimerRef.current = setTimeout(() => {
              trackImpression();
            }, mergedOptions.debounce);
          } else {
            // Element left viewport, cancel pending track
            if (debounceTimerRef.current) {
              clearTimeout(debounceTimerRef.current);
              debounceTimerRef.current = null;
            }
          }
        });
      },
      {
        threshold: mergedOptions.threshold,
        rootMargin: mergedOptions.rootMargin
      }
    );

    // Start observing
    observer.observe(element);

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      observer.disconnect();
    };
  }, [trackImpression, mergedOptions.threshold, mergedOptions.rootMargin, mergedOptions.debounce]);

  return elementRef;
}

/**
 * Hook variant that tracks multiple elements with the same entity type
 * Useful for lists of items
 */
export function useIntersectionTrackingList(
  entityType: string,
  items: Array<{ id: string; metadata?: TrackingMetadata }>,
  options: IntersectionTrackingOptions = {}
) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const trackedItemsRef = useRef<Set<string>>(new Set());
  const debounceTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  useEffect(() => {
    // Create single observer for all items
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const itemId = entry.target.getAttribute('data-track-id');
          if (!itemId) return;

          if (entry.isIntersecting) {
            // Skip if already tracked and trackOnce is enabled
            if (mergedOptions.trackOnce && trackedItemsRef.current.has(itemId)) {
              return;
            }

            // Clear existing timer
            const existingTimer = debounceTimersRef.current.get(itemId);
            if (existingTimer) {
              clearTimeout(existingTimer);
            }

            // Set new timer
            const timer = setTimeout(() => {
              const item = items.find(i => i.id === itemId);
              if (item) {
                // Check if itemId is a UUID for entityUuid parameter
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId);
                trackInteraction.view(entityType, itemId, undefined, {
                  ...item.metadata,
                  viewport_time: Date.now(),
                  tracked_via: 'intersection_observer_list'
                }, isUUID ? itemId : undefined);
                trackedItemsRef.current.add(itemId);
              }
              debounceTimersRef.current.delete(itemId);
            }, mergedOptions.debounce);

            debounceTimersRef.current.set(itemId, timer);
          } else {
            // Element left viewport, cancel pending track
            const existingTimer = debounceTimersRef.current.get(itemId);
            if (existingTimer) {
              clearTimeout(existingTimer);
              debounceTimersRef.current.delete(itemId);
            }
          }
        });
      },
      {
        threshold: mergedOptions.threshold,
        rootMargin: mergedOptions.rootMargin
      }
    );

    observerRef.current = observer;

    // Cleanup
    return () => {
      // Clear all timers
      debounceTimersRef.current.forEach(timer => clearTimeout(timer));
      debounceTimersRef.current.clear();
      
      // Disconnect observer
      observer.disconnect();
    };
  }, [entityType, items, mergedOptions.threshold, mergedOptions.rootMargin, mergedOptions.debounce, mergedOptions.trackOnce]);

  // Return function to attach observer to elements
  const attachObserver = useCallback((element: HTMLElement | null, itemId: string) => {
    if (!element || !observerRef.current) return;
    
    element.setAttribute('data-track-id', itemId);
    observerRef.current.observe(element);
  }, []);

  return attachObserver;
}

