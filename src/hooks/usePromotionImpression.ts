/**
 * usePromotionImpression Hook
 * Tracks when promoted event cards are visible in viewport for 1+ seconds
 */

import { useEffect, useRef, useCallback } from 'react';
import { PromotionService } from '@/services/promotionService';

interface UsePromotionImpressionOptions {
  promotionId: string;
  enabled?: boolean;
  threshold?: number; // seconds to be visible before tracking
}

export function usePromotionImpression({
  promotionId,
  enabled = true,
  threshold = 1
}: UsePromotionImpressionOptions) {
  const elementRef = useRef<HTMLElement>(null);
  const startTimeRef = useRef<number | null>(null);
  const hasTrackedRef = useRef<boolean>(false);
  const sessionKey = `promotion_impression_${promotionId}`;

  const trackImpression = useCallback(async () => {
    if (!enabled || hasTrackedRef.current) return;

    // Check if already tracked in this session
    const alreadyTracked = sessionStorage.getItem(sessionKey);
    if (alreadyTracked) {
      hasTrackedRef.current = true;
      return;
    }

    try {
      await PromotionService.trackImpression(promotionId);
      sessionStorage.setItem(sessionKey, 'true');
      hasTrackedRef.current = true;
    } catch (error) {
      console.error('Error tracking promotion impression:', error);
    }
  }, [promotionId, enabled, sessionKey]);

  useEffect(() => {
    if (!enabled || !elementRef.current) return;

    const element = elementRef.current;
    let observer: IntersectionObserver;

    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0];
      
      if (entry.isIntersecting) {
        // Start timing when element becomes visible
        startTimeRef.current = Date.now();
      } else {
        // Reset timing when element becomes invisible
        startTimeRef.current = null;
      }
    };

    // Set up intersection observer
    observer = new IntersectionObserver(handleIntersection, {
      threshold: 0.5, // Element must be 50% visible
      rootMargin: '0px'
    });

    observer.observe(element);

    // Check visibility duration periodically
    const checkInterval = setInterval(() => {
      if (startTimeRef.current && !hasTrackedRef.current) {
        const visibleDuration = (Date.now() - startTimeRef.current) / 1000;
        if (visibleDuration >= threshold) {
          trackImpression();
        }
      }
    }, 500); // Check every 500ms

    return () => {
      observer.disconnect();
      clearInterval(checkInterval);
    };
  }, [enabled, threshold, trackImpression]);

  return elementRef;
}

export default usePromotionImpression;
