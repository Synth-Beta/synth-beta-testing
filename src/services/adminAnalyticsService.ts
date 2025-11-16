import { supabase } from '@/integrations/supabase/client';
import { AnalyticsDataService } from './analyticsDataService';

export interface PlatformStats {
  total_users: number;
  total_events: number;
  total_interactions: number;
  active_users_today: number;
  daily_active_users: number;
  monthly_active_users: number;
  new_users_this_month: number;
  platform_growth_rate: number;
  average_session_duration: number;
}

export interface UserGrowth {
  date: string;
  new_users: number;
  active_users: number;
  total_users: number;
  retention_rate: number;
}

export interface EngagementMetrics {
  total_page_views: number;
  total_sessions: number;
  average_session_duration: number;
  bounce_rate: number;
  events_viewed: number;
  searches_performed: number;
  reviews_written: number;
  tickets_clicked: number;
}

export interface ActiveUserMetrics {
  total_active_users: number;
  active_users_7d: number;
  active_users_30d: number;
  active_users_90d: number;
  avg_interactions_per_active_user: number;
  avg_account_age_days: number;
  geographic_distribution: GeographicDistribution[];
  verification_stats: {
    total_verified: number;
    avg_trust_score: number;
    avg_verification_progress: number;
    users_near_verification: number;
  };
  time_series_data: {
    daily: TimeSeriesDataPoint[];
    weekly: TimeSeriesDataPoint[];
    monthly: TimeSeriesDataPoint[];
  };
}

export interface FeatureUsage {
  feature_name: string;
  feature_category: string;
  total_uses: number;
  unique_users: number;
  uses_last_7d: number;
  uses_last_30d: number;
  avg_uses_per_user: number;
  growth_rate: number;
}

export interface FeatureAdoptionFunnel {
  feature_name: string;
  discovery_count: number;
  trial_count: number;
  adoption_count: number;
  retention_count: number;
  discovery_to_trial_rate: number;
  trial_to_adoption_rate: number;
  adoption_to_retention_rate: number;
}

export interface SessionAnalytics {
  total_sessions: number;
  avg_session_duration_minutes: number;
  avg_pages_per_session: number;
  sessions_last_7d: number;
  sessions_last_30d: number;
  bounce_rate: number;
  sessions_by_hour: Array<{
    hour: number;
    session_count: number;
  }>;
}

export interface SocialGraphMetrics {
  total_connections: number;
  avg_connections_per_user: number;
  users_with_connections: number;
  users_without_connections: number;
  connection_growth_rate: number;
  avg_connection_degree: number;
  network_density: number;
}

export interface SearchEffectiveness {
  total_searches: number;
  unique_searchers: number;
  searches_last_7d: number;
  searches_last_30d: number;
  search_to_click_rate: number;
  search_to_interest_rate: number;
  top_queries: Array<{
    query: string;
    count: number;
    click_rate: number;
  }>;
  searches_by_category: Array<{
    category: string;
    count: number;
    success_rate: number;
  }>;
}

export interface ContentMetrics {
  total_events: number;
  events_this_month: number;
  total_artists: number;
  total_venues: number;
  total_reviews: number;
  average_event_rating: number;
  content_growth_rate: number;
}


export interface UserSegment {
  segment: string;
  count: number;
  percentage: number;
  avg_sessions: number;
  retention_rate: number;
}

export interface GeographicDistribution {
  country: string;
  city?: string;
  state?: string;
  users: number;
  events: number;
  revenue: number;
  growth_rate: number;
}

export interface TimeSeriesDataPoint {
  date: string;
  value: number;
}

export interface UserStats {
  total_users: number;
  verified_users: number;
  active_users_7d: number;
  active_users_30d: number;
  new_users_7d: number;
  new_users_30d: number;
  avg_account_age_days: number;
  users_with_reviews: number;
  users_with_friends: number;
}

export interface AdminAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  progress: number;
  goal: number;
  unlocked: boolean;
  unlockedAt?: string;
  category: 'platform' | 'revenue' | 'users' | 'content';
}

export interface NorthStarMetric {
  eci_per_user: number;
  total_engaged_users: number;
  total_concert_intents: number;
  monthly_growth_rate: number;
  breakdown: {
    saves: number;
    rsvps: number;
    shares: number;
  };
  top_engaged_users: Array<{
    user_id: string;
    user_name: string;
    eci_score: number;
  }>;
}

