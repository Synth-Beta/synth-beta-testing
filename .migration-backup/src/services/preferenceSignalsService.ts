import { supabase } from '@/integrations/supabase/client';

/**
 * Service for refreshing user preference signals
 * Automatically called at the start of each new session
 */
export class PreferenceSignalsService {
  private static readonly SESSION_REFRESH_KEY = 'preference_signals_refreshed';
  private static readonly REFRESH_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown

  /**
   * Refresh preference signals for the current user
   * This aggregates all signals: reviews, interests, follows, attendance, streaming stats
   */
  static async refreshSignals(): Promise<{ success: boolean; signalsUpdated?: number; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('refresh_user_preference_signals');

      if (error) {
        console.error('Error refreshing preference signals:', error);
        return {
          success: false,
          error: error.message
        };
      }

      if (data && data.success) {
        console.log('✅ Preference signals refreshed:', {
          signalsUpdated: data.signals_updated,
          timestamp: data.timestamp
        });
        return {
          success: true,
          signalsUpdated: data.signals_updated
        };
      }

      return {
        success: false,
        error: 'Unknown error'
      };
    } catch (error) {
      console.error('Exception refreshing preference signals:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check if signals should be refreshed for this session
   * Uses localStorage to track if we've already refreshed in this session
   */
  static shouldRefreshForSession(): boolean {
    const lastRefresh = localStorage.getItem(this.SESSION_REFRESH_KEY);
    
    if (!lastRefresh) {
      return true; // Never refreshed
    }

    const lastRefreshTime = parseInt(lastRefresh, 10);
    const now = Date.now();
    const timeSinceRefresh = now - lastRefreshTime;

    // Refresh if it's been more than the cooldown period
    return timeSinceRefresh > this.REFRESH_COOLDOWN_MS;
  }

  /**
   * Mark that signals have been refreshed for this session
   */
  static markRefreshed(): void {
    localStorage.setItem(this.SESSION_REFRESH_KEY, Date.now().toString());
  }

  /**
   * Clear the refresh marker (useful for testing or forced refresh)
   */
  static clearRefreshMarker(): void {
    localStorage.removeItem(this.SESSION_REFRESH_KEY);
  }

  /**
   * Refresh signals if needed for this session
   * Called automatically at session start
   */
  static async refreshIfNeeded(): Promise<void> {
    if (!this.shouldRefreshForSession()) {
      console.log('⏭️ Skipping preference signals refresh (recently refreshed)');
      return;
    }

    console.log('🔄 Refreshing preference signals at session start...');
    const result = await this.refreshSignals();
    
    if (result.success) {
      this.markRefreshed();
    } else {
      // Don't mark as refreshed if it failed - allow retry
      console.warn('⚠️ Preference signals refresh failed, will retry on next session');
    }
  }
}

