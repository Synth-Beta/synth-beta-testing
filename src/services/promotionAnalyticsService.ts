/**
 * Promotion Analytics Service
 * Provides detailed analytics for event promotions
 */

import { supabase } from '@/integrations/supabase/client';

export interface PromotionMetrics {
  id: string;
  event_id: string;
  promotion_tier: string;
  promotion_status: string;
  impressions: number;
  clicks: number;
  conversions: number;
  price_paid: number;
  currency: string;
  starts_at: string;
  expires_at: string;
  created_at: string;
  event: {
    id: string;
    title: string;
    artist_name: string;
    venue_name: string;
    event_date: string;
    poster_image_url?: string;
  };
}

export interface PromotionPerformance {
  promotion_id: string;
  event_title: string;
  tier: string;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number; // Click-through rate
  conversion_rate: number;
  cost_per_click: number;
  cost_per_conversion: number;
  roi: number; // Return on investment
  revenue_attributed: number;
}

export interface PromotionComparison {
  promotion_id: string;
  event_title: string;
  tier: string;
  duration_days: number;
  total_spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  conversion_rate: number;
  cost_per_click: number;
  cost_per_conversion: number;
  roi: number;
}

export class PromotionAnalyticsService {
  /**
   * Get all promotions for a user
   */
  static async getUserPromotions(userId: string): Promise<PromotionMetrics[]> {
    try {
      const { data, error } = await supabase
        .from('event_promotions')
        .select(`
          *,
          event:jambase_events(
            id,
            title,
            artist_name,
            venue_name,
            event_date,
            poster_image_url
          )
        `)
        .eq('promoted_by_user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching user promotions:', error);
      throw error;
    }
  }

  /**
   * Get detailed metrics for a single promotion
   */
  static async getPromotionMetrics(promotionId: string): Promise<PromotionPerformance | null> {
    try {
      const { data, error } = await supabase
        .from('event_promotions')
        .select(`
          *,
          event:jambase_events(
            id,
            title,
            artist_name,
            venue_name,
            event_date
          )
        `)
        .eq('id', promotionId)
        .single();

      if (error) throw error;
      if (!data) return null;

      const ctr = data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0;
      const conversionRate = data.clicks > 0 ? (data.conversions / data.clicks) * 100 : 0;
      const costPerClick = data.clicks > 0 ? data.price_paid / data.clicks : 0;
      const costPerConversion = data.conversions > 0 ? data.price_paid / data.conversions : 0;
      
      // Estimate revenue attributed (simplified calculation)
      const estimatedRevenuePerConversion = 25; // Average ticket price
      const revenueAttributed = data.conversions * estimatedRevenuePerConversion;
      const roi = revenueAttributed > 0 ? ((revenueAttributed - data.price_paid) / data.price_paid) * 100 : -100;

      return {
        promotion_id: data.id,
        event_title: data.event.title,
        tier: data.promotion_tier,
        impressions: data.impressions,
        clicks: data.clicks,
        conversions: data.conversions,
        ctr: Math.round(ctr * 100) / 100,
        conversion_rate: Math.round(conversionRate * 100) / 100,
        cost_per_click: Math.round(costPerClick * 100) / 100,
        cost_per_conversion: Math.round(costPerConversion * 100) / 100,
        roi: Math.round(roi * 100) / 100,
        revenue_attributed: Math.round(revenueAttributed * 100) / 100
      };
    } catch (error) {
      console.error('Error fetching promotion metrics:', error);
      throw error;
    }
  }

