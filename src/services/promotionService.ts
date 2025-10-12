/**
 * Promotion Service
 * Handles event promotion requests, payment tracking, and promotion analytics
 */

import { supabase } from '@/integrations/supabase/client';

export interface CreatePromotionRequest {
  event_id: string;
  promotion_tier: 'basic' | 'premium' | 'featured';
  starts_at: string;
  expires_at: string;
  target_cities?: string[];
  target_genres?: string[];
}

export interface Promotion {
  id: string;
  event_id: string;
  promoted_by_user_id: string;
  promotion_tier: string;
  promotion_status: string;
  price_paid: number;
  currency: string;
  payment_status: string;
  starts_at: string;
  expires_at: string;
  impressions: number;
  clicks: number;
  conversions: number;
  created_at: string;
  updated_at: string;
}

export const PROMOTION_TIERS = {
  basic: {
    name: 'Basic',
    price: 49.99,
    duration_days: 7,
    features: [
      'Homepage promotion',
      'Search boost',
      'Basic analytics',
      '7-day duration',
    ],
    color: 'blue',
  },
  premium: {
    name: 'Premium',
    price: 149.99,
    duration_days: 14,
    features: [
      'Homepage featured section',
      'Priority in search',
      'Advanced analytics',
      'Social media sharing',
      '14-day duration',
    ],
    color: 'purple',
  },
  featured: {
    name: 'Featured',
    price: 499.99,
    duration_days: 30,
    features: [
      'Top homepage placement',
      'Email newsletter feature',
      'Premium badge',
      'Full analytics suite',
      'Dedicated support',
      '30-day duration',
    ],
    color: 'gold',
  },
};

export class PromotionService {
  /**
   * Create promotion request
   */
  static async createPromotion(
    request: CreatePromotionRequest
  ): Promise<string> {
    try {
      const { data, error } = await supabase.rpc('promote_event', {
        p_event_id: request.event_id,
        p_promotion_tier: request.promotion_tier,
        p_starts_at: request.starts_at,
        p_expires_at: request.expires_at,
        p_target_cities: request.target_cities || null,
        p_target_genres: request.target_genres || null,
      });

      if (error) throw error;
      return data; // Returns promotion_id
    } catch (error) {
      console.error('Error creating promotion:', error);
      throw error;
    }
  }

  /**
   * Get user's promotions
   */
  static async getUserPromotions(userId?: string): Promise<Promotion[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      const targetUserId = userId || user.id;

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
        .eq('promoted_by_user_id', targetUserId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching user promotions:', error);
      throw error;
    }
  }

