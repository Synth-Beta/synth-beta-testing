/**
 * Service to track background streaming sync status
 * Allows users to continue using the app while sync happens in background
 */

import { UserStreamingStatsService } from './userStreamingStatsService';
import { supabase } from '@/integrations/supabase/client';

export type SyncStatus = 'idle' | 'syncing' | 'completed' | 'error';

interface SyncState {
  status: SyncStatus;
  serviceType: 'spotify' | 'apple-music' | null;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
}

class StreamingSyncService {
  private syncState: SyncState = {
    status: 'idle',
    serviceType: null,
    startedAt: null,
    completedAt: null,
    error: null
  };

  private listeners: Array<(state: SyncState) => void> = [];
  private checkInterval: NodeJS.Timeout | null = null;

  /**
   * Start tracking a sync operation
   */
  startSync(serviceType: 'spotify' | 'apple-music'): void {
    this.syncState = {
      status: 'syncing',
      serviceType,
      startedAt: Date.now(),
      completedAt: null,
      error: null
    };
    
    // Store in localStorage for persistence across page reloads
    localStorage.setItem('streaming_sync_state', JSON.stringify(this.syncState));
    
    this.notifyListeners();
    this.startPolling();
  }

  /**
   * Mark sync as completed
   */
  completeSync(): void {
    this.syncState = {
      ...this.syncState,
      status: 'completed',
      completedAt: Date.now()
    };
    
    localStorage.setItem('streaming_sync_state', JSON.stringify(this.syncState));
    this.notifyListeners();
    this.stopPolling();
  }

  /**
   * Mark sync as error
   */
  errorSync(error: string): void {
    this.syncState = {
      ...this.syncState,
      status: 'error',
      completedAt: Date.now(),
      error
    };
    
    localStorage.setItem('streaming_sync_state', JSON.stringify(this.syncState));
    this.notifyListeners();
    this.stopPolling();
  }

  /**
   * Get current sync state
   */
  getState(): SyncState {
    return { ...this.syncState };
  }

  /**
   * Check if sync is in progress
   */
  isSyncing(): boolean {
    return this.syncState.status === 'syncing';
  }

  /**
   * Clear sync state
   */
  clearSync(): void {
    this.syncState = {
      status: 'idle',
      serviceType: null,
      startedAt: null,
      completedAt: null,
      error: null
    };
    
    localStorage.removeItem('streaming_sync_state');
    this.notifyListeners();
    this.stopPolling();
  }

  /**
   * Restore sync state from localStorage (for page reloads)
   */
  restoreState(): void {
    try {
      const stored = localStorage.getItem('streaming_sync_state');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Only restore if sync was in progress (not completed/error)
        if (parsed.status === 'syncing') {
          this.syncState = parsed;
          this.startPolling();
        } else {
          // Clear old completed/error states
          localStorage.removeItem('streaming_sync_state');
        }
      }
    } catch (error) {
      console.error('Error restoring sync state:', error);
      localStorage.removeItem('streaming_sync_state');
    }
  }

  /**
   * Start polling to check if sync has completed
   */
  private startPolling(): void {
    this.stopPolling(); // Clear any existing interval
    
    this.checkInterval = setInterval(async () => {
      if (this.syncState.status !== 'syncing' || !this.syncState.serviceType) {
        this.stopPolling();
        return;
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          this.stopPolling();
          return;
        }

        // Check if stats exist in database (indicates sync completed)
        const stats = await UserStreamingStatsService.getStats(
          user.id,
          this.syncState.serviceType,
          'all_time'
        );

        if (stats && stats.last_updated) {
          const lastUpdated = new Date(stats.last_updated).getTime();
          const startedAt = this.syncState.startedAt || 0;
          
          // If stats were updated after sync started, sync is complete
          if (lastUpdated >= startedAt - 5000) { // 5 second buffer
            this.completeSync();
          }
        }
      } catch (error) {
        console.error('Error checking sync status:', error);
      }
    }, 3000); // Check every 3 seconds
  }

  /**
   * Stop polling
   */
  private stopPolling(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Subscribe to sync state changes
   */
  subscribe(listener: (state: SyncState) => void): () => void {
    this.listeners.push(listener);
    // Immediately call with current state
    listener(this.getState());
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.getState()));
  }
}

export const streamingSyncService = new StreamingSyncService();

