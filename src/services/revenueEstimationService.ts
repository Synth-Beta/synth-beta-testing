/**
 * Revenue Estimation Service
 * 
 * Calculates estimated revenue from existing interaction data.
 * Provides revenue attribution and conversion tracking without requiring Stripe integration.
 */

import { supabase } from '@/integrations/supabase/client';
import { logError } from './errorMonitoringService';

export interface RevenueAttribution {
  id: string;
  interaction_id: string;
  revenue_type: 'ticket_click' | 'subscription' | 'affiliate' | 'estimated';
  estimated_amount: number;
  currency: string;
  attribution_window_hours: number;
  confidence_score: number; // 0-1 based on data quality
  user_id: string;
  entity_id: string;
  entity_type: string;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface RevenueMetrics {
  total_revenue: number;
  revenue_by_type: Record<string, number>;
  conversion_rate: number;
  average_order_value: number;
  revenue_per_user: number;
  top_revenue_sources: Array<{
    source: string;
    revenue: number;
    percentage: number;
  }>;
}

export interface ConversionFunnel {
  stage: string;
  users: number;
  conversion_rate: number;
  drop_off_rate: number;
  revenue_attributed: number;
}

export interface RevenueTrend {
  date: string;
  revenue: number;
  conversions: number;
  conversion_rate: number;
  average_order_value: number;
}

export class RevenueEstimationService {
  // Revenue estimation constants
  private static readonly ESTIMATED_TICKET_PRICE = 50; // USD
  private static readonly ESTIMATED_SUBSCRIPTION_PRICE = 4.99; // USD per month
  private static readonly ESTIMATED_AFFILIATE_COMMISSION = 0.05; // 5% commission
  private static readonly ATTRIBUTION_WINDOWS = {
    ticket_click: 24, // 24 hours
    subscription: 30 * 24, // 30 days
    affiliate: 7 * 24 // 7 days
  };