export class AdminAnalyticsService {
  /**
   * Get comprehensive platform stats
   */
  static async getPlatformStats(): Promise<PlatformStats> {
    try {
      // Get user counts
      const { count: totalUsers } = await (supabase as any)
        .from('users')
        .select('*', { count: 'exact', head: true });

      // Get event counts
      const { count: totalEvents } = await (supabase as any)
        .from('events')
        .select('*', { count: 'exact', head: true });

      // Get interaction counts (all users)
      const allInteractions = await AnalyticsDataService.getAllUserInteractions();
      const totalInteractions = allInteractions.length;

      // Calculate daily active users (calendar day) using last_active_at
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(startOfToday);
      endOfToday.setHours(23, 59, 59, 999);

      const { count: dailyActiveUsers } = await (supabase as any)
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('last_active_at', startOfToday.toISOString())
        .lte('last_active_at', endOfToday.toISOString());

      // Calculate monthly active users (trailing 30 calendar days) using last_active_at
      const startOfMauWindow = new Date();
      startOfMauWindow.setDate(startOfMauWindow.getDate() - 29);
      startOfMauWindow.setHours(0, 0, 0, 0);

      const { count: monthlyActiveUsers } = await (supabase as any)
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('last_active_at', startOfMauWindow.toISOString());

      // Get this month's new users
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      const { count: newUsersThisMonth } = await (supabase as any)
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfMonth.toISOString());

      // Calculate growth rate based on this month vs last month
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      lastMonth.setDate(1);
      const { count: newUsersLastMonth } = await (supabase as any)
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', lastMonth.toISOString())
        .lt('created_at', startOfMonth.toISOString());

      const platformGrowthRate = newUsersLastMonth > 0 
        ? ((newUsersThisMonth - newUsersLastMonth) / newUsersLastMonth) * 100 
        : 0;

      // Calculate average session duration (placeholder - would need session tracking)
      const averageSessionDuration = 0; // TODO: Implement session tracking

      return {
        total_users: totalUsers || 0,
        total_events: totalEvents || 0,
        total_interactions: totalInteractions || 0,
        active_users_today: dailyActiveUsers || 0,
        daily_active_users: dailyActiveUsers || 0,
        monthly_active_users: monthlyActiveUsers || 0,
        new_users_this_month: newUsersThisMonth || 0,
        platform_growth_rate: platformGrowthRate,
        average_session_duration: averageSessionDuration,
      };
    } catch (error) {
      console.error('Error getting platform stats:', error);
      return {
        total_users: 0,
        total_events: 0,
        total_interactions: 0,
        active_users_today: 0,
        daily_active_users: 0,
        monthly_active_users: 0,
        new_users_this_month: 0,
        platform_growth_rate: 0,
        average_session_duration: 0,
      };
    }
  }

  /**
   * Get user growth analytics
   */
  static async getUserGrowth(days: number = 30): Promise<UserGrowth[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get user registrations by date
      const { data: userRegistrations } = await (supabase as any)
        .from('users')
        .select('created_at')
        .gte('created_at', startDate.toISOString());

      // Get daily active users
      const { data: dailyActiveUsers } = await (supabase as any)
        .from('interactions')
        .select('user_id, created_at')
        .gte('created_at', startDate.toISOString());

      // Group by date
      const dailyStats = new Map<string, {
        newUsers: number;
        activeUsers: Set<string>;
        totalUsers: number;
      }>();

      // Process registrations
      userRegistrations?.forEach((user: any) => {
        const date = new Date(user.created_at).toISOString().split('T')[0];
        if (!dailyStats.has(date)) {
          dailyStats.set(date, {
            newUsers: 0,
            activeUsers: new Set(),
            totalUsers: 0,
          });
        }
        dailyStats.get(date)!.newUsers++;
      });

      // Process active users
      dailyActiveUsers?.forEach((interaction: any) => {
        const date = new Date(interaction.created_at).toISOString().split('T')[0];
        if (!dailyStats.has(date)) {
          dailyStats.set(date, {
            newUsers: 0,
            activeUsers: new Set(),
            totalUsers: 0,
          });
        }
        dailyStats.get(date)!.activeUsers.add(interaction.user_id);
      });

      // Calculate cumulative totals and retention
      let cumulativeUsers = 0;
      const growthData: UserGrowth[] = [];

      Array.from(dailyStats.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([date, stats]) => {
        cumulativeUsers += stats.newUsers;
        const activeUsersCount = stats.activeUsers.size;
        const retentionRate = cumulativeUsers > 0 ? (activeUsersCount / cumulativeUsers) * 100 : 0;

        growthData.push({
          date,
          new_users: stats.newUsers,
          active_users: activeUsersCount,
          total_users: cumulativeUsers,
          retention_rate: Math.round(retentionRate * 100) / 100,
        });
      });

      return growthData;
    } catch (error) {
      console.error('Error getting user growth:', error);
      return [];
    }
  }

  /**
   * Get engagement metrics
   */
  static async getEngagementMetrics(): Promise<EngagementMetrics> {
    try {
      // Get total interactions
      const { data: interactions } = await (supabase as any)
        .from('interactions')
        .select('*');

      // Categorize interactions
      const pageViews = interactions?.filter((i: any) => i.event_type === 'view').length || 0;
      const searches = interactions?.filter((i: any) => i.event_type === 'search').length || 0;
      const ticketClicks = interactions?.filter((i: any) => i.event_type === 'click_ticket').length || 0;

      // Get reviews count
      const { count: reviewsWritten } = await (supabase as any)
        .from('reviews')
        .select('*', { count: 'exact', head: true });

      // Calculate sessions (unique users per day)
      const uniqueUsers = new Set(interactions?.map((i: any) => i.user_id) || []);
      const totalSessions = uniqueUsers.size;

      // Calculate average session duration (placeholder)
      const averageSessionDuration = 0; // TODO: Implement session tracking

      // Calculate bounce rate (placeholder)
      const bounceRate = 0; // TODO: Implement bounce rate calculation

      return {
        total_page_views: pageViews,
        total_sessions: totalSessions,
        average_session_duration: averageSessionDuration,
        bounce_rate: bounceRate,
        events_viewed: pageViews,
        searches_performed: searches,
        reviews_written: reviewsWritten || 0,
        tickets_clicked: ticketClicks,
      };
    } catch (error) {
      console.error('Error getting engagement metrics:', error);
      return {
        total_page_views: 0,
        total_sessions: 0,
        average_session_duration: 0,
        bounce_rate: 0,
        events_viewed: 0,
        searches_performed: 0,
        reviews_written: 0,
        tickets_clicked: 0,
      };
    }
  }

  /**
   * Get active user metrics (users with 10+ interactions)
   */
  static async getActiveUserMetrics(): Promise<ActiveUserMetrics> {
    try {
      // Get all user interactions
      const allInteractions = await AnalyticsDataService.getAllUserInteractions();
      
      // Count interactions per user
      const userInteractionCounts = new Map<string, number>();
      allInteractions.forEach((interaction: any) => {
        const userId = interaction.user_id;
        userInteractionCounts.set(userId, (userInteractionCounts.get(userId) || 0) + 1);
      });

      // Active users are those with 10+ interactions
      const activeUserIds = Array.from(userInteractionCounts.entries())
        .filter(([_, count]) => count >= 10)
        .map(([userId]) => userId);

      const totalActiveUsers = activeUserIds.length;

      // Calculate time-bound active users
      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const ninetyDaysAgo = new Date(now);
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const activeUsers7d = new Set<string>();
      const activeUsers30d = new Set<string>();
      const activeUsers90d = new Set<string>();

      allInteractions.forEach((interaction: any) => {
        if (activeUserIds.includes(interaction.user_id)) {
          const occurredAt = new Date(interaction.occurred_at);
          if (occurredAt >= ninetyDaysAgo) {
            activeUsers90d.add(interaction.user_id);
          }
          if (occurredAt >= thirtyDaysAgo) {
            activeUsers30d.add(interaction.user_id);
          }
          if (occurredAt >= sevenDaysAgo) {
            activeUsers7d.add(interaction.user_id);
          }
        }
      });

      // Calculate average interactions per active user
      const totalInteractionsForActiveUsers = activeUserIds.reduce((sum, userId) => {
        return sum + (userInteractionCounts.get(userId) || 0);
      }, 0);
      const avgInteractionsPerActiveUser = totalActiveUsers > 0 
        ? totalInteractionsForActiveUsers / totalActiveUsers 
        : 0;

      // Get geographic distribution for active users
      const { data: activeUserProfiles } = await (supabase as any)
        .from('users')
        .select('user_id, location_city, created_at')
        .in('user_id', activeUserIds);

      const cityMap = new Map<string, { users: number; newUsers: number }>();
      activeUserProfiles?.forEach((profile: any) => {
        const city = profile.location_city || 'Unknown';
        if (!cityMap.has(city)) {
          cityMap.set(city, { users: 0, newUsers: 0 });
        }
        const cityData = cityMap.get(city)!;
        cityData.users++;
        
        const createdDate = new Date(profile.created_at);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        if (createdDate >= thirtyDaysAgo) {
          cityData.newUsers++;
        }
      });

      const geographicDistribution: GeographicDistribution[] = Array.from(cityMap.entries())
        .map(([city, data]) => ({
          country: 'USA',
          city: city,
          users: data.users,
          events: 0,
          revenue: 0,
          growth_rate: data.users > 0 ? (data.newUsers / data.users) * 100 : 0,
        }))
        .sort((a, b) => b.users - a.users)
        .slice(0, 20);

      // Get verification stats for active users
      const { data: activeUserVerification } = await (supabase as any)
        .from('users')
        .select('user_id, verified, trust_score, verification_criteria_met')
        .in('user_id', activeUserIds);

      const verifiedCount = activeUserVerification?.filter((p: any) => p.verified).length || 0;
      const totalTrustScores = activeUserVerification?.reduce((sum: number, p: any) => sum + (p.trust_score || 0), 0) || 0;
      const avgTrustScore = activeUserVerification?.length > 0 
        ? totalTrustScores / activeUserVerification.length 
        : 0;

      // Calculate average verification progress (criteria met)
      const totalCriteriaMet = activeUserVerification?.reduce((sum: number, p: any) => {
        const criteria = p.verification_criteria_met || {};
        return sum + Object.values(criteria).filter(Boolean).length;
      }, 0) || 0;
      const avgVerificationProgress = activeUserVerification?.length > 0 
        ? totalCriteriaMet / activeUserVerification.length 
        : 0;

      // Users near verification (40%+ trust score)
      const usersNearVerification = activeUserVerification?.filter((p: any) => 
        (p.trust_score || 0) >= 40 && !p.verified
      ).length || 0;

      // Calculate average account age
      const totalAccountAge = activeUserProfiles?.reduce((sum: number, p: any) => {
        const age = (now.getTime() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24);
        return sum + age;
      }, 0) || 0;
      const avgAccountAgeDays = activeUserProfiles?.length > 0 
        ? totalAccountAge / activeUserProfiles.length 
        : 0;

      // Time series data
      const dailyData = await this.getDAUOverTime(30);
      const weeklyData = await this.getWeeklyActiveUsers(12);
      const monthlyData = await this.getMAUOverTime(12);

      return {
        total_active_users: totalActiveUsers,
        active_users_7d: activeUsers7d.size,
        active_users_30d: activeUsers30d.size,
        active_users_90d: activeUsers90d.size,
        avg_interactions_per_active_user: Math.round(avgInteractionsPerActiveUser * 100) / 100,
        avg_account_age_days: Math.round(avgAccountAgeDays * 100) / 100,
        geographic_distribution: geographicDistribution,
        verification_stats: {
          total_verified: verifiedCount,
          avg_trust_score: Math.round(avgTrustScore * 100) / 100,
          avg_verification_progress: Math.round(avgVerificationProgress * 100) / 100,
          users_near_verification: usersNearVerification,
        },
        time_series_data: {
          daily: dailyData,
          weekly: weeklyData,
          monthly: monthlyData,
        },
      };
    } catch (error) {
      console.error('Error getting active user metrics:', error);
      return {
        total_active_users: 0,
        active_users_7d: 0,
        active_users_30d: 0,
        active_users_90d: 0,
        avg_interactions_per_active_user: 0,
        avg_account_age_days: 0,
        geographic_distribution: [],
        verification_stats: {
          total_verified: 0,
          avg_trust_score: 0,
          avg_verification_progress: 0,
          users_near_verification: 0,
        },
        time_series_data: {
          daily: [],
          weekly: [],
          monthly: [],
        },
      };
    }
  }

  /**
   * Get weekly active users over time
   */
  static async getWeeklyActiveUsers(weeks: number = 12): Promise<TimeSeriesDataPoint[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - (weeks * 7));
      startDate.setHours(0, 0, 0, 0);

      const { data: interactions } = await (supabase as any)
        .from('interactions')
        .select('user_id, occurred_at')
        .gte('occurred_at', startDate.toISOString());

      // Group by week and count unique users
      const weeklyActiveUsers = new Map<string, Set<string>>();

      interactions?.forEach((interaction: any) => {
        const date = new Date(interaction.occurred_at);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
        weekStart.setHours(0, 0, 0, 0);
        const weekKey = weekStart.toISOString().split('T')[0];

        if (!weeklyActiveUsers.has(weekKey)) {
          weeklyActiveUsers.set(weekKey, new Set());
        }
        weeklyActiveUsers.get(weekKey)!.add(interaction.user_id);
      });

      // Convert to array
      const result: TimeSeriesDataPoint[] = Array.from(weeklyActiveUsers.entries())
        .map(([date, users]) => ({
          date,
          value: users.size,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return result;
    } catch (error) {
      console.error('Error getting weekly active users:', error);
      return [];
    }
  }

  /**
   * Get content metrics
   */
  static async getContentMetrics(): Promise<ContentMetrics> {
    try {
      // Get counts for various content types
      const [
        eventsCount,
        artistsCount,
        venuesCount,
        reviewsCount
      ] = await Promise.all([
        (supabase as any).from('events').select('*', { count: 'exact', head: true }),
        (supabase as any).from('artists').select('*', { count: 'exact', head: true }),
        (supabase as any).from('venues').select('*', { count: 'exact', head: true }),
        (supabase as any).from('reviews').select('*', { count: 'exact', head: true }),
      ]);

      // Get this month's events
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      const { count: eventsThisMonth } = await (supabase as any)
        .from('events')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfMonth.toISOString());

      // Get average rating
      const { data: reviews } = await (supabase as any)
        .from('reviews')
        .select('rating')
        .not('rating', 'is', null);

      const averageRating = reviews?.length > 0 
        ? reviews.reduce((sum: number, review: any) => sum + (review.rating || 0), 0) / reviews.length 
        : 0;

      // Calculate growth rate (placeholder)
      const contentGrowthRate = 0; // TODO: Implement with historical data

      return {
        total_events: eventsCount.count || 0,
        events_this_month: eventsThisMonth || 0,
        total_artists: artistsCount.count || 0,
        total_venues: venuesCount.count || 0,
        total_reviews: reviewsCount.count || 0,
        average_event_rating: Math.round(averageRating * 100) / 100,
        content_growth_rate: contentGrowthRate,
      };
    } catch (error) {
      console.error('Error getting content metrics:', error);
      return {
        total_events: 0,
        events_this_month: 0,
        total_artists: 0,
        total_venues: 0,
        total_reviews: 0,
        average_event_rating: 0,
        content_growth_rate: 0,
      };
    }
  }

  /**
   * Get feature usage tracking
   */
  static async getFeatureUsage(): Promise<FeatureUsage[]> {
    try {
      const allInteractions = await AnalyticsDataService.getAllUserInteractions();
      
      // Define feature mappings based on event types and entity types
      const featureMap: Record<string, { name: string; category: string }> = {
        'view:event': { name: 'Event Views', category: 'Event Discovery' },
        'click:event': { name: 'Event Clicks', category: 'Event Discovery' },
        'interest:event': { name: 'Event Interest/RSVP', category: 'Event Engagement' },
        'attendance:event': { name: 'Event Attendance', category: 'Event Engagement' },
        'share:event': { name: 'Event Shares', category: 'Social' },
        'view:artist': { name: 'Artist Views', category: 'Content Discovery' },
        'click:artist': { name: 'Artist Clicks', category: 'Content Discovery' },
        'view:venue': { name: 'Venue Views', category: 'Content Discovery' },
        'click:venue': { name: 'Venue Clicks', category: 'Content Discovery' },
        'review:event': { name: 'Event Reviews', category: 'Content Creation' },
        'review:artist': { name: 'Artist Reviews', category: 'Content Creation' },
        'review:venue': { name: 'Venue Reviews', category: 'Content Creation' },
        'like:review': { name: 'Review Likes', category: 'Social Engagement' },
        'search': { name: 'Search', category: 'Discovery' },
        'click:ticket': { name: 'Ticket Clicks', category: 'Event Engagement' },
        'click:ticket_link': { name: 'Ticket Link Clicks', category: 'Event Engagement' },
        'follow:artist': { name: 'Artist Follows', category: 'Social' },
        'follow:user': { name: 'User Follows', category: 'Social' },
        'navigate': { name: 'Navigation', category: 'Platform Usage' },
        'profile_update': { name: 'Profile Updates', category: 'Profile Management' },
        'view:spotify': { name: 'Spotify Integration', category: 'Music Integration' },
        'click:spotify': { name: 'Spotify Clicks', category: 'Music Integration' },
      };

      // Group interactions by feature
      const featureStats = new Map<string, {
        totalUses: number;
        uniqueUsers: Set<string>;
        usesLast7d: number;
        usesLast30d: number;
        usesLast7dUsers: Set<string>;
        usesLast30dUsers: Set<string>;
      }>();

      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      allInteractions.forEach((interaction: any) => {
        const featureKey = `${interaction.event_type}:${interaction.entity_type}`;
        const feature = featureMap[featureKey] || { 
          name: `${interaction.event_type} (${interaction.entity_type})`, 
          category: 'Other' 
        };
        
        if (!featureStats.has(feature.name)) {
          featureStats.set(feature.name, {
            totalUses: 0,
            uniqueUsers: new Set(),
            usesLast7d: 0,
            usesLast30d: 0,
            usesLast7dUsers: new Set(),
            usesLast30dUsers: new Set(),
          });
        }

        const stats = featureStats.get(feature.name)!;
        stats.totalUses++;
        stats.uniqueUsers.add(interaction.user_id);

        const occurredAt = new Date(interaction.occurred_at);
        if (occurredAt >= thirtyDaysAgo) {
          stats.usesLast30d++;
          stats.usesLast30dUsers.add(interaction.user_id);
        }
        if (occurredAt >= sevenDaysAgo) {
          stats.usesLast7d++;
          stats.usesLast7dUsers.add(interaction.user_id);
        }
      });

      // Calculate growth rates (comparing last 7d to previous 7d)
      const fourteenDaysAgo = new Date(now);
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const previous7dUses = new Map<string, number>();

      allInteractions.forEach((interaction: any) => {
        const featureKey = `${interaction.event_type}:${interaction.entity_type}`;
        const feature = featureMap[featureKey];
        if (feature) {
          const occurredAt = new Date(interaction.occurred_at);
          if (occurredAt >= fourteenDaysAgo && occurredAt < sevenDaysAgo) {
            previous7dUses.set(feature.name, (previous7dUses.get(feature.name) || 0) + 1);
          }
        }
      });

      // Convert to array
      const result: FeatureUsage[] = Array.from(featureStats.entries()).map(([featureName, stats]) => {
        const feature = Object.values(featureMap).find(f => f.name === featureName) || { name: featureName, category: 'Other' };
        const previous7d = previous7dUses.get(featureName) || 0;
        const growthRate = previous7d > 0 
          ? ((stats.usesLast7d - previous7d) / previous7d) * 100 
          : 0;

      return {
          feature_name: featureName,
          feature_category: feature.category,
          total_uses: stats.totalUses,
          unique_users: stats.uniqueUsers.size,
          uses_last_7d: stats.usesLast7d,
          uses_last_30d: stats.usesLast30d,
          avg_uses_per_user: stats.uniqueUsers.size > 0 
            ? stats.totalUses / stats.uniqueUsers.size 
            : 0,
          growth_rate: Math.round(growthRate * 100) / 100,
        };
      });

      return result.sort((a, b) => b.total_uses - a.total_uses);
    } catch (error) {
      console.error('Error getting feature usage:', error);
      return [];
    }
  }

  /**
   * Get user segmentation
   */
  static async getUserSegments(): Promise<UserSegment[]> {
    try {
      // Get all users with their activity
      const { data: users } = await (supabase as any)
        .from('users')
        .select('user_id, created_at');

      // Get user interactions for segmentation
      const { data: interactions } = await (supabase as any)
        .from('interactions')
        .select('user_id, created_at');

      // Segment users based on activity
      const userActivity = new Map<string, {
        sessions: number;
        daysActive: Set<string>;
      }>();

      interactions?.forEach((interaction: any) => {
        const userId = interaction.user_id;
        if (!userActivity.has(userId)) {
          userActivity.set(userId, {
            sessions: 0,
            daysActive: new Set(),
          });
        }
        const activity = userActivity.get(userId)!;
        activity.sessions++;
        activity.daysActive.add(new Date(interaction.created_at).toISOString().split('T')[0]);
      });

      // Define segments
      const segments = {
        'New Users': { minSessions: 0, maxSessions: 5 },
        'Active Users': { minSessions: 6, maxSessions: 20 },
        'Power Users': { minSessions: 21, maxSessions: Infinity },
      };

      const segmentData: UserSegment[] = Object.entries(segments).map(([segmentName, range]) => {
        const segmentUsers = Array.from(userActivity.entries()).filter(([_, activity]) => 
          activity.sessions >= range.minSessions && activity.sessions <= range.maxSessions
        );

        const count = segmentUsers.length;
        const totalUsers = userActivity.size;
        const percentage = totalUsers > 0 ? (count / totalUsers) * 100 : 0;

        const avgSessions = count > 0 
          ? segmentUsers.reduce((sum, [_, activity]) => sum + activity.sessions, 0) / count 
          : 0;

        const retentionRate = count > 0 
          ? segmentUsers.reduce((sum, [_, activity]) => sum + activity.daysActive.size, 0) / count / 30 * 100 
          : 0;

        return {
          segment: segmentName,
          count,
          percentage: Math.round(percentage * 100) / 100,
          avg_sessions: Math.round(avgSessions * 100) / 100,
          retention_rate: Math.round(retentionRate * 100) / 100,
        };
      });

      return segmentData;
    } catch (error) {
      console.error('Error getting user segments:', error);
      return [];
    }
  }

  /**
   * Get geographic distribution based on user location_city
   */
  static async getGeographicDistribution(): Promise<GeographicDistribution[]> {
    try {
      // Get users with their location cities
      const { data: profiles } = await (supabase as any)
        .from('users')
        .select('user_id, location_city, created_at');

      if (!profiles || profiles.length === 0) {
        return [];
      }

      // Group by city
      const cityMap = new Map<string, {
        users: number;
        events: number;
        newUsers: number;
      }>();

      profiles.forEach((profile: any) => {
        const city = profile.location_city || 'Unknown';
        if (!cityMap.has(city)) {
          cityMap.set(city, {
            users: 0,
            events: 0,
            newUsers: 0,
          });
        }
        const cityData = cityMap.get(city)!;
        cityData.users++;
        
        // Count new users (created in last 30 days)
        const createdDate = new Date(profile.created_at);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        if (createdDate >= thirtyDaysAgo) {
          cityData.newUsers++;
        }
      });

      // Get events by city (if we have city data in events)
      // For now, we'll estimate based on user distribution
      const totalEvents = await (supabase as any)
        .from('events')
        .select('*', { count: 'exact', head: true });
      
      const totalEventCount = totalEvents.count || 0;
      const totalUsers = profiles.length;
      
      // Distribute events proportionally to users (rough estimate)
      cityMap.forEach((data, city) => {
        data.events = Math.round((data.users / totalUsers) * totalEventCount);
      });

      // Convert to array and calculate growth rates
      const distribution: GeographicDistribution[] = Array.from(cityMap.entries())
        .map(([city, data]) => {
          // Calculate growth rate based on new users
          const growthRate = data.users > 0 
            ? (data.newUsers / data.users) * 100 
            : 0;

          return {
            country: 'USA', // Default, could be enhanced with actual country data
            city: city,
            users: data.users,
            events: data.events,
            revenue: 0,
            growth_rate: Math.round(growthRate * 100) / 100,
          };
        })
        .sort((a, b) => b.users - a.users)
        .slice(0, 20); // Top 20 cities

      return distribution;
    } catch (error) {
      console.error('Error getting geographic distribution:', error);
      return [];
    }
  }

  /**
   * Get Daily Active Users (DAU) over time
   */
  static async getDAUOverTime(days: number = 30): Promise<TimeSeriesDataPoint[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      // Get all user interactions grouped by date
      const { data: interactions } = await (supabase as any)
        .from('interactions')
        .select('user_id, occurred_at')
        .gte('occurred_at', startDate.toISOString());

      // Group by date and count unique users per day
      const dailyActiveUsers = new Map<string, Set<string>>();

      interactions?.forEach((interaction: any) => {
        const date = new Date(interaction.occurred_at).toISOString().split('T')[0];
        if (!dailyActiveUsers.has(date)) {
          dailyActiveUsers.set(date, new Set());
        }
        dailyActiveUsers.get(date)!.add(interaction.user_id);
      });

      // Also check profiles.last_active_at for users who haven't interacted but were active
      const { data: profiles } = await (supabase as any)
        .from('users')
        .select('user_id, last_active_at')
        .not('last_active_at', 'is', null)
        .gte('last_active_at', startDate.toISOString());

      profiles?.forEach((profile: any) => {
        const date = new Date(profile.last_active_at).toISOString().split('T')[0];
        if (!dailyActiveUsers.has(date)) {
          dailyActiveUsers.set(date, new Set());
        }
        dailyActiveUsers.get(date)!.add(profile.user_id);
      });

      // Convert to array and fill missing dates with 0
      const result: TimeSeriesDataPoint[] = [];
      const currentDate = new Date(startDate);
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      while (currentDate <= today) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const activeCount = dailyActiveUsers.get(dateStr)?.size || 0;
        result.push({
          date: dateStr,
          value: activeCount,
        });
        currentDate.setDate(currentDate.getDate() + 1);
      }

      return result;
    } catch (error) {
      console.error('Error getting DAU over time:', error);
      return [];
    }
  }

  /**
   * Get Monthly Active Users (MAU) over time
   */
  static async getMAUOverTime(months: number = 12): Promise<TimeSeriesDataPoint[]> {
    try {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);

      // Get all user interactions
      const { data: interactions } = await (supabase as any)
        .from('interactions')
        .select('user_id, occurred_at')
        .gte('occurred_at', startDate.toISOString());

      // Get profiles with last_active_at
      const { data: profiles } = await (supabase as any)
        .from('users')
        .select('user_id, last_active_at')
        .not('last_active_at', 'is', null)
        .gte('last_active_at', startDate.toISOString());

      // Group by month and count unique users
      const monthlyActiveUsers = new Map<string, Set<string>>();

      // Process interactions
      interactions?.forEach((interaction: any) => {
        const date = new Date(interaction.occurred_at);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyActiveUsers.has(monthKey)) {
          monthlyActiveUsers.set(monthKey, new Set());
        }
        monthlyActiveUsers.get(monthKey)!.add(interaction.user_id);
      });

      // Process profiles
      profiles?.forEach((profile: any) => {
        const date = new Date(profile.last_active_at);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyActiveUsers.has(monthKey)) {
          monthlyActiveUsers.set(monthKey, new Set());
        }
        monthlyActiveUsers.get(monthKey)!.add(profile.user_id);
      });

      // Convert to array and fill missing months with 0
      const result: TimeSeriesDataPoint[] = [];
      const currentDate = new Date(startDate);

      while (currentDate <= new Date()) {
        const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
        const activeCount = monthlyActiveUsers.get(monthKey)?.size || 0;
        result.push({
          date: monthKey,
          value: activeCount,
        });
        currentDate.setMonth(currentDate.getMonth() + 1);
      }

      return result;
    } catch (error) {
      console.error('Error getting MAU over time:', error);
      return [];
    }
  }

  /**
   * Get new users over time
   */
  static async getNewUsersOverTime(days: number = 30): Promise<TimeSeriesDataPoint[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      // Get user registrations by date
      const { data: userRegistrations } = await (supabase as any)
        .from('users')
        .select('created_at')
        .gte('created_at', startDate.toISOString());

      // Group by date
      const dailyNewUsers = new Map<string, number>();

      userRegistrations?.forEach((user: any) => {
        const date = new Date(user.created_at).toISOString().split('T')[0];
        dailyNewUsers.set(date, (dailyNewUsers.get(date) || 0) + 1);
      });

      // Convert to array and fill missing dates with 0
      const result: TimeSeriesDataPoint[] = [];
      const currentDate = new Date(startDate);
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      while (currentDate <= today) {
        const dateStr = currentDate.toISOString().split('T')[0];
        result.push({
          date: dateStr,
          value: dailyNewUsers.get(dateStr) || 0,
        });
        currentDate.setDate(currentDate.getDate() + 1);
      }

      return result;
    } catch (error) {
      console.error('Error getting new users over time:', error);
      return [];
    }
  }

  /**
   * Get important user statistics
   */
  static async getUserStats(): Promise<UserStats> {
    try {
      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Get total users
      const { count: totalUsers } = await (supabase as any)
        .from('users')
        .select('*', { count: 'exact', head: true });

      // Get verified users
      const { count: verifiedUsers } = await (supabase as any)
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('verified', true);

      // Get active users (7 days)
      const { count: activeUsers7d } = await (supabase as any)
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('last_active_at', sevenDaysAgo.toISOString());

      // Get active users (30 days)
      const { count: activeUsers30d } = await (supabase as any)
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('last_active_at', thirtyDaysAgo.toISOString());

      // Get new users (7 days)
      const { count: newUsers7d } = await (supabase as any)
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo.toISOString());

      // Get new users (30 days)
      const { count: newUsers30d } = await (supabase as any)
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString());

      // Get average account age
      const { data: allUsers } = await (supabase as any)
        .from('users')
        .select('created_at');

      const avgAccountAge = allUsers && allUsers.length > 0
        ? allUsers.reduce((sum: number, user: any) => {
            const age = (now.getTime() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24);
            return sum + age;
          }, 0) / allUsers.length
        : 0;

      // Get users with reviews
      const { data: reviews } = await (supabase as any)
        .from('reviews')
        .select('user_id')
        .eq('is_draft', false);
      
      const usersWithReviews = new Set(reviews?.map((r: any) => r.user_id) || []).size;

      // Get users with friends
      const { data: friends } = await (supabase as any)
        .from('relationships')
          .eq('related_entity_type', 'user')
          .eq('relationship_type', 'friend')
          .eq('status', 'accepted')
        .select('user_id, related_entity_id');
      
      const usersWithFriends = new Set([
        ...(friends?.map((f: any) => f.user_id) || []),
        ...(friends?.map((f: any) => f.related_entity_id) || []),
      ]).size;

      return {
        total_users: totalUsers || 0,
        verified_users: verifiedUsers || 0,
        active_users_7d: activeUsers7d || 0,
        active_users_30d: activeUsers30d || 0,
        new_users_7d: newUsers7d || 0,
        new_users_30d: newUsers30d || 0,
        avg_account_age_days: Math.round(avgAccountAge * 100) / 100,
        users_with_reviews: usersWithReviews,
        users_with_friends: usersWithFriends,
      };
    } catch (error) {
      console.error('Error getting user stats:', error);
      return {
        total_users: 0,
        verified_users: 0,
        active_users_7d: 0,
        active_users_30d: 0,
        new_users_7d: 0,
        new_users_30d: 0,
        avg_account_age_days: 0,
        users_with_reviews: 0,
        users_with_friends: 0,
      };
    }
  }

  /**
   * Get admin achievements
   */
  static async getAdminAchievements(): Promise<AdminAchievement[]> {
    try {
      const platformStats = await this.getPlatformStats();
      const contentMetrics = await this.getContentMetrics();

      const achievements: AdminAchievement[] = [
        {
          id: 'first_users',
          name: 'First Users',
          description: 'Reach 100 total users',
          icon: '👥',
          progress: Math.min(platformStats.total_users, 100),
          goal: 100,
          unlocked: platformStats.total_users >= 100,
          category: 'users',
        },
        {
          id: 'growing_platform',
          name: 'Growing Platform',
          description: 'Reach 1,000 total users',
          icon: '📈',
          progress: Math.min(platformStats.total_users, 1000),
          goal: 1000,
          unlocked: platformStats.total_users >= 1000,
          category: 'users',
        },
        {
          id: 'popular_platform',
          name: 'Popular Platform',
          description: 'Reach 10,000 total users',
          icon: '🌟',
          progress: Math.min(platformStats.total_users, 10000),
          goal: 10000,
          unlocked: platformStats.total_users >= 10000,
          category: 'users',
        },
        {
          id: 'content_creator',
          name: 'Content Creator',
          description: 'Host 100 events on the platform',
          icon: '🎪',
          progress: Math.min(contentMetrics.total_events, 100),
          goal: 100,
          unlocked: contentMetrics.total_events >= 100,
          category: 'content',
        },
        {
          id: 'event_platform',
          name: 'Event Platform',
          description: 'Host 1,000 events on the platform',
          icon: '🎭',
          progress: Math.min(contentMetrics.total_events, 1000),
          goal: 1000,
          unlocked: contentMetrics.total_events >= 1000,
          category: 'content',
        },
        {
          id: 'high_engagement',
          name: 'High Engagement',
          description: 'Achieve 10,000 total interactions',
          icon: '💬',
          progress: Math.min(platformStats.total_interactions, 10000),
          goal: 10000,
          unlocked: platformStats.total_interactions >= 10000,
          category: 'platform',
        },
        {
          id: 'viral_platform',
          name: 'Viral Platform',
          description: 'Achieve 100,000 total interactions',
          icon: '🔥',
          progress: Math.min(platformStats.total_interactions, 100000),
          goal: 100000,
          unlocked: platformStats.total_interactions >= 100000,
          category: 'platform',
        },
      ];

      return achievements;
    } catch (error) {
      console.error('Error getting admin achievements:', error);
      return [];
    }
  }

  /**
   * Get North Star Metric: Engaged Concert Intent per User (ECI/U)
   * The number of concerts a user saves, RSVP's, or shares with friends per month
   */
  static async getNorthStarMetric(): Promise<NorthStarMetric> {
    try {
      // Get current month's start date
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

      // Get concert intent interactions for current month
      // This includes: event interest (saves/RSVPs), shares, and attendance marking
      const { data: currentMonthInteractions } = await (supabase as any)
        .from('interactions')
        .select('user_id, event_type, entity_type, entity_id, metadata')
        .gte('occurred_at', startOfMonth.toISOString())
        .in('event_type', ['interest', 'share', 'attendance'])
        .eq('entity_type', 'event');

      // Get last month's interactions for growth calculation
      const { data: lastMonthInteractions } = await (supabase as any)
        .from('interactions')
        .select('user_id, event_type, entity_type, entity_id, metadata')
        .gte('occurred_at', startOfLastMonth.toISOString())
        .lt('occurred_at', endOfLastMonth.toISOString())
        .in('event_type', ['interest', 'share', 'attendance'])
        .eq('entity_type', 'event');

      // Also get event interest from user_jambase_events table (RSVPs)
      const { data: currentMonthRSVPs } = await (supabase as any)
        .from('relationships')
          .eq('related_entity_type', 'event')
          .in('relationship_type', ['interest', 'going', 'maybe'])
        .select('user_id, jambase_event_id, rsvp_status')
        .gte('created_at', startOfMonth.toISOString())
        .in('rsvp_status', ['going', 'interested']);

      const { data: lastMonthRSVPs } = await (supabase as any)
        .from('relationships')
          .eq('related_entity_type', 'event')
          .in('relationship_type', ['interest', 'going', 'maybe'])
        .select('user_id, jambase_event_id, rsvp_status')
        .gte('created_at', startOfLastMonth.toISOString())
        .lt('created_at', endOfLastMonth.toISOString())
        .in('rsvp_status', ['going', 'interested']);

      const normalizeEventId = (interaction: any): string | null => {
        return (
          interaction?.entity_id ||
          interaction?.metadata?.event_id ||
          interaction?.metadata?.eventId ||
          interaction?.metadata?.event?.id ||
          interaction?.metadata?.jambase_event_id ||
          interaction?.metadata?.jambaseEventId ||
          null
        );
      };

      const calculateMonthMetrics = (
        interactions: any[] | null | undefined,
        rsvps: any[] | null | undefined,
        includeBreakdown = false
      ) => {
        const userScores = new Map<string, number>();
        const engagedSet = new Set<string>();
        const intentKeys = new Set<string>();
        let totalIntents = 0;

        const breakdown = includeBreakdown
          ? { saves: 0, rsvps: 0, shares: 0 }
          : null;

        const registerIntent = (userId: string | null | undefined, type: string, eventId?: string | null) => {
          if (!userId) {
            return;
          }

          const normalizedType = type === 'interest' ? 'save' : type;
          const key = `${userId}:${normalizedType}:${eventId || 'unknown'}`;

          if (intentKeys.has(key)) {
            return;
          }
          intentKeys.add(key);

          engagedSet.add(userId);
          userScores.set(userId, (userScores.get(userId) || 0) + 1);
          totalIntents += 1;

          if (breakdown) {
            if (normalizedType === 'save') {
              breakdown.saves += 1;
            } else if (normalizedType === 'share') {
              breakdown.shares += 1;
            } else if (normalizedType === 'rsvp') {
              breakdown.rsvps += 1;
            }
          }
        };

        interactions?.forEach((interaction: any) => {
          const eventId = normalizeEventId(interaction);
          registerIntent(interaction.user_id, interaction.event_type, eventId);
        });

        rsvps?.forEach((rsvp: any) => {
          registerIntent(rsvp.user_id, 'rsvp', rsvp.jambase_event_id || rsvp.event_id);
        });

        return {
          userScores,
          engagedCount: engagedSet.size,
          totalIntents,
          breakdown: breakdown || { saves: 0, rsvps: 0, shares: 0 },
        };
      };

      const currentMetrics = calculateMonthMetrics(currentMonthInteractions, currentMonthRSVPs, true);
      const lastMonthMetrics = calculateMonthMetrics(lastMonthInteractions, lastMonthRSVPs, false);

      const currentEngagedCount = currentMetrics.engagedCount;
      const lastEngagedCount = lastMonthMetrics.engagedCount;

      const eciPerUser = currentEngagedCount > 0
        ? currentMetrics.totalIntents / currentEngagedCount
        : 0;

      const lastEciPerUser = lastEngagedCount > 0
        ? lastMonthMetrics.totalIntents / lastEngagedCount
        : 0;

      const monthlyGrowthRate = lastEciPerUser > 0
        ? ((eciPerUser - lastEciPerUser) / lastEciPerUser) * 100
        : 0;

      // Get top engaged users with their names
      const topEngagedUsers = Array.from(currentMetrics.userScores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([userId, score]) => ({
          user_id: userId,
          user_name: `User ${userId.slice(0, 8)}`, // Placeholder name
          eci_score: score
        }));

      // Get actual user names for top users
      if (topEngagedUsers.length > 0) {
        const userIds = topEngagedUsers.map(u => u.user_id);
        const { data: profiles } = await (supabase as any)
          .from('users')
          .select('user_id, name')
          .in('user_id', userIds);

        profiles?.forEach((profile: any) => {
          const user = topEngagedUsers.find(u => u.user_id === profile.user_id);
          if (user) {
            user.user_name = profile.name || `User ${profile.user_id.slice(0, 8)}`;
          }
        });
      }

      return {
        eci_per_user: Math.round(eciPerUser * 100) / 100,
        total_engaged_users: currentEngagedCount,
        total_concert_intents: currentMetrics.totalIntents,
        monthly_growth_rate: Math.round(monthlyGrowthRate * 100) / 100,
        breakdown: currentMetrics.breakdown,
        top_engaged_users: topEngagedUsers
      };
    } catch (error) {
      console.error('Error calculating North Star Metric:', error);
      return {
        eci_per_user: 0,
        total_engaged_users: 0,
        total_concert_intents: 0,
        monthly_growth_rate: 0,
        breakdown: { saves: 0, rsvps: 0, shares: 0 },
        top_engaged_users: []
      };
    }
  }

  /**
   * Get feature adoption funnel metrics
   */
  static async getFeatureAdoptionFunnel(): Promise<FeatureAdoptionFunnel[]> {
    try {
      const allInteractions = await AnalyticsDataService.getAllUserInteractions();
      
      // Define key features to track
      const features = [
        { name: 'Event Interest/RSVP', eventType: 'interest', entityType: 'event' },
        { name: 'Event Reviews', eventType: 'review', entityType: 'event' },
        { name: 'Event Shares', eventType: 'share', entityType: 'event' },
        { name: 'Search', eventType: 'search', entityType: 'search' },
        { name: 'Ticket Clicks', eventType: 'click_ticket', entityType: 'ticket_link' },
      ];

      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sixtyDaysAgo = new Date(now);
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const results: FeatureAdoptionFunnel[] = [];

      for (const feature of features) {
        // Discovery: first time user sees/interacts with feature
        const discoveryUsers = new Set<string>();
        // Trial: user tries the feature (1-2 uses)
        const trialUsers = new Set<string>();
        // Adoption: user uses feature regularly (3-10 uses)
        const adoptionUsers = new Set<string>();
        // Retention: user continues using feature (10+ uses, used in last 30 days)
        const retentionUsers = new Set<string>();

        const featureInteractions = allInteractions.filter((i: any) => 
          i.event_type === feature.eventType && 
          (feature.entityType === 'search' || i.entity_type === feature.entityType)
        );

        // Count uses per user
        const userUsageCount = new Map<string, number>();
        const userFirstUse = new Map<string, Date>();
        const userLastUse = new Map<string, Date>();

        featureInteractions.forEach((interaction: any) => {
          const userId = interaction.user_id;
          const occurredAt = new Date(interaction.occurred_at);
          
          userUsageCount.set(userId, (userUsageCount.get(userId) || 0) + 1);
          
          if (!userFirstUse.has(userId) || occurredAt < userFirstUse.get(userId)!) {
            userFirstUse.set(userId, occurredAt);
          }
          if (!userLastUse.has(userId) || occurredAt > userLastUse.get(userId)!) {
            userLastUse.set(userId, occurredAt);
          }
        });

        // Categorize users
        userUsageCount.forEach((count, userId) => {
          const firstUse = userFirstUse.get(userId)!;
          const lastUse = userLastUse.get(userId)!;
          
          // Discovery: anyone who used it
          discoveryUsers.add(userId);
          
          if (count >= 1 && count <= 2) {
            trialUsers.add(userId);
          } else if (count >= 3 && count <= 10) {
            adoptionUsers.add(userId);
          } else if (count > 10 && lastUse >= thirtyDaysAgo) {
            retentionUsers.add(userId);
          }
        });

        const discoveryCount = discoveryUsers.size;
        const trialCount = trialUsers.size;
        const adoptionCount = adoptionUsers.size;
        const retentionCount = retentionUsers.size;

        results.push({
          feature_name: feature.name,
          discovery_count: discoveryCount,
          trial_count: trialCount,
          adoption_count: adoptionCount,
          retention_count: retentionCount,
          discovery_to_trial_rate: discoveryCount > 0 ? (trialCount / discoveryCount) * 100 : 0,
          trial_to_adoption_rate: trialCount > 0 ? (adoptionCount / trialCount) * 100 : 0,
          adoption_to_retention_rate: adoptionCount > 0 ? (retentionCount / adoptionCount) * 100 : 0,
        });
      }

      return results;
    } catch (error) {
      console.error('Error getting feature adoption funnel:', error);
      return [];
    }
  }

  /**
   * Get session analytics
   */
  static async getSessionAnalytics(): Promise<SessionAnalytics> {
    try {
      const allInteractions = await AnalyticsDataService.getAllUserInteractions();
      
      // Group interactions by session_id
      const sessions = new Map<string, {
        startTime: Date;
        endTime: Date;
        pageViews: number;
        userId: string;
      }>();

      allInteractions.forEach((interaction: any) => {
        const sessionId = interaction.session_id || 'no-session';
        const occurredAt = new Date(interaction.occurred_at);
        
        if (!sessions.has(sessionId)) {
          sessions.set(sessionId, {
            startTime: occurredAt,
            endTime: occurredAt,
            pageViews: 0,
            userId: interaction.user_id,
          });
        }
        
        const session = sessions.get(sessionId)!;
        if (occurredAt < session.startTime) {
          session.startTime = occurredAt;
        }
        if (occurredAt > session.endTime) {
          session.endTime = occurredAt;
        }
        if (interaction.event_type === 'view') {
          session.pageViews++;
        }
      });

      // Calculate metrics
      const sessionDurations: number[] = [];
      const pagesPerSession: number[] = [];
      
      sessions.forEach((session) => {
        const duration = (session.endTime.getTime() - session.startTime.getTime()) / (1000 * 60); // minutes
        sessionDurations.push(duration);
        pagesPerSession.push(session.pageViews || 1);
      });

      const totalSessions = sessions.size;
      const avgSessionDuration = sessionDurations.length > 0
        ? sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length
        : 0;
      const avgPagesPerSession = pagesPerSession.length > 0
        ? pagesPerSession.reduce((a, b) => a + b, 0) / pagesPerSession.length
        : 0;

      // Time-bound sessions
      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const sessions7d = Array.from(sessions.values()).filter(s => s.startTime >= sevenDaysAgo).length;
      const sessions30d = Array.from(sessions.values()).filter(s => s.startTime >= thirtyDaysAgo).length;

      // Bounce rate: sessions with only 1 page view
      const bouncedSessions = Array.from(sessions.values()).filter(s => s.pageViews <= 1).length;
      const bounceRate = totalSessions > 0 ? (bouncedSessions / totalSessions) * 100 : 0;

      // Sessions by hour
      const sessionsByHour = new Map<number, number>();
      sessions.forEach((session) => {
        const hour = session.startTime.getHours();
        sessionsByHour.set(hour, (sessionsByHour.get(hour) || 0) + 1);
      });

      const sessionsByHourArray = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        session_count: sessionsByHour.get(i) || 0,
      }));

      return {
        total_sessions: totalSessions,
        avg_session_duration_minutes: Math.round(avgSessionDuration * 100) / 100,
        avg_pages_per_session: Math.round(avgPagesPerSession * 100) / 100,
        sessions_last_7d: sessions7d,
        sessions_last_30d: sessions30d,
        bounce_rate: Math.round(bounceRate * 100) / 100,
        sessions_by_hour: sessionsByHourArray,
      };
    } catch (error) {
      console.error('Error getting session analytics:', error);
      return {
        total_sessions: 0,
        avg_session_duration_minutes: 0,
        avg_pages_per_session: 0,
        sessions_last_7d: 0,
        sessions_last_30d: 0,
        bounce_rate: 0,
        sessions_by_hour: [],
      };
    }
  }

  /**
   * Get social graph metrics
   */
  static async getSocialGraphMetrics(): Promise<SocialGraphMetrics> {
    try {
      // Get all friendships (from friends table - accepted friendships)
      const { data: friendships } = await (supabase as any)
        .from('relationships')
          .eq('related_entity_type', 'user')
          .eq('relationship_type', 'friend')
          .eq('status', 'accepted')
        .select('user_id, related_entity_id, created_at');

      // Get total users
      const { count: totalUsers } = await (supabase as any)
        .from('users')
        .select('*', { count: 'exact', head: true });

      // Count connections per user
      const userConnections = new Map<string, number>();
      const usersWithConnections = new Set<string>();

      friendships?.forEach((friendship: any) => {
        userConnections.set(friendship.user_id, (userConnections.get(friendship.user_id) || 0) + 1);
        userConnections.set(friendship.related_entity_id, (userConnections.get(friendship.related_entity_id) || 0) + 1);
        usersWithConnections.add(friendship.user_id);
        usersWithConnections.add(friendship.related_entity_id);
      });

      const totalConnections = friendships?.length || 0;
      const usersWithConnectionsCount = usersWithConnections.size;
      const usersWithoutConnections = (totalUsers || 0) - usersWithConnectionsCount;

      // Average connections per user
      const totalUserConnections = Array.from(userConnections.values()).reduce((a, b) => a + b, 0);
      const avgConnectionsPerUser = usersWithConnectionsCount > 0
        ? totalUserConnections / usersWithConnectionsCount
        : 0;

      // Average connection degree (connections per connected user)
      const avgConnectionDegree = usersWithConnectionsCount > 0
        ? totalConnections / usersWithConnectionsCount
        : 0;

      // Network density: actual connections / possible connections
      // For undirected graph: n*(n-1)/2 possible connections
      const possibleConnections = usersWithConnectionsCount > 1
        ? (usersWithConnectionsCount * (usersWithConnectionsCount - 1)) / 2
        : 0;
      const networkDensity = possibleConnections > 0
        ? (totalConnections / possibleConnections) * 100
        : 0;

      // Growth rate: compare last 30 days to previous 30 days
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sixtyDaysAgo = new Date(now);
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const recentConnections = friendships?.filter((f: any) => 
        new Date(f.created_at) >= thirtyDaysAgo
      ).length || 0;
      const previousConnections = friendships?.filter((f: any) => {
        const created = new Date(f.created_at);
        return created >= sixtyDaysAgo && created < thirtyDaysAgo;
      }).length || 0;

      const connectionGrowthRate = previousConnections > 0
        ? ((recentConnections - previousConnections) / previousConnections) * 100
        : 0;

      return {
        total_connections: totalConnections,
        avg_connections_per_user: Math.round(avgConnectionsPerUser * 100) / 100,
        users_with_connections: usersWithConnectionsCount,
        users_without_connections: usersWithoutConnections,
        connection_growth_rate: Math.round(connectionGrowthRate * 100) / 100,
        avg_connection_degree: Math.round(avgConnectionDegree * 100) / 100,
        network_density: Math.round(networkDensity * 100) / 100,
      };
    } catch (error) {
      console.error('Error getting social graph metrics:', error);
      return {
        total_connections: 0,
        avg_connections_per_user: 0,
        users_with_connections: 0,
        users_without_connections: 0,
        connection_growth_rate: 0,
        avg_connection_degree: 0,
        network_density: 0,
      };
    }
  }

  /**
   * Get search effectiveness metrics
   */
  static async getSearchEffectiveness(): Promise<SearchEffectiveness> {
    try {
      const allInteractions = await AnalyticsDataService.getAllUserInteractions();
      
      // Get all searches
      const searches = allInteractions.filter((i: any) => i.event_type === 'search');
      const uniqueSearchers = new Set(searches.map((s: any) => s.user_id));

      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const searches7d = searches.filter((s: any) => new Date(s.occurred_at) >= sevenDaysAgo).length;
      const searches30d = searches.filter((s: any) => new Date(s.occurred_at) >= thirtyDaysAgo).length;

      // Track search queries and their outcomes
      const queryMap = new Map<string, {
        count: number;
        clicks: number;
        interests: number;
        searchers: Set<string>;
      }>();

      searches.forEach((search: any) => {
        const query = search.metadata?.query || search.metadata?.search_query || 'unknown';
        if (!queryMap.has(query)) {
          queryMap.set(query, {
            count: 0,
            clicks: 0,
            interests: 0,
            searchers: new Set(),
          });
        }
        const queryData = queryMap.get(query)!;
        queryData.count++;
        queryData.searchers.add(search.user_id);
      });

      // Find clicks and interests after searches (within 5 minutes)
      searches.forEach((search: any) => {
        const searchTime = new Date(search.occurred_at);
        const userId = search.user_id;
        const query = search.metadata?.query || search.metadata?.search_query || 'unknown';
        
        // Look for clicks or interests within 5 minutes
        const fiveMinutesLater = new Date(searchTime.getTime() + 5 * 60 * 1000);
        
        const relatedInteractions = allInteractions.filter((i: any) => 
          i.user_id === userId &&
          new Date(i.occurred_at) >= searchTime &&
          new Date(i.occurred_at) <= fiveMinutesLater &&
          (i.event_type === 'click' || i.event_type === 'interest')
        );

        if (relatedInteractions.length > 0) {
          const queryData = queryMap.get(query);
          if (queryData) {
            relatedInteractions.forEach((interaction: any) => {
              if (interaction.event_type === 'click') {
                queryData.clicks++;
              } else if (interaction.event_type === 'interest') {
                queryData.interests++;
              }
            });
          }
        }
      });

      // Calculate top queries
      const topQueries = Array.from(queryMap.entries())
        .map(([query, data]) => ({
          query,
          count: data.count,
          click_rate: data.count > 0 ? (data.clicks / data.count) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Search to click rate (overall)
      const totalClicksAfterSearch = Array.from(queryMap.values()).reduce((sum, data) => sum + data.clicks, 0);
      const searchToClickRate = searches.length > 0 ? (totalClicksAfterSearch / searches.length) * 100 : 0;

      // Search to interest rate (overall)
      const totalInterestsAfterSearch = Array.from(queryMap.values()).reduce((sum, data) => sum + data.interests, 0);
      const searchToInterestRate = searches.length > 0 ? (totalInterestsAfterSearch / searches.length) * 100 : 0;

      // Searches by category (based on entity_type in metadata)
      const categoryMap = new Map<string, { count: number; successes: number }>();
      searches.forEach((search: any) => {
        const category = search.metadata?.category || search.entity_type || 'general';
        if (!categoryMap.has(category)) {
          categoryMap.set(category, { count: 0, successes: 0 });
        }
        categoryMap.get(category)!.count++;
        
        // Check if this search led to a click/interest
        const searchTime = new Date(search.occurred_at);
        const fiveMinutesLater = new Date(searchTime.getTime() + 5 * 60 * 1000);
        const hadSuccess = allInteractions.some((i: any) =>
          i.user_id === search.user_id &&
          new Date(i.occurred_at) >= searchTime &&
          new Date(i.occurred_at) <= fiveMinutesLater &&
          (i.event_type === 'click' || i.event_type === 'interest')
        );
        if (hadSuccess) {
          categoryMap.get(category)!.successes++;
        }
      });

      const searchesByCategory = Array.from(categoryMap.entries())
        .map(([category, data]) => ({
          category,
          count: data.count,
          success_rate: data.count > 0 ? (data.successes / data.count) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count);

      return {
        total_searches: searches.length,
        unique_searchers: uniqueSearchers.size,
        searches_last_7d: searches7d,
        searches_last_30d: searches30d,
        search_to_click_rate: Math.round(searchToClickRate * 100) / 100,
        search_to_interest_rate: Math.round(searchToInterestRate * 100) / 100,
        top_queries: topQueries.map(q => ({
          ...q,
          click_rate: Math.round(q.click_rate * 100) / 100,
        })),
        searches_by_category: searchesByCategory.map(c => ({
          ...c,
          success_rate: Math.round(c.success_rate * 100) / 100,
        })),
      };
    } catch (error) {
      console.error('Error getting search effectiveness:', error);
      return {
        total_searches: 0,
        unique_searchers: 0,
        searches_last_7d: 0,
        searches_last_30d: 0,
        search_to_click_rate: 0,
        search_to_interest_rate: 0,
        top_queries: [],
        searches_by_category: [],
      };
    }
  }

  /**
   * Export admin analytics data
   */
  static async exportAdminData(): Promise<{
    platformStats: PlatformStats;
    userGrowth: UserGrowth[];
    engagementMetrics: EngagementMetrics;
    contentMetrics: ContentMetrics;
    activeUserMetrics: ActiveUserMetrics;
    featureUsage: FeatureUsage[];
    featureAdoptionFunnel: FeatureAdoptionFunnel[];
    sessionAnalytics: SessionAnalytics;
    socialGraphMetrics: SocialGraphMetrics;
    searchEffectiveness: SearchEffectiveness;
    userSegments: UserSegment[];
    geographicDistribution: GeographicDistribution[];
    achievements: AdminAchievement[];
    northStarMetric: NorthStarMetric;
  }> {
    const [
      platformStats,
      userGrowth,
      engagementMetrics,
      contentMetrics,
      activeUserMetrics,
      featureUsage,
      featureAdoptionFunnel,
      sessionAnalytics,
      socialGraphMetrics,
      searchEffectiveness,
      userSegments,
      geographicDistribution,
      achievements,
      northStarMetric
    ] = await Promise.all([
      this.getPlatformStats(),
      this.getUserGrowth(),
      this.getEngagementMetrics(),
      this.getContentMetrics(),
      this.getActiveUserMetrics(),
      this.getFeatureUsage(),
      this.getFeatureAdoptionFunnel(),
      this.getSessionAnalytics(),
      this.getSocialGraphMetrics(),
      this.getSearchEffectiveness(),
      this.getUserSegments(),
      this.getGeographicDistribution(),
      this.getAdminAchievements(),
      this.getNorthStarMetric(),
    ]);

    return {
      platformStats,
      userGrowth,
      engagementMetrics,
      contentMetrics,
      activeUserMetrics,
      featureUsage,
      featureAdoptionFunnel,
      sessionAnalytics,
      socialGraphMetrics,
      searchEffectiveness,
      userSegments,
      geographicDistribution,
      achievements,
      northStarMetric,
    };
  }
}
