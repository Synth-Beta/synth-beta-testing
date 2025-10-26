import { supabase } from '@/integrations/supabase/client';
import { AnalyticsDataService } from './analyticsDataService';

export interface VIPCustomer {
  user_id: string;
  email: string;
  display_name: string;
  vip_score: number;
  vip_tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  total_events_attended: number;
  total_events_interested: number;
  total_reviews_written: number;
  total_spending: number;
  subscription_tier: string;
  account_age_days: number;
  last_activity: string;
  engagement_score: number;
}

export interface VIPMetrics {
  total_vip_customers: number;
  vip_by_tier: {
    bronze: number;
    silver: number;
    gold: number;
    platinum: number;
  };
  vip_growth_rate: number;
  avg_vip_score: number;
  vip_retention_rate: number;
  vip_revenue_contribution: number;
}

export interface VIPTrend {
  date: string;
  total_vips: number;
  new_vips: number;
  vip_revenue: number;
}

export class VIPAnalyticsService {
  /**
   * Get VIP customers based on engagement and spending criteria
   */
  static async getVIPCustomers(userId: string, limit: number = 50): Promise<VIPCustomer[]> {
    try {
      console.log('🔍 VIPAnalyticsService: Getting VIP customers for user:', userId);

      // Get events created by this user to find their customers
      const { data: userEvents, error: eventsError } = await supabase
        .from('jambase_events')
        .select('id')
        .eq('created_by_user_id', userId)
        .eq('event_status', 'published');

      if (eventsError) {
        console.error('Error fetching user events for VIP analysis:', eventsError);
        throw eventsError;
      }

      if (!userEvents || userEvents.length === 0) {
        console.log('🔍 VIPAnalyticsService: No events found, returning empty VIP list');
        return [];
      }

      const eventIds = userEvents.map(e => e.id);

      // Get users who interacted with these events
      const { data: interactions, error: interactionsError } = await supabase
        .from('user_interactions')
        .select('user_id, event_type, entity_type, occurred_at')
        .in('entity_id', eventIds)
        .eq('entity_type', 'event');

      if (interactionsError) {
        console.error('Error fetching interactions for VIP analysis:', interactionsError);
        throw interactionsError;
      }

      // Get users who are interested in these events
      const { data: interestedUsers, error: interestedError } = await supabase
        .from('user_jambase_events')
        .select('user_id, jambase_event_id')
        .in('jambase_event_id', eventIds);

      if (interestedError) {
        console.error('Error fetching interested users for VIP analysis:', interestedError);
        throw interestedError;
      }

      // Get reviews for these events
      const { data: reviews, error: reviewsError } = await supabase
        .from('user_reviews')
        .select('user_id, event_id, review_text, rating, created_at')
        .in('event_id', eventIds)
        .eq('is_draft', false);

      if (reviewsError) {
        console.error('Error fetching reviews for VIP analysis:', reviewsError);
        throw reviewsError;
      }

      // Get user profiles and subscription info
      const userIds = [...new Set([
        ...(interactions?.map(i => i.user_id) || []),
        ...(interestedUsers?.map(i => i.user_id) || []),
        ...(reviews?.map(r => r.user_id) || [])
      ])];

      if (userIds.length === 0) {
        console.log('🔍 VIPAnalyticsService: No users found, returning empty VIP list');
        return [];
      }

      // Get all user profiles for VIP analysis (all users)
      const allProfiles = await AnalyticsDataService.getAllProfiles();
      const profiles = allProfiles.filter(p => userIds.includes(p.user_id));

      // Calculate VIP scores for each user
      const vipCustomers: VIPCustomer[] = [];

      for (const profile of profiles || []) {
        const userInteractions = interactions?.filter(i => i.user_id === profile.user_id) || [];
        const userInterested = interestedUsers?.filter(i => i.user_id === profile.user_id) || [];
        const userReviews = reviews?.filter(r => r.user_id === profile.user_id) || [];

        // Calculate engagement metrics
        const totalEventsAttended = 0; // TODO: Add attendance tracking
        const totalEventsInterested = userInterested.length;
        const totalReviewsWritten = userReviews.length;
        const totalInteractions = userInteractions.length;

        // Calculate VIP score (0-100)
        let vipScore = 0;
        
        // Event attendance (30 points max)
        vipScore += Math.min(totalEventsAttended * 5, 30);
        
        // Event interest (20 points max)
        vipScore += Math.min(totalEventsInterested * 2, 20);
        
        // Reviews written (20 points max)
        vipScore += Math.min(totalReviewsWritten * 4, 20);
        
        // Total interactions (15 points max)
        vipScore += Math.min(totalInteractions * 0.5, 15);
        
        // Subscription tier bonus (15 points max)
        const subscriptionBonus = profile.subscription_tier === 'premium' ? 15 : 
                                 profile.subscription_tier === 'professional' ? 12 : 
                                 profile.subscription_tier === 'enterprise' ? 15 : 0;
        vipScore += subscriptionBonus;

        // Only include users with VIP score >= 20 (minimum threshold)
        if (vipScore >= 20) {
          const accountAge = Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24));
          const lastActivity = userInteractions.length > 0 ? 
            userInteractions.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())[0].occurred_at :
            profile.created_at;

          // Determine VIP tier
          let vipTier: 'bronze' | 'silver' | 'gold' | 'platinum';
          if (vipScore >= 80) vipTier = 'platinum';
          else if (vipScore >= 60) vipTier = 'gold';
          else if (vipScore >= 40) vipTier = 'silver';
          else vipTier = 'bronze';

          vipCustomers.push({
            user_id: profile.user_id,
            email: '', // We don't store emails in profiles for privacy
            display_name: profile.name || 'Anonymous User',
            vip_score: Math.round(vipScore),
            vip_tier: vipTier,
            total_events_attended: totalEventsAttended,
            total_events_interested: totalEventsInterested,
            total_reviews_written: totalReviewsWritten,
            total_spending: 0, // TODO: Calculate from promotions/purchases
            subscription_tier: profile.subscription_tier || 'free',
            account_age_days: accountAge,
            last_activity: lastActivity,
            engagement_score: Math.round((totalInteractions / Math.max(accountAge, 1)) * 100) / 100
          });
        }
      }

      // Sort by VIP score and return top customers
      const sortedVIPs = vipCustomers.sort((a, b) => b.vip_score - a.vip_score);
      
      console.log('🔍 VIPAnalyticsService: Found VIP customers:', sortedVIPs.length);
      return sortedVIPs.slice(0, limit);

    } catch (error) {
      console.error('Error getting VIP customers:', error);
      throw error;
    }
  }

  /**
   * Get VIP metrics and statistics
   */
  static async getVIPMetrics(userId: string): Promise<VIPMetrics> {
    try {
      console.log('🔍 VIPAnalyticsService: Getting VIP metrics for user:', userId);

      const vipCustomers = await this.getVIPCustomers(userId, 1000); // Get all VIPs for metrics

      if (vipCustomers.length === 0) {
        return {
          total_vip_customers: 0,
          vip_by_tier: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
          vip_growth_rate: 0,
          avg_vip_score: 0,
          vip_retention_rate: 0,
          vip_revenue_contribution: 0
        };
      }

      // Calculate tier distribution
      const vipByTier = vipCustomers.reduce((acc, customer) => {
        acc[customer.vip_tier]++;
        return acc;
      }, { bronze: 0, silver: 0, gold: 0, platinum: 0 });

      // Calculate average VIP score
      const avgVipScore = vipCustomers.reduce((sum, customer) => sum + customer.vip_score, 0) / vipCustomers.length;

      // Calculate retention rate (users active in last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const activeVIPs = vipCustomers.filter(customer => 
        new Date(customer.last_activity) > thirtyDaysAgo
      ).length;
      const vipRetentionRate = (activeVIPs / vipCustomers.length) * 100;

      // Calculate revenue contribution (placeholder - would need actual spending data)
      const vipRevenueContribution = vipCustomers.reduce((sum, customer) => sum + customer.total_spending, 0);

      console.log('🔍 VIPAnalyticsService: VIP metrics calculated:', {
        total: vipCustomers.length,
        tiers: vipByTier,
        avgScore: Math.round(avgVipScore),
        retention: Math.round(vipRetentionRate)
      });

      return {
        total_vip_customers: vipCustomers.length,
        vip_by_tier: vipByTier,
        vip_growth_rate: 0, // TODO: Calculate with historical data
        avg_vip_score: Math.round(avgVipScore * 100) / 100,
        vip_retention_rate: Math.round(vipRetentionRate * 100) / 100,
        vip_revenue_contribution: vipRevenueContribution
      };

    } catch (error) {
      console.error('Error getting VIP metrics:', error);
      throw error;
    }
  }

  /**
   * Get VIP trends over time
   */
  static async getVIPTrends(userId: string, days: number = 30): Promise<VIPTrend[]> {
    try {
      console.log('🔍 VIPAnalyticsService: Getting VIP trends for user:', userId);

      // For now, return placeholder data since we need historical tracking
      // In a real implementation, you'd track VIP status changes over time
      const trends: VIPTrend[] = [];
      const today = new Date();

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        
        trends.push({
          date: date.toISOString().split('T')[0],
          total_vips: Math.floor(Math.random() * 10) + 5, // Placeholder
          new_vips: Math.floor(Math.random() * 3),
          vip_revenue: Math.floor(Math.random() * 1000) + 500
        });
      }

      console.log('🔍 VIPAnalyticsService: VIP trends generated:', trends.length, 'days');
      return trends;

    } catch (error) {
      console.error('Error getting VIP trends:', error);
      throw error;
    }
  }
}
