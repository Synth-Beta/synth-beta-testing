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
      // First, find all active promotions for this event
      const { data: promotions, error: promotionsError } = await supabase
        .from('event_promotions')
        .select('id, impressions, clicks, conversions')
        .eq('event_id', eventId)
        .eq('promotion_status', 'active')
        .lte('starts_at', new Date().toISOString())
        .gte('expires_at', new Date().toISOString());

      if (promotionsError) {
        // If table doesn't exist, silently skip tracking (feature not available)
        // Check for 404 or table not found errors
        if (promotionsError.code === 'PGRST205' || 
            promotionsError.code === '42P01' ||
            promotionsError.message?.includes('does not exist') ||
            promotionsError.message?.includes('Not Found')) {
          // Feature not available - silently return (no console log to avoid noise)
          return;
        }
        // Other errors - log for debugging but don't throw
        console.debug('Error fetching promotions for tracking (non-critical):', promotionsError);
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
