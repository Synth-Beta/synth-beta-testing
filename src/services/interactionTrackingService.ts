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
  entityId?: string | null; // Legacy external ID (optional, kept as metadata)
  entityUuid?: string | null; // UUID foreign key (preferred for UUID-based entities)
  metadata?: Record<string, any>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SessionMetrics {
  duration: number;
  interactionCount: number;
  engagementScore: number;
  pageViews: number;
  bounceRate: number;
}

export interface BatchedInteractionEvent extends InteractionEvent {
  timestamp?: string;
}

// Standardized event types for validation
const VALID_EVENT_TYPES = [
  'view', 'click', 'like', 'share', 'interest', 'search', 'review', 'comment',
  'navigate', 'form_submit', 'profile_update', 'swipe', 'follow', 'unfollow',
  'attendance', 'ticket_click', 'streaming_top', 'streaming_recent'
] as const;

const VALID_ENTITY_TYPES = [
  'event', 'artist', 'venue', 'review', 'user', 'profile', 'view', 'form',
  'ticket_link', 'song', 'album', 'playlist', 'genre', 'scene', 'search'
] as const;

class InteractionTrackingService {
  private sessionId: string;
  private eventQueue: BatchedInteractionEvent[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 10;
  private readonly BATCH_DELAY = 2000; // 2 seconds
  private sessionStartTime: Date;
  private sessionInteractions: number = 0;
  private sessionPageViews: number = 0;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.sessionStartTime = new Date();
  }

  private generateSessionId(): string {
    return crypto.randomUUID();
  }

  /**
   * Validate interaction data before logging
   */
  private validateInteractionData(event: InteractionEvent): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields validation
    if (!event.eventType) {
      errors.push('eventType is required');
    } else if (!VALID_EVENT_TYPES.includes(event.eventType as any)) {
      errors.push(`Invalid eventType: ${event.eventType}. Must be one of: ${VALID_EVENT_TYPES.join(', ')}`);
    }

    if (!event.entityType) {
      errors.push('entityType is required');
    } else if (!VALID_ENTITY_TYPES.includes(event.entityType as any)) {
      errors.push(`Invalid entityType: ${event.entityType}. Must be one of: ${VALID_ENTITY_TYPES.join(', ')}`);
    }

    // Entity identifier validation
    // After normalization: entityUuid is preferred for UUID-based entities (artists, venues, events)
    // entityId is optional metadata. Some entity types don't require UUIDs (search, view, form, scene, etc.)
    // Note: 'scene' can optionally have an identifier but doesn't require one (matches DB constraint)
    const entityTypesWithoutUuid = ['search', 'view', 'form', 'ticket_link', 'song', 'album', 'playlist', 'genre', 'scene'];
    const requiresUuid = !entityTypesWithoutUuid.includes(event.entityType);
    
    if (requiresUuid) {
      // For UUID-based entities, require at least entityUuid (preferred) or entityId (legacy)
      if (!event.entityUuid && !event.entityId) {
        errors.push(`entityUuid or entityId is required for entityType: ${event.entityType}`);
      }
    } else {
      // For non-UUID entities, entityId is optional but recommended
      // Note: entityUuid doesn't make sense for these types, so we only check entityId
      if (!event.entityId) {
        warnings.push(`No entity identifier provided for entityType: ${event.entityType}. Consider providing entityId for better tracking.`);
      }
    }

