import { useEffect, useRef } from 'react';
import { UserVisibilityService } from '@/services/userVisibilityService';
import { useAuth } from '@/hooks/useAuth';

/**
 * Hook to track user activity and update last_active_at timestamp
 * 
 * This hook automatically updates the user's last_active_at in the following scenarios:
 * 1. When the component mounts (app opens)
 * 2. Periodically every 5 minutes while the user is active
 * 3. When the user performs specific actions (can be manually triggered)
 * 
 * Usage:
 * ```tsx
 * const { trackActivity } = useActivityTracker();
 * 
 * // Manually track activity on important actions
 * const handlePostReview = async () => {
 *   await postReview();
 *   trackActivity(); // Update last active
 * };
 * ```
 */
export function useActivityTracker() {
  const { user } = useAuth();
  const lastUpdateRef = useRef<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Minimum time between updates (in milliseconds): 2 minutes
  const MIN_UPDATE_INTERVAL = 2 * 60 * 1000;

  /**
   * Update the user's last_active_at timestamp
   * Throttled to prevent excessive database writes
   */
  const trackActivity = async () => {
    if (!user?.id) return;

    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;

    // Only update if enough time has passed
    if (timeSinceLastUpdate < MIN_UPDATE_INTERVAL) {
      return;
    }

    try {
      await UserVisibilityService.updateLastActive(user.id);
      lastUpdateRef.current = now;
      console.log('📍 Activity tracked: last_active_at updated');
    } catch (error) {
      console.error('Failed to track activity:', error);
    }
  };

  // Track activity on mount and set up periodic updates
  useEffect(() => {
    if (!user?.id) return;

    // Update immediately on mount
    trackActivity();

    // Set up periodic updates every 5 minutes
    intervalRef.current = setInterval(() => {
      trackActivity();
    }, 5 * 60 * 1000);

    // Clean up on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [user?.id]);

  // Track activity on visibility change (when user returns to tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        trackActivity();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.id]);

  return {
    trackActivity,
  };
}