  /**
   * Calculate revenue attribution for ticket clicks
   */
  static async calculateTicketRevenue(
    userId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<RevenueAttribution[]> {
    try {
      const { data: ticketClicks, error } = await supabase
        .from('interactions')
        .select('*')
        .eq('user_id', userId)
        .eq('event_type', 'click')
        .eq('entity_type', 'ticket_link')
        .gte('occurred_at', timeRange.start.toISOString())
        .lte('occurred_at', timeRange.end.toISOString());

      if (error) {
        await logError('revenue_calculation_error', error, { userId, timeRange });
        return [];
      }

      const revenueAttributions: RevenueAttribution[] = [];

      for (const click of ticketClicks || []) {
        const estimatedAmount = this.estimateTicketPrice(click.metadata);
        const confidenceScore = this.calculateConfidenceScore(click.metadata);

        revenueAttributions.push({
          id: crypto.randomUUID(),
          interaction_id: click.id,
          revenue_type: 'ticket_click',
          estimated_amount: estimatedAmount,
          currency: 'USD',
          attribution_window_hours: this.ATTRIBUTION_WINDOWS.ticket_click,
          confidence_score: confidenceScore,
          user_id: userId,
          entity_id: click.entity_id,
          entity_type: click.entity_type,
          created_at: new Date().toISOString(),
          metadata: {
            original_click: click,
            estimation_method: 'ticket_click_analysis'
          }
        });
      }

      return revenueAttributions;
    } catch (error) {
      await logError('ticket_revenue_calculation_error', error, { userId, timeRange });
      return [];
    }
  }

  /**
   * Calculate subscription revenue
   */
  static async calculateSubscriptionRevenue(
    userId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<RevenueAttribution[]> {
    try {
      // Get subscription-related interactions
      const { data: subscriptionInteractions, error } = await supabase
        .from('interactions')
        .select('*')
        .eq('user_id', userId)
        .in('event_type', ['profile_update', 'form_submit'])
        .gte('occurred_at', timeRange.start.toISOString())
        .lte('occurred_at', timeRange.end.toISOString());

      if (error) {
        await logError('subscription_revenue_calculation_error', error, { userId, timeRange });
        return [];
      }

      const revenueAttributions: RevenueAttribution[] = [];

      // Look for subscription tier changes
      const subscriptionChanges = subscriptionInteractions?.filter(interaction => {
        const metadata = interaction.metadata as Record<string, any> | undefined;
        return (metadata?.field === 'subscription_tier' || metadata?.formType === 'subscription');
      }) || [];

      for (const change of subscriptionChanges) {
        const estimatedAmount = this.estimateSubscriptionValue(change.metadata);
        const confidenceScore = this.calculateSubscriptionConfidence(change.metadata);

        revenueAttributions.push({
          id: crypto.randomUUID(),
          interaction_id: change.id,
          revenue_type: 'subscription',
          estimated_amount: estimatedAmount,
          currency: 'USD',
          attribution_window_hours: this.ATTRIBUTION_WINDOWS.subscription,
          confidence_score: confidenceScore,
          user_id: userId,
          entity_id: change.entity_id,
          entity_type: change.entity_type,
          created_at: new Date().toISOString(),
          metadata: {
            original_interaction: change,
            estimation_method: 'subscription_analysis'
          }
        });
      }

      return revenueAttributions;
    } catch (error) {
      await logError('subscription_revenue_calculation_error', error, { userId, timeRange });
      return [];
    }
  }

  /**
   * Calculate affiliate revenue
   */
  static async calculateAffiliateRevenue(
    userId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<RevenueAttribution[]> {
    try {
      // Get share interactions that might lead to affiliate revenue
      const { data: shareInteractions, error } = await supabase
        .from('interactions')
        .select('*')
        .eq('user_id', userId)
        .eq('event_type', 'share')
        .gte('occurred_at', timeRange.start.toISOString())
        .lte('occurred_at', timeRange.end.toISOString());

      if (error) {
        await logError('affiliate_revenue_calculation_error', error, { userId, timeRange });
        return [];
      }

      const revenueAttributions: RevenueAttribution[] = [];

      for (const share of shareInteractions || []) {
        const estimatedAmount = this.estimateAffiliateCommission(share.metadata);
        const confidenceScore = this.calculateAffiliateConfidence(share.metadata);

        if (estimatedAmount > 0) {
          revenueAttributions.push({
            id: crypto.randomUUID(),
            interaction_id: share.id,
            revenue_type: 'affiliate',
            estimated_amount: estimatedAmount,
            currency: 'USD',
            attribution_window_hours: this.ATTRIBUTION_WINDOWS.affiliate,
            confidence_score: confidenceScore,
            user_id: userId,
            entity_id: share.entity_id,
            entity_type: share.entity_type,
            created_at: new Date().toISOString(),
            metadata: {
              original_share: share,
              estimation_method: 'affiliate_analysis'
            }
          });
        }
      }

      return revenueAttributions;
    } catch (error) {
      await logError('affiliate_revenue_calculation_error', error, { userId, timeRange });
      return [];
    }
  }

  /**
   * Get comprehensive revenue metrics for a user
   * Returns zero values until actual revenue tracking is implemented
   */
  static async getUserRevenueMetrics(
    userId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<RevenueMetrics> {
    try {
      // Revenue calculation - only count actual revenue if we have real data
      // For now, return 0 until we have actual revenue tracking
      return {
        total_revenue: 0,
        revenue_by_type: {},
        conversion_rate: 0,
        average_order_value: 0,
        revenue_per_user: 0,
        top_revenue_sources: []
      };
    } catch (error) {
      await logError('revenue_metrics_calculation_error', error, { userId, timeRange });
      return {
        total_revenue: 0,
        revenue_by_type: {},
        conversion_rate: 0,
        average_order_value: 0,
        revenue_per_user: 0,
        top_revenue_sources: []
      };
    }
  }

  /**
   * Analyze conversion funnel
   */
  static async analyzeConversionFunnel(
    userId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<ConversionFunnel[]> {
    try {
      const { data: interactions } = await supabase
        .from('interactions')
        .select('*')
        .eq('user_id', userId)
        .gte('occurred_at', timeRange.start.toISOString())
        .lte('occurred_at', timeRange.end.toISOString());

      if (!interactions) return [];

      // Define funnel stages
      const stages = [
        { name: 'discovery', events: ['view', 'search'] },
        { name: 'interest', events: ['interest', 'like', 'follow'] },
        { name: 'consideration', events: ['click', 'navigate'] },
        { name: 'conversion', events: ['ticket_click', 'form_submit'] }
      ];

      const funnel: ConversionFunnel[] = [];
      let previousStageUsers = 0;

      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        const stageInteractions = interactions.filter(interaction => 
          stage.events.includes(interaction.event_type)
        );
        const stageUsers = new Set(stageInteractions.map(i => i.user_id)).size;

        const conversionRate = previousStageUsers > 0 ? (stageUsers / previousStageUsers) * 100 : 100;
        const dropOffRate = previousStageUsers > 0 ? ((previousStageUsers - stageUsers) / previousStageUsers) * 100 : 0;

        // Revenue calculation - only count actual revenue if we have real data
        const revenueAttributed = 0;

        funnel.push({
          stage: stage.name,
          users: stageUsers,
          conversion_rate: Math.round(conversionRate * 100) / 100,
          drop_off_rate: Math.round(dropOffRate * 100) / 100,
          revenue_attributed: Math.round(revenueAttributed * 100) / 100
        });

        previousStageUsers = stageUsers;
      }

      return funnel;
    } catch (error) {
      await logError('conversion_funnel_analysis_error', error, { userId, timeRange });
      return [];
    }
  }

  /**
   * Get revenue trends over time
   */
  static async getRevenueTrends(
    timeRange: { start: Date; end: Date },
    groupBy: 'day' | 'week' | 'month' = 'day'
  ): Promise<RevenueTrend[]> {
    try {
      const { data: interactions } = await supabase
        .from('interactions')
        .select('*')
        .gte('occurred_at', timeRange.start.toISOString())
        .lte('occurred_at', timeRange.end.toISOString())
        .in('event_type', ['click', 'ticket_click', 'form_submit']);

      if (!interactions) return [];

      // Group by time period
      const trends: Record<string, { revenue: number; conversions: number; interactions: number }> = {};

      interactions.forEach(interaction => {
        const date = new Date(interaction.occurred_at);
        let key: string;

        switch (groupBy) {
          case 'day':
            key = date.toISOString().split('T')[0];
            break;
          case 'week':
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            key = weekStart.toISOString().split('T')[0];
            break;
          case 'month':
            key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            break;
          default:
            key = date.toISOString().split('T')[0];
        }

        if (!trends[key]) {
          trends[key] = { revenue: 0, conversions: 0, interactions: 0 };
        }

        trends[key].interactions++;
        if (interaction.event_type === 'ticket_click') {
          trends[key].conversions++;
          // Revenue calculation - only count actual revenue if we have real data
          trends[key].revenue += 0;
        }
      });

      return Object.entries(trends).map(([date, data]) => ({
        date,
        revenue: data.revenue,
        conversions: data.conversions,
        conversion_rate: data.interactions > 0 ? (data.conversions / data.interactions) * 100 : 0,
        average_order_value: data.conversions > 0 ? data.revenue / data.conversions : 0
      })).sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      await logError('revenue_trends_calculation_error', error, { timeRange, groupBy });
      return [];
    }
  }

  // Helper methods for revenue estimation

  private static estimateTicketPrice(metadata: any): number {
    if (metadata?.price && typeof metadata.price === 'number') {
      return metadata.price;
    }
    return this.ESTIMATED_TICKET_PRICE;
  }

  private static estimateSubscriptionValue(metadata: any): number {
    const tier = metadata?.newTier || metadata?.subscription_tier;
    switch (tier) {
      case 'premium':
        return this.ESTIMATED_SUBSCRIPTION_PRICE;
      case 'professional':
        return this.ESTIMATED_SUBSCRIPTION_PRICE * 2;
      case 'enterprise':
        return this.ESTIMATED_SUBSCRIPTION_PRICE * 5;
      default:
        return 0;
    }
  }

  private static estimateAffiliateCommission(metadata: any): number {
    const platform = metadata?.platform;
    if (platform === 'instagram' || platform === 'twitter' || platform === 'facebook') {
      return this.ESTIMATED_TICKET_PRICE * this.ESTIMATED_AFFILIATE_COMMISSION;
    }
    return 0;
  }

  private static calculateConfidenceScore(metadata: any): number {
    let score = 0.5; // Base confidence

    if (metadata?.price) score += 0.3;
    if (metadata?.venue_name) score += 0.1;
    if (metadata?.artist_name) score += 0.1;

    return Math.min(score, 1.0);
  }

  private static calculateSubscriptionConfidence(metadata: any): number {
    let score = 0.3; // Base confidence

    if (metadata?.newTier) score += 0.4;
    if (metadata?.oldTier) score += 0.2;
    if (metadata?.changeType) score += 0.1;

    return Math.min(score, 1.0);
  }

  private static calculateAffiliateConfidence(metadata: any): number {
    let score = 0.2; // Base confidence

    if (metadata?.platform) score += 0.3;
    if (metadata?.reach) score += 0.2;
    if (metadata?.engagement) score += 0.3;

    return Math.min(score, 1.0);
  }
}