  /**
   * Get active promotions for display
   */
  static async getActivePromotions(
    tier?: 'basic' | 'premium' | 'featured',
    limit = 10
  ): Promise<any[]> {
    try {
      let query = supabase
        .from('event_promotions')
        .select(`
          *,
          event:jambase_events(*)
        `)
        .eq('promotion_status', 'active')
        .lte('starts_at', new Date().toISOString())
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(limit);

      if (tier) {
        query = query.eq('promotion_tier', tier);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching active promotions:', error);
      throw error;
    }
  }

  /**
   * Get promotion by ID
   */
  static async getPromotion(promotionId: string): Promise<Promotion | null> {
    try {
      const { data, error } = await supabase
        .from('event_promotions')
        .select(`
          *,
          event:jambase_events(*)
        `)
        .eq('id', promotionId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching promotion:', error);
      throw error;
    }
  }

  /**
   * Get pending promotions (admin)
   */
  static async getPendingPromotions(): Promise<any[]> {
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
          ),
          promoter:profiles!event_promotions_promoted_by_user_id_fkey(
            user_id,
            name,
            avatar_url,
            account_type
          )
        `)
        .eq('promotion_status', 'pending')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching pending promotions:', error);
      throw error;
    }
  }

  /**
   * Review promotion (admin)
   */
  static async reviewPromotion(
    promotionId: string,
    approved: boolean,
    adminNotes?: string,
    rejectionReason?: string
  ): Promise<void> {
    try {
      const { error } = await supabase.rpc('review_event_promotion', {
        p_promotion_id: promotionId,
        p_approved: approved,
        p_admin_notes: adminNotes || null,
        p_rejection_reason: rejectionReason || null,
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error reviewing promotion:', error);
      throw error;
    }
  }

  /**
   * Cancel promotion
   */
  static async cancelPromotion(promotionId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('event_promotions')
        .update({
          promotion_status: 'paused',
          updated_at: new Date().toISOString(),
        })
        .eq('id', promotionId);

      if (error) throw error;
    } catch (error) {
      console.error('Error canceling promotion:', error);
      throw error;
    }
  }

  /**
   * Track promotion impression
   */
  static async trackImpression(promotionId: string): Promise<void> {
    try {
      // Increment impressions count
      const { error } = await supabase.rpc('increment', {
        table_name: 'event_promotions',
        row_id: promotionId,
        column_name: 'impressions',
      });

      // If RPC doesn't exist, use regular update
      if (error) {
        const { data } = await supabase
          .from('event_promotions')
          .select('impressions')
          .eq('id', promotionId)
          .single();

        if (data) {
          await supabase
            .from('event_promotions')
            .update({ impressions: (data.impressions || 0) + 1 })
            .eq('id', promotionId);
        }
      }
    } catch (error) {
      console.error('Error tracking impression:', error);
      // Don't throw - tracking failures shouldn't break user experience
    }
  }

  /**
   * Track promotion click
   */
  static async trackClick(promotionId: string): Promise<void> {
    try {
      const { data } = await supabase
        .from('event_promotions')
        .select('clicks')
        .eq('id', promotionId)
        .single();

      if (data) {
        await supabase
          .from('event_promotions')
          .update({ clicks: (data.clicks || 0) + 1 })
          .eq('id', promotionId);
      }
    } catch (error) {
      console.error('Error tracking click:', error);
    }
  }

  /**
   * Track promotion conversion
   */
  static async trackConversion(promotionId: string): Promise<void> {
    try {
      const { data } = await supabase
        .from('event_promotions')
        .select('conversions')
        .eq('id', promotionId)
        .single();

      if (data) {
        await supabase
          .from('event_promotions')
          .update({ conversions: (data.conversions || 0) + 1 })
          .eq('id', promotionId);
      }
    } catch (error) {
      console.error('Error tracking conversion:', error);
    }
  }

  /**
   * Get promotion analytics
   */
  static async getPromotionAnalytics(promotionId: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('event_promotions')
        .select('impressions, clicks, conversions, price_paid')
        .eq('id', promotionId)
        .single();

      if (error) throw error;

      const ctr = data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0;
      const conversionRate =
        data.clicks > 0 ? (data.conversions / data.clicks) * 100 : 0;
      const costPerClick = data.clicks > 0 ? data.price_paid / data.clicks : 0;
      const costPerConversion =
        data.conversions > 0 ? data.price_paid / data.conversions : 0;

      return {
        ...data,
        ctr: ctr.toFixed(2),
        conversion_rate: conversionRate.toFixed(2),
        cost_per_click: costPerClick.toFixed(2),
        cost_per_conversion: costPerConversion.toFixed(2),
      };
    } catch (error) {
      console.error('Error fetching promotion analytics:', error);
      throw error;
    }
  }

  /**
   * Calculate promotion pricing
   */
  static getPromotionPricing(tier: 'basic' | 'premium' | 'featured'): number {
    return PROMOTION_TIERS[tier].price;
  }

  /**
   * Get promotion tier info
   */
  static getPromotionTierInfo(tier: 'basic' | 'premium' | 'featured') {
    return PROMOTION_TIERS[tier];
  }

  /**
   * Check if event can be promoted
   */
  static async canPromoteEvent(eventId: string): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      // Check if user owns the event
      const { data: event } = await supabase
        .from('jambase_events')
        .select('created_by_user_id, claimed_by_creator_id')
        .eq('id', eventId)
        .single();

      if (!event) return false;

      return (
        event.created_by_user_id === user.id ||
        event.claimed_by_creator_id === user.id
      );
    } catch (error) {
      console.error('Error checking promotion eligibility:', error);
      return false;
    }
  }
}

export default PromotionService;

