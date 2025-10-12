/**
 * Unified Interaction Tracking Service
 * 
 * This service provides a centralized way to track all user interactions
 * across the application for ML and analytics purposes.
 * 
 * All interactions are logged to the user_interactions table in Supabase
 * following 3NF principles for OLTP source of truth.
 */

import { supabase } from '@/integrations/supabase/client';

export interface InteractionEvent {
  sessionId?: string;
  eventType: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, any>;
}

export interface BatchedInteractionEvent extends InteractionEvent {
  timestamp?: string;
}

class InteractionTrackingService {
  private sessionId: string;
  private eventQueue: BatchedInteractionEvent[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 10;
  private readonly BATCH_DELAY = 2000; // 2 seconds

  constructor() {
    this.sessionId = this.generateSessionId();
  }

  private generateSessionId(): string {
    return crypto.randomUUID();
  }

  /**
   * Log a single interaction event
   */
  async logInteraction(event: InteractionEvent): Promise<void> {
    try {
      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('No authenticated user for interaction logging');
        return;
      }

      // Use insert instead of rpc due to lint error and to match table structure
      const { error } = await supabase
        .from('user_interactions')
        .insert([{
          user_id: user.id,
          session_id: event.sessionId || this.sessionId,
          event_type: event.eventType,
          entity_type: event.entityType,
          entity_id: event.entityId,
          metadata: event.metadata || {}
        }]);

      if (error) {
        console.error('Failed to log interaction:', error);
        // Don't throw - logging failures shouldn't break the app
      }
    } catch (error) {
      console.error('Error logging interaction:', error);
    }
  }

  /**
   * Queue an interaction for batch processing
   */
  queueInteraction(event: InteractionEvent): void {
    this.eventQueue.push({
      ...event,
      sessionId: event.sessionId || this.sessionId,
      timestamp: new Date().toISOString()
    });

    // Process batch if it's full
    if (this.eventQueue.length >= this.BATCH_SIZE) {
      this.flushBatch();
    } else {
      // Set timeout to flush batch after delay
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
      }
      this.batchTimeout = setTimeout(() => {
        this.flushBatch();
      }, this.BATCH_DELAY);
    }
  }

  /**
   * Flush the current batch of interactions
   */
  private async flushBatch(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    const batch = [...this.eventQueue];
    this.eventQueue = [];

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    try {
      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('No authenticated user for batch logging');
        return;
      }

      // Map camelCase to snake_case for database
      const dbBatch = batch.map(event => ({
        user_id: user.id,
        session_id: event.sessionId || this.sessionId,
        event_type: event.eventType,
        entity_type: event.entityType,
        entity_id: event.entityId,
        metadata: event.metadata || {}
      }));

      // Use direct insert instead of RPC for better compatibility
      const { error } = await supabase
        .from('user_interactions')
        .insert(dbBatch);

      if (error) {
        console.error('Failed to log interaction batch:', error);
      } else {
        console.log(`✅ Logged ${dbBatch.length} interactions`);
      }
    } catch (error) {
      console.error('Error logging interaction batch:', error);
    }
  }

  /**
   * Force flush any pending interactions
   */
  async flush(): Promise<void> {
    await this.flushBatch();
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Start a new session
   */
  startNewSession(): string {
    this.sessionId = this.generateSessionId();
    return this.sessionId;
  }
}

// Export singleton instance
export const interactionTracker = new InteractionTrackingService();

// Convenience functions for common interaction types
export const trackInteraction = {
  // Search interactions
  search: (query: string, entityType: string, entityId: string, metadata?: Record<string, any>) => {
    interactionTracker.queueInteraction({
      eventType: 'search',
      entityType,
      entityId,
      metadata: {
        query,
        ...metadata
      }
    });
  },

  // Click interactions
  click: (entityType: string, entityId: string, metadata?: Record<string, any>) => {
    interactionTracker.queueInteraction({
      eventType: 'click',
      entityType,
      entityId,
      metadata
    });
  },

  // Like interactions
  like: (entityType: string, entityId: string, isLiked: boolean, metadata?: Record<string, any>) => {
    interactionTracker.queueInteraction({
      eventType: 'like',
      entityType,
      entityId,
      metadata: {
        isLiked,
        ...metadata
      }
    });
  },

  // Share interactions
  share: (entityType: string, entityId: string, platform?: string, metadata?: Record<string, any>) => {
    interactionTracker.queueInteraction({
      eventType: 'share',
      entityType,
      entityId,
      metadata: {
        platform,
        ...metadata
      }
    });
  },

  // Comment interactions
  comment: (entityType: string, entityId: string, commentLength?: number, metadata?: Record<string, any>) => {
    interactionTracker.queueInteraction({
      eventType: 'comment',
      entityType,
      entityId,
      metadata: {
        commentLength,
        ...metadata
      }
    });
  },

  // Review interactions
  review: (entityType: string, entityId: string, rating?: number, metadata?: Record<string, any>) => {
    interactionTracker.queueInteraction({
      eventType: 'review',
      entityType,
      entityId,
      metadata: {
        rating,
        ...metadata
      }
    });
  },

  // Interest interactions
  interest: (entityType: string, entityId: string, isInterested: boolean, metadata?: Record<string, any>) => {
    interactionTracker.queueInteraction({
      eventType: 'interest',
      entityType,
      entityId,
      metadata: {
        isInterested,
        ...metadata
      }
    });
  },

  // Swipe interactions
  swipe: (entityType: string, entityId: string, direction: 'like' | 'pass', metadata?: Record<string, any>) => {
    interactionTracker.queueInteraction({
      eventType: 'swipe',
      entityType,
      entityId,
      metadata: {
        direction,
        ...metadata
      }
    });
  },

  // View interactions
  view: (entityType: string, entityId: string, duration?: number, metadata?: Record<string, any>) => {
    interactionTracker.queueInteraction({
      eventType: 'view',
      entityType,
      entityId,
      metadata: {
        duration,
        ...metadata
      }
    });
  },

  // Navigation interactions
  navigate: (fromView: string, toView: string, metadata?: Record<string, any>) => {
    interactionTracker.queueInteraction({
      eventType: 'navigate',
      entityType: 'view',
      entityId: toView,
      metadata: {
        fromView,
        ...metadata
      }
    });
  },

  // Form interactions
  formSubmit: (formType: string, entityId: string, success: boolean, metadata?: Record<string, any>) => {
    interactionTracker.queueInteraction({
      eventType: 'form_submit',
      entityType: formType,
      entityId,
      metadata: {
        success,
        ...metadata
      }
    });
  },

  // Profile interactions
  profileUpdate: (field: string, entityId: string, metadata?: Record<string, any>) => {
    interactionTracker.queueInteraction({
      eventType: 'profile_update',
      entityType: 'profile',
      entityId,
      metadata: {
        field,
        ...metadata
      }
    });
  }
};

// Auto-flush on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    interactionTracker.flush();
  });
}
