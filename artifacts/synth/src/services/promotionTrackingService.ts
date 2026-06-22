/**
 * Promotion Tracking Service
 * Bridges the gap between general interaction tracking and promotion-specific analytics
 */

import { supabase } from '@/integrations/supabase/client';

export interface PromotionTrackingEvent {
  eventId: string;
  userId: string;
  interactionType: 'view' | 'click' | 'conversion';
  metadata?: Record<string, any>;
}

export class PromotionTrackingService {
  private static tableExistsCache: boolean | null = null;
  private static tableCheckPromise: Promise<boolean> | null = null;

  /**
   * Check if event_promotions table exists (cached)
   */
  private static async checkTableExists(): Promise<boolean> {
    // Return cached result if available
    if (this.tableExistsCache !== null) {
      return this.tableExistsCache;
    }

    // If check is already in progress, wait for it
    if (this.tableCheckPromise) {
      return this.tableCheckPromise;
    }

    // Start new check
    this.tableCheckPromise = (async () => {
      try {
        // Try a minimal query to check if table exists
        const { error } = await supabase
          .from('event_promotions')
          .select('id')
          .limit(0);

        const exists = !error || (error.code !== 'PGRST205' && error.code !== '42P01' && !error.message?.includes('does not exist') && !error.message?.includes('Not Found'));
        this.tableExistsCache = exists;
        return exists;
      } catch {
        this.tableExistsCache = false;
        return false;
      } finally {
        this.tableCheckPromise = null;
      }
    })();

    return this.tableCheckPromise;
  }

  /**
   * Track a promotion interaction and update promotion metrics
   */
  static async trackPromotionInteraction(
    eventId: string,
    userId: string,
    interactionType: 'view' | 'click' | 'conversion',
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      // Check if table exists first (cached check)
      const tableExists = await this.checkTableExists();
      if (!tableExists) {
        // Table doesn't exist - silently skip (feature not available)
        return;
      }

      // First, find all active promotions for this event
      const { data: promotions, error: promotionsError } = await supabase
        .from('event_promotions')
        .select('id, impressions, clicks, conversions')
        .eq('event_id', eventId)
        .eq('promotion_status', 'active')
        .lte('starts_at', new Date().toISOString())
        .gte('expires_at', new Date().toISOString());

      if (promotionsError) {
        // If error occurs after existence check, silently skip
        return;
      }

      if (!promotions || promotions.length === 0) {
        // No active promotions for this event
        return;
      }

      // Update each active promotion
      for (const promotion of promotions) {
        const updateData: any = {};
        
        switch (interactionType) {
          case 'view':
            updateData.impressions = (promotion.impressions || 0) + 1;
            break;
          case 'click':
            updateData.clicks = (promotion.clicks || 0) + 1;
            break;
          case 'conversion':
            updateData.conversions = (promotion.conversions || 0) + 1;
            break;
        }

        if (Object.keys(updateData).length > 0) {
          const { error: updateError } = await supabase
            .from('event_promotions')
            .update(updateData)
            .eq('id', promotion.id);

          if (updateError) {
            console.error(`Error updating promotion ${promotion.id}:`, updateError);
          } else {
            console.log(`✅ Updated promotion ${promotion.id} ${interactionType}:`, updateData);
          }
        }
      }
    } catch (error) {
      console.error('Error tracking promotion interaction:', error);
    }
  }

  /**
   * Get promotion metrics by calculating from user_interactions table
   * This provides a more accurate view of promotion performance
   */
  static async getPromotionMetricsFromInteractions(
    promotionId: string,
    eventId: string
  ): Promise<{
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    conversion_rate: number;
  }> {
    try {
      // Get the promotion details
      const { data: promotion, error: promotionError } = await supabase
        .from('event_promotions')
        .select('*')
        .eq('id', promotionId)
        .single();

      if (promotionError || !promotion) {
        throw new Error('Promotion not found');
      }

      // Calculate metrics from user_interactions table
      const { data: interactions, error: interactionsError } = await supabase
        .from('interactions')
        .select('event_type, entity_type, occurred_at')
        .eq('entity_id', eventId)
        .eq('entity_type', 'event')
        .gte('occurred_at', promotion.starts_at)
        .lte('occurred_at', promotion.expires_at);

      if (interactionsError) {
        console.error('Error fetching interactions for promotion metrics:', interactionsError);
        return {
          impressions: promotion.impressions || 0,
          clicks: promotion.clicks || 0,
          conversions: promotion.conversions || 0,
          ctr: 0,
          conversion_rate: 0
        };
      }

      // Count different types of interactions
      const impressions = interactions?.filter(i => i.event_type === 'view').length || 0;
      const clicks = interactions?.filter(i => i.event_type === 'click').length || 0;
      const conversions = interactions?.filter(i => i.event_type === 'click' && i.entity_type === 'ticket_link').length || 0;

      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const conversion_rate = clicks > 0 ? (conversions / clicks) * 100 : 0;

      return {
        impressions,
        clicks,
        conversions,
        ctr: Math.round(ctr * 100) / 100,
        conversion_rate: Math.round(conversion_rate * 100) / 100
      };
    } catch (error) {
      console.error('Error calculating promotion metrics from interactions:', error);
      return {
        impressions: 0,
        clicks: 0,
        conversions: 0,
        ctr: 0,
        conversion_rate: 0
      };
    }
  }

  /**
   * Sync promotion metrics from user_interactions to event_promotions table
   * This ensures the promotion table has accurate data
   */
  static async syncPromotionMetrics(promotionId: string): Promise<void> {
    try {
      const { data: promotion, error: promotionError } = await supabase
        .from('event_promotions')
        .select('event_id, starts_at, expires_at')
        .eq('id', promotionId)
        .single();

      if (promotionError || !promotion) {
        throw new Error('Promotion not found');
      }

      // Get metrics from interactions
      const metrics = await this.getPromotionMetricsFromInteractions(promotionId, promotion.event_id);

      // Update the promotion table with calculated metrics
      const { error: updateError } = await supabase
        .from('event_promotions')
        .update({
          impressions: metrics.impressions,
          clicks: metrics.clicks,
          conversions: metrics.conversions
        })
        .eq('id', promotionId);

      if (updateError) {
        console.error('Error syncing promotion metrics:', updateError);
      } else {
        console.log(`✅ Synced promotion ${promotionId} metrics:`, metrics);
      }
    } catch (error) {
      console.error('Error syncing promotion metrics:', error);
    }
  }
}

export default PromotionTrackingService;