    // Metadata validation
    if (event.metadata) {
      const metadataValidation = this.validateMetadata(event.entityType, event.metadata);
      if (!metadataValidation.isValid) {
        errors.push(...metadataValidation.errors);
      }
      warnings.push(...metadataValidation.warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate metadata based on entity type
   */
  private validateMetadata(entityType: string, metadata: Record<string, any>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    switch (entityType) {
      case 'event':
        if (metadata.artist_name && typeof metadata.artist_name !== 'string') {
          errors.push('artist_name must be a string');
        }
        if (metadata.venue_name && typeof metadata.venue_name !== 'string') {
          errors.push('venue_name must be a string');
        }
        if (metadata.event_date && !this.isValidDate(metadata.event_date)) {
          errors.push('event_date must be a valid ISO date string');
        }
        break;

      case 'artist':
        if (metadata.artist_name && typeof metadata.artist_name !== 'string') {
          errors.push('artist_name must be a string');
        }
        if (metadata.genres && !Array.isArray(metadata.genres)) {
          errors.push('genres must be an array');
        }
        break;

      case 'venue':
        if (metadata.venue_name && typeof metadata.venue_name !== 'string') {
          errors.push('venue_name must be a string');
        }
        if (metadata.venue_city && typeof metadata.venue_city !== 'string') {
          errors.push('venue_city must be a string');
        }
        if (metadata.venue_state && typeof metadata.venue_state !== 'string') {
          errors.push('venue_state must be a string');
        }
        break;

      case 'review':
        if (metadata.rating && (typeof metadata.rating !== 'number' || metadata.rating < 1 || metadata.rating > 5)) {
          errors.push('rating must be a number between 1 and 5');
        }
        if (metadata.review_text && typeof metadata.review_text !== 'string') {
          errors.push('review_text must be a string');
        }
        break;

      case 'ticket_link':
        if (metadata.price && typeof metadata.price !== 'number') {
          errors.push('price must be a number');
        }
        if (metadata.currency && typeof metadata.currency !== 'string') {
          errors.push('currency must be a string');
        }
        break;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Check if a string is a valid ISO date
   */
  private isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  }

  /**
   * Log error to structured error monitoring
   */
  private async logError(context: string, error: any, metadata?: any): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      await supabase.from('system_errors').insert({
        context,
        error_message: error.message || error.toString(),
        error_stack: error.stack || null,
        metadata: metadata || {},
        user_id: user?.id || null,
        timestamp: new Date().toISOString()
      });
    } catch (logError) {
      console.error('Failed to log error to system_errors:', logError);
    }
  }

  /**
   * Calculate session metrics
   */
  private calculateSessionMetrics(): SessionMetrics {
    const duration = Date.now() - this.sessionStartTime.getTime();
    const engagementScore = this.calculateEngagementScore();
    const bounceRate = this.sessionPageViews <= 1 ? 100 : 0;

    return {
      duration,
      interactionCount: this.sessionInteractions,
      engagementScore,
      pageViews: this.sessionPageViews,
      bounceRate
    };
  }

  /**
   * Calculate engagement score based on interaction patterns
   */
  private calculateEngagementScore(): number {
    if (this.sessionInteractions === 0) return 0;
    
    const duration = Date.now() - this.sessionStartTime.getTime();
    const durationMinutes = duration / (1000 * 60);
    
    // Base score from interaction count
    let score = Math.min(this.sessionInteractions * 10, 50);
    
    // Bonus for longer sessions
    if (durationMinutes > 5) score += 20;
    if (durationMinutes > 15) score += 20;
    if (durationMinutes > 30) score += 10;
    
    // Penalty for very short sessions
    if (durationMinutes < 1) score *= 0.5;
    
    return Math.min(Math.round(score), 100);
  }

  /**
   * Log a single interaction event
   */
  async logInteraction(event: InteractionEvent): Promise<void> {
    try {
      // Validate interaction data
      const validation = this.validateInteractionData(event);
      if (!validation.isValid) {
        await this.logError('interaction_validation_error', new Error(validation.errors.join(', ')), event);
        console.warn('Invalid interaction data:', validation.errors);
        return;
      }

      // Log warnings if any
      if (validation.warnings.length > 0) {
        console.warn('Interaction validation warnings:', validation.warnings);
      }

      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('No authenticated user for interaction logging');
        return;
      }

      // Track session metrics
      this.sessionInteractions++;
      if (event.eventType === 'view') {
        this.sessionPageViews++;
      }

      // Use insert instead of rpc due to lint error and to match table structure
      // Note: entity_uuid is preferred for UUID-based entities (artists, venues, events)
      // entity_id is kept as metadata for legacy support
      // Entity types that don't require entity_uuid: search, view, form, ticket_link, song, album, playlist, genre, scene
      const ENTITY_TYPES_WITHOUT_UUID_REQUIREMENT = ['search', 'view', 'form', 'ticket_link', 'song', 'album', 'playlist', 'genre', 'scene'];
      
      // Skip if entity_type requires entity_uuid but it's not provided
      if (!ENTITY_TYPES_WITHOUT_UUID_REQUIREMENT.includes(event.entityType) && !event.entityUuid) {
        console.warn(`Skipping interaction: entity_type '${event.entityType}' requires entity_uuid but it was not provided`, event);
        return;
      }
      
      const { error } = await supabase
        .from('interactions')
        .insert([{
          user_id: user.id,
          session_id: event.sessionId || this.sessionId,
          event_type: event.eventType,
          entity_type: event.entityType,
          entity_id: event.entityId || null,
          entity_uuid: event.entityUuid || null,
          metadata: event.metadata || {}
        }]);

      if (error) {
        await this.logError('interaction_logging_error', error, event);
        console.error('Failed to log interaction:', error);
        // Don't throw - logging failures shouldn't break the app
      }
    } catch (error) {
      await this.logError('interaction_logging_exception', error, event);
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

    // Declare validEvents outside try block so it's accessible in catch block
    const validEvents: BatchedInteractionEvent[] = [];

    try {
      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('No authenticated user for batch logging');
        return;
      }

      // Validate all interactions in the batch before inserting
      // Filter out invalid interactions and log warnings/errors
      const invalidEvents: { event: BatchedInteractionEvent; errors: string[] }[] = [];

      for (const event of batch) {
        const validation = this.validateInteractionData(event);
        if (!validation.isValid) {
          invalidEvents.push({ event, errors: validation.errors });
          // Log validation errors
          await this.logError('interaction_validation_error', new Error(validation.errors.join(', ')), event);
          console.warn('Invalid interaction in batch:', validation.errors, event);
        } else {
          // Log warnings if any
          if (validation.warnings.length > 0) {
            console.warn('Interaction validation warnings:', validation.warnings, event);
          }
          validEvents.push(event);
        }
      }

      // Only insert valid interactions
      if (validEvents.length === 0) {
        console.warn('No valid interactions in batch to insert');
        if (invalidEvents.length > 0) {
          console.warn(`Skipped ${invalidEvents.length} invalid interactions`);
        }
        return;
      }

      // Map camelCase to snake_case for database
      // Note: entity_uuid is preferred for UUID-based entities (artists, venues, events)
      // entity_id is kept as metadata for legacy support
      // Entity types that don't require entity_uuid: search, view, form, ticket_link, song, album, playlist, genre, scene
      const ENTITY_TYPES_WITHOUT_UUID_REQUIREMENT = ['search', 'view', 'form', 'ticket_link', 'song', 'album', 'playlist', 'genre', 'scene'];
      
      const dbBatch = validEvents
        .filter(event => {
          // Filter out events that violate the constraint
          // If entity_type is NOT in the exception list, entity_uuid must be provided
          if (!ENTITY_TYPES_WITHOUT_UUID_REQUIREMENT.includes(event.entityType) && !event.entityUuid) {
            console.warn(`Skipping interaction: entity_type '${event.entityType}' requires entity_uuid but it was not provided`, event);
            return false;
          }
          return true;
        })
        .map(event => ({
        user_id: user.id,
        session_id: event.sessionId || this.sessionId,
        event_type: event.eventType,
        entity_type: event.entityType,
        entity_id: event.entityId || null,
        entity_uuid: event.entityUuid || null,
        metadata: event.metadata || {}
      }));

      // Use direct insert instead of RPC for better compatibility
      const { error } = await supabase
        .from('interactions')
        .insert(dbBatch);

      if (error) {
        console.error('Failed to log interaction batch:', error);
        // Log error for each failed event
        for (const event of validEvents) {
          await this.logError('interaction_logging_error', error, event);
        }
      } else {
        console.log(`✅ Logged ${dbBatch.length} interactions`);
        if (invalidEvents.length > 0) {
          console.warn(`⚠️ Skipped ${invalidEvents.length} invalid interactions`);
        }
      }
    } catch (error) {
      console.error('Error logging interaction batch:', error);
      // Log error only for events that were actually attempted to be persisted
      // Invalid events were already logged as 'interaction_validation_error' during validation
      for (const event of validEvents) {
        await this.logError('interaction_logging_exception', error, event);
      }
    }
  }

  /**
   * Force flush any pending interactions
   */
  async flush(): Promise<void> {
    await this.flushBatch();
  }

  /**
   * Start a new session
   */
  startNewSession(): string {
    this.sessionId = this.generateSessionId();
    this.sessionStartTime = new Date();
    this.sessionInteractions = 0;
    this.sessionPageViews = 0;
    return this.sessionId;
  }

  /**
   * Get current session metrics
   */
  getSessionMetrics(): SessionMetrics {
    return this.calculateSessionMetrics();
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
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

  // Feed impression tracking
  trackFeedImpression: (eventId: string, metadata?: Record<string, any>) => {
    interactionTracker.queueInteraction({
      eventType: 'view',
      entityType: 'event',
      entityId: eventId,
      metadata: {
        source: 'feed',
        impression: true,
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