  /**
   * Get promotion performance comparison for multiple promotions
   */
  static async getPromotionPerformanceComparison(userId: string): Promise<PromotionComparison[]> {
    try {
      const { data, error } = await supabase
        .from('event_promotions')
        .select(`
          *,
          event:jambase_events(
            id,
            title,
            artist_name,
            venue_name,
            event_date
          )
        `)
        .eq('promoted_by_user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!data) return [];

      return data.map(promotion => {
        const ctr = promotion.impressions > 0 ? (promotion.clicks / promotion.impressions) * 100 : 0;
        const conversionRate = promotion.clicks > 0 ? (promotion.conversions / promotion.clicks) * 100 : 0;
        const costPerClick = promotion.clicks > 0 ? promotion.price_paid / promotion.clicks : 0;
        const costPerConversion = promotion.conversions > 0 ? promotion.price_paid / promotion.conversions : 0;
        
        const durationDays = Math.ceil(
          (new Date(promotion.expires_at).getTime() - new Date(promotion.starts_at).getTime()) / (1000 * 60 * 60 * 24)
        );
        
        const estimatedRevenuePerConversion = 25;
        const revenueAttributed = promotion.conversions * estimatedRevenuePerConversion;
        const roi = revenueAttributed > 0 ? ((revenueAttributed - promotion.price_paid) / promotion.price_paid) * 100 : -100;

        return {
          promotion_id: promotion.id,
          event_title: promotion.event.title,
          tier: promotion.promotion_tier,
          duration_days: durationDays,
          total_spend: promotion.price_paid,
          impressions: promotion.impressions,
          clicks: promotion.clicks,
          conversions: promotion.conversions,
          ctr: Math.round(ctr * 100) / 100,
          conversion_rate: Math.round(conversionRate * 100) / 100,
          cost_per_click: Math.round(costPerClick * 100) / 100,
          cost_per_conversion: Math.round(costPerConversion * 100) / 100,
          roi: Math.round(roi * 100) / 100
        };
      });
    } catch (error) {
      console.error('Error fetching promotion comparison:', error);
      throw error;
    }
  }

  /**
   * Calculate ROI for a specific promotion
   */
  static async getPromotionROI(promotionId: string): Promise<{
    roi: number;
    revenue_attributed: number;
    cost: number;
    profit: number;
    break_even_conversions: number;
  }> {
    try {
      const metrics = await this.getPromotionMetrics(promotionId);
      if (!metrics) {
        throw new Error('Promotion not found');
      }

      const cost = metrics.cost_per_conversion * metrics.conversions;
      const profit = metrics.revenue_attributed - cost;
      const breakEvenConversions = Math.ceil(cost / 25); // Assuming $25 average ticket price

      return {
        roi: metrics.roi,
        revenue_attributed: metrics.revenue_attributed,
        cost,
        profit,
        break_even_conversions: breakEvenConversions
      };
    } catch (error) {
      console.error('Error calculating promotion ROI:', error);
      throw error;
    }
  }

  /**
   * Get promotion trends over time
   */
  static async getPromotionTrends(userId: string, days: number = 30): Promise<{
    date: string;
    impressions: number;
    clicks: number;
    conversions: number;
    spend: number;
  }[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('event_promotions')
        .select('impressions, clicks, conversions, price_paid, created_at')
        .eq('promoted_by_user_id', userId)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (!data) return [];

      // Group by date and aggregate metrics
      const trendsMap = new Map<string, {
        impressions: number;
        clicks: number;
        conversions: number;
        spend: number;
      }>();

      data.forEach(promotion => {
        const date = new Date(promotion.created_at).toISOString().split('T')[0];
        const existing = trendsMap.get(date) || { impressions: 0, clicks: 0, conversions: 0, spend: 0 };
        
        trendsMap.set(date, {
          impressions: existing.impressions + promotion.impressions,
          clicks: existing.clicks + promotion.clicks,
          conversions: existing.conversions + promotion.conversions,
          spend: existing.spend + promotion.price_paid
        });
      });

      return Array.from(trendsMap.entries()).map(([date, metrics]) => ({
        date,
        ...metrics
      }));
    } catch (error) {
      console.error('Error fetching promotion trends:', error);
      throw error;
    }
  }

  /**
   * Get active promotions for display
   */
  static async getActivePromotions(limit: number = 10): Promise<PromotionMetrics[]> {
    try {
      const { data, error } = await supabase
        .from('event_promotions')
        .select(`
          *,
          event:jambase_events(
            id,
            title,
            artist_name,
            venue_name,
            event_date,
            poster_image_url
          )
        `)
        .eq('promotion_status', 'active')
        .lte('starts_at', new Date().toISOString())
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching active promotions:', error);
      throw error;
    }
  }
}

export default PromotionAnalyticsService;
