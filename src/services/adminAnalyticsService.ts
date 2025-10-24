import { supabase } from '@/integrations/supabase/client';

export interface PlatformStats {
  total_users: number;
  total_events: number;
  total_revenue: number;
  total_interactions: number;
  active_users_today: number;
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

export interface RevenueMetrics {
  total_revenue: number;
  revenue_this_month: number;
  revenue_growth_rate: number;
  average_revenue_per_user: number;
  top_revenue_sources: Array<{
    source: string;
    revenue: number;
    percentage: number;
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

export interface SystemHealth {
  api_response_time: number;
  database_performance: number;
  error_rate: number;
  uptime_percentage: number;
  active_connections: number;
  cache_hit_rate: number;
}

export interface UserSegment {
  segment: string;
  count: number;
  percentage: number;
  avg_sessions: number;
  avg_revenue: number;
  retention_rate: number;
}

export interface GeographicDistribution {
  country: string;
  users: number;
  events: number;
  revenue: number;
  growth_rate: number;
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
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Get event counts
      const { count: totalEvents } = await (supabase as any)
        .from('jambase_events')
        .select('*', { count: 'exact', head: true });

      // Get interaction counts
      const { count: totalInteractions } = await (supabase as any)
        .from('user_interactions')
        .select('*', { count: 'exact', head: true });

      // Get ticket clicks for revenue estimation
      const { data: ticketClicks } = await (supabase as any)
        .from('user_interactions')
        .select('*')
        .eq('event_type', 'click_ticket');

      // Revenue calculation - only count actual revenue if we have real data
      const totalRevenue = 0;

      // Get today's active users (users with interactions today)
      const today = new Date().toISOString().split('T')[0];
      const { count: activeUsersToday } = await (supabase as any)
        .from('user_interactions')
        .select('user_id', { count: 'exact', head: true })
        .gte('created_at', `${today}T00:00:00Z`)
        .lt('created_at', `${today}T23:59:59Z`);

      // Get this month's new users
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      const { count: newUsersThisMonth } = await (supabase as any)
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfMonth.toISOString());

      // Calculate growth rate (placeholder - would need historical data)
      const platformGrowthRate = 0; // TODO: Implement with historical data
      const averageSessionDuration = 0; // TODO: Implement session tracking

      return {
        total_users: totalUsers || 0,
        total_events: totalEvents || 0,
        total_revenue: totalRevenue,
        total_interactions: totalInteractions || 0,
        active_users_today: activeUsersToday || 0,
        new_users_this_month: newUsersThisMonth || 0,
        platform_growth_rate: platformGrowthRate,
        average_session_duration: averageSessionDuration,
      };
    } catch (error) {
      console.error('Error getting platform stats:', error);
      return {
        total_users: 0,
        total_events: 0,
        total_revenue: 0,
        total_interactions: 0,
        active_users_today: 0,
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
        .from('profiles')
        .select('created_at')
        .gte('created_at', startDate.toISOString());

      // Get daily active users
      const { data: dailyActiveUsers } = await (supabase as any)
        .from('user_interactions')
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
        .from('user_interactions')
        .select('*');

      // Categorize interactions
      const pageViews = interactions?.filter((i: any) => i.event_type === 'view').length || 0;
      const searches = interactions?.filter((i: any) => i.event_type === 'search').length || 0;
      const ticketClicks = interactions?.filter((i: any) => i.event_type === 'click_ticket').length || 0;

      // Get reviews count
      const { count: reviewsWritten } = await (supabase as any)
        .from('user_reviews')
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
   * Get revenue metrics
   */
  static async getRevenueMetrics(): Promise<RevenueMetrics> {
    try {
      // Get ticket clicks for revenue calculation
      const { data: ticketClicks } = await (supabase as any)
        .from('user_interactions')
        .select('*')
        .eq('event_type', 'click_ticket');

      // Get this month's ticket clicks
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      const { data: thisMonthClicks } = await (supabase as any)
        .from('user_interactions')
        .select('*')
        .eq('event_type', 'click_ticket')
        .gte('created_at', startOfMonth.toISOString());

      // Revenue calculation - only count actual revenue if we have real data
      const totalRevenue = 0;
      const revenueThisMonth = 0;

      // Get total users for average calculation
      const { count: totalUsers } = await (supabase as any)
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      const averageRevenuePerUser = totalUsers > 0 ? totalRevenue / totalUsers : 0;

      // Calculate growth rate (placeholder)
      const revenueGrowthRate = 0; // TODO: Implement with historical data

      // Top revenue sources - empty until we have actual revenue data
      const topRevenueSources: any[] = [];

      return {
        total_revenue: totalRevenue,
        revenue_this_month: revenueThisMonth,
        revenue_growth_rate: revenueGrowthRate,
        average_revenue_per_user: Math.round(averageRevenuePerUser * 100) / 100,
        top_revenue_sources: topRevenueSources,
      };
    } catch (error) {
      console.error('Error getting revenue metrics:', error);
      return {
        total_revenue: 0,
        revenue_this_month: 0,
        revenue_growth_rate: 0,
        average_revenue_per_user: 0,
        top_revenue_sources: [],
      };
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
        (supabase as any).from('jambase_events').select('*', { count: 'exact', head: true }),
        (supabase as any).from('artists').select('*', { count: 'exact', head: true }),
        (supabase as any).from('venues').select('*', { count: 'exact', head: true }),
        (supabase as any).from('user_reviews').select('*', { count: 'exact', head: true }),
      ]);

      // Get this month's events
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      const { count: eventsThisMonth } = await (supabase as any)
        .from('jambase_events')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfMonth.toISOString());

      // Get average rating
      const { data: reviews } = await (supabase as any)
        .from('user_reviews')
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
   * Get system health metrics (placeholder - would integrate with monitoring tools)
   */
  static async getSystemHealth(): Promise<SystemHealth> {
    try {
      // These would typically come from monitoring tools like DataDog, New Relic, etc.
      // For now, return placeholder values
      return {
        api_response_time: 150, // ms
        database_performance: 95, // percentage
        error_rate: 0.1, // percentage
        uptime_percentage: 99.9, // percentage
        active_connections: 1250,
        cache_hit_rate: 87.5, // percentage
      };
    } catch (error) {
      console.error('Error getting system health:', error);
      return {
        api_response_time: 0,
        database_performance: 0,
        error_rate: 100,
        uptime_percentage: 0,
        active_connections: 0,
        cache_hit_rate: 0,
      };
    }
  }

  /**
   * Get user segmentation
   */
  static async getUserSegments(): Promise<UserSegment[]> {
    try {
      // Get all users with their activity
      const { data: users } = await (supabase as any)
        .from('profiles')
        .select('user_id, created_at');

      // Get user interactions for segmentation
      const { data: interactions } = await (supabase as any)
        .from('user_interactions')
        .select('user_id, created_at');

      // Get user revenue (ticket clicks)
      const { data: ticketClicks } = await (supabase as any)
        .from('user_interactions')
        .select('user_id')
        .eq('event_type', 'click_ticket');

      // Segment users based on activity
      const userActivity = new Map<string, {
        sessions: number;
        revenue: number;
        daysActive: Set<string>;
      }>();

      interactions?.forEach((interaction: any) => {
        const userId = interaction.user_id;
        if (!userActivity.has(userId)) {
          userActivity.set(userId, {
            sessions: 0,
            revenue: 0,
            daysActive: new Set(),
          });
        }
        const activity = userActivity.get(userId)!;
        activity.sessions++;
        activity.daysActive.add(new Date(interaction.created_at).toISOString().split('T')[0]);
      });

      ticketClicks?.forEach((click: any) => {
        const userId = click.user_id;
        if (userActivity.has(userId)) {
          // Revenue calculation - only count actual revenue if we have real data
          userActivity.get(userId)!.revenue += 0;
        }
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

        const avgRevenue = count > 0 
          ? segmentUsers.reduce((sum, [_, activity]) => sum + activity.revenue, 0) / count 
          : 0;

        const retentionRate = count > 0 
          ? segmentUsers.reduce((sum, [_, activity]) => sum + activity.daysActive.size, 0) / count / 30 * 100 
          : 0;

        return {
          segment: segmentName,
          count,
          percentage: Math.round(percentage * 100) / 100,
          avg_sessions: Math.round(avgSessions * 100) / 100,
          avg_revenue: Math.round(avgRevenue * 100) / 100,
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
   * Get geographic distribution
   */
  static async getGeographicDistribution(): Promise<GeographicDistribution[]> {
    try {
      // This would typically use IP geolocation or user-provided location data
      // Return empty array until we have actual geographic data
      return [];
    } catch (error) {
      console.error('Error getting geographic distribution:', error);
      return [];
    }
  }

  /**
   * Get admin achievements
   */
  static async getAdminAchievements(): Promise<AdminAchievement[]> {
    try {
      const platformStats = await this.getPlatformStats();
      const contentMetrics = await this.getContentMetrics();
      const revenueMetrics = await this.getRevenueMetrics();

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
          id: 'first_revenue',
          name: 'First Revenue',
          description: 'Generate $1,000 in platform revenue',
          icon: '💰',
          progress: Math.min(revenueMetrics.total_revenue, 1000),
          goal: 1000,
          unlocked: revenueMetrics.total_revenue >= 1000,
          category: 'revenue',
        },
        {
          id: 'revenue_generator',
          name: 'Revenue Generator',
          description: 'Generate $10,000 in platform revenue',
          icon: '💎',
          progress: Math.min(revenueMetrics.total_revenue, 10000),
          goal: 10000,
          unlocked: revenueMetrics.total_revenue >= 10000,
          category: 'revenue',
        },
        {
          id: 'successful_platform',
          name: 'Successful Platform',
          description: 'Generate $100,000 in platform revenue',
          icon: '🏆',
          progress: Math.min(revenueMetrics.total_revenue, 100000),
          goal: 100000,
          unlocked: revenueMetrics.total_revenue >= 100000,
          category: 'revenue',
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

      // Get all users for total count
      const { count: totalUsers } = await (supabase as any)
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Get concert intent interactions for current month
      // This includes: event interest (saves/RSVPs), shares, and attendance marking
      const { data: currentMonthInteractions } = await (supabase as any)
        .from('user_interactions')
        .select('user_id, event_type, entity_type, metadata')
        .gte('occurred_at', startOfMonth.toISOString())
        .in('event_type', ['interest', 'share', 'attendance'])
        .eq('entity_type', 'event');

      // Get last month's interactions for growth calculation
      const { data: lastMonthInteractions } = await (supabase as any)
        .from('user_interactions')
        .select('user_id, event_type, entity_type, metadata')
        .gte('occurred_at', startOfLastMonth.toISOString())
        .lt('occurred_at', endOfLastMonth.toISOString())
        .in('event_type', ['interest', 'share', 'attendance'])
        .eq('entity_type', 'event');

      // Also get event interest from user_jambase_events table (RSVPs)
      const { data: currentMonthRSVPs } = await (supabase as any)
        .from('user_jambase_events')
        .select('user_id, rsvp_status')
        .gte('created_at', startOfMonth.toISOString())
        .in('rsvp_status', ['going', 'interested']);

      const { data: lastMonthRSVPs } = await (supabase as any)
        .from('user_jambase_events')
        .select('user_id, rsvp_status')
        .gte('created_at', startOfLastMonth.toISOString())
        .lt('created_at', endOfLastMonth.toISOString())
        .in('rsvp_status', ['going', 'interested']);

      // Calculate ECI per user
      const userECIScores = new Map<string, number>();
      const engagedUsers = new Set<string>();
      let totalConcertIntents = 0;

      // Count interactions from user_interactions table
      currentMonthInteractions?.forEach((interaction: any) => {
        const userId = interaction.user_id;
        if (!userECIScores.has(userId)) {
          userECIScores.set(userId, 0);
        }
        userECIScores.set(userId, userECIScores.get(userId)! + 1);
        engagedUsers.add(userId);
        totalConcertIntents++;
      });

      // Count RSVPs from user_jambase_events table
      currentMonthRSVPs?.forEach((rsvp: any) => {
        const userId = rsvp.user_id;
        if (!userECIScores.has(userId)) {
          userECIScores.set(userId, 0);
        }
        userECIScores.set(userId, userECIScores.get(userId)! + 1);
        engagedUsers.add(userId);
        totalConcertIntents++;
      });

      // Calculate breakdown by interaction type
      const breakdown = {
        saves: 0,
        rsvps: 0,
        shares: 0
      };

      // Count saves (interest events)
      const saves = currentMonthInteractions?.filter((i: any) => i.event_type === 'interest').length || 0;
      breakdown.saves = saves;

      // Count RSVPs
      const rsvps = currentMonthRSVPs?.length || 0;
      breakdown.rsvps = rsvps;

      // Count shares
      const shares = currentMonthInteractions?.filter((i: any) => i.event_type === 'share').length || 0;
      breakdown.shares = shares;

      // Calculate average ECI per user
      const eciPerUser = totalUsers > 0 ? totalConcertIntents / totalUsers : 0;

      // Calculate growth rate
      const lastMonthTotal = (lastMonthInteractions?.length || 0) + (lastMonthRSVPs?.length || 0);
      const monthlyGrowthRate = lastMonthTotal > 0 
        ? ((totalConcertIntents - lastMonthTotal) / lastMonthTotal) * 100 
        : 0;

      // Get top engaged users with their names
      const topEngagedUsers = Array.from(userECIScores.entries())
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
          .from('profiles')
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
        total_engaged_users: engagedUsers.size,
        total_concert_intents: totalConcertIntents,
        monthly_growth_rate: Math.round(monthlyGrowthRate * 100) / 100,
        breakdown,
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
   * Export admin analytics data
   */
  static async exportAdminData(): Promise<{
    platformStats: PlatformStats;
    userGrowth: UserGrowth[];
    engagementMetrics: EngagementMetrics;
    revenueMetrics: RevenueMetrics;
    contentMetrics: ContentMetrics;
    systemHealth: SystemHealth;
    userSegments: UserSegment[];
    geographicDistribution: GeographicDistribution[];
    achievements: AdminAchievement[];
    northStarMetric: NorthStarMetric;
  }> {
    const [
      platformStats,
      userGrowth,
      engagementMetrics,
      revenueMetrics,
      contentMetrics,
      systemHealth,
      userSegments,
      geographicDistribution,
      achievements,
      northStarMetric
    ] = await Promise.all([
      this.getPlatformStats(),
      this.getUserGrowth(),
      this.getEngagementMetrics(),
      this.getRevenueMetrics(),
      this.getContentMetrics(),
      this.getSystemHealth(),
      this.getUserSegments(),
      this.getGeographicDistribution(),
      this.getAdminAchievements(),
      this.getNorthStarMetric(),
    ]);

    return {
      platformStats,
      userGrowth,
      engagementMetrics,
      revenueMetrics,
      contentMetrics,
      systemHealth,
      userSegments,
      geographicDistribution,
      achievements,
      northStarMetric,
    };
  }
}
