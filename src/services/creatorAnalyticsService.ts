import { supabase } from '@/integrations/supabase/client';
import { AnalyticsDataService } from './analyticsDataService';

export interface CreatorStats {
  total_followers: number;
  engagement_rate: number;
  total_event_views: number;
  total_reviews: number;
  profile_visits: number;
  ticket_clicks: number;
  fan_growth_rate: number;
  top_venue_performance: number;
}

export interface FanInsight {
  venue_name: string;
  event_count: number;
  total_views: number;
  engagement_score: number;
  fan_density: number;
}

export interface GeographicInsight {
  city: string;
  state: string;
  fan_count: number;
  event_count: number;
  engagement_rate: number;
}

export interface ContentPerformance {
  date: string;
  event_views: number;
  profile_visits: number;
  follower_gains: number;
  engagement_rate: number;
}

export interface CreatorAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  progress: number;
  goal: number;
  unlocked: boolean;
  unlockedAt?: string;
  category: 'follower' | 'engagement' | 'venue' | 'revenue';
}

export class CreatorAnalyticsService {
  /**
   * Get comprehensive creator stats
   */
  static async getCreatorStats(creatorId: string): Promise<CreatorStats> {
    try {
      // Get follower count from artist_follows table (3NF compliant)
      const { count: followerCount } = await supabase
        .from('artist_follows')
        .select('*', { count: 'exact', head: true })
        .eq('artist_id', creatorId);

      // Get events created or claimed by this creator
      console.log('🔍 CreatorAnalyticsService: Searching for events with creatorId:', creatorId);
      
      const { data: creatorEvents, error: eventsError } = await supabase
        .from('events')
        .select('id, title, artist_name, venue_name, event_date, created_by_user_id')
        .eq('created_by_user_id', creatorId);

      if (eventsError) {
        console.error('❌ CreatorAnalyticsService: Error fetching events:', eventsError);
      }

      console.log('🔍 CreatorAnalyticsService: Found events for creator', creatorId, ':', creatorEvents?.length || 0);
      if (creatorEvents && creatorEvents.length > 0) {
        console.log('📊 CreatorAnalyticsService: Event details:', creatorEvents.map(e => ({
          id: e.id,
          title: e.title,
          created_by: e.created_by_user_id
        })));
      } else {
        console.log('⚠️ CreatorAnalyticsService: No events found. Let me check all events in database...');
        
        // Debug: Check all events to see what's in the database
        const { data: allEvents, error: allEventsError } = await supabase
          .from('events')
          .select('id, title, artist_name, created_by_user_id')
          .limit(10);
        
        if (allEventsError) {
          console.error('❌ CreatorAnalyticsService: Error fetching all events:', allEventsError);
        } else {
          console.log('📊 CreatorAnalyticsService: Sample events in database:', allEvents?.map(e => ({
            id: e.id,
            title: e.title,
            created_by: e.created_by_user_id
          })));
        }
      }

      if (!creatorEvents || creatorEvents.length === 0) {
        console.log('⚠️ CreatorAnalyticsService: No events found for creator', creatorId);
        return {
          total_followers: followerCount || 0,
          engagement_rate: 0,
          total_event_views: 0,
          total_reviews: 0,
          profile_visits: 0,
          ticket_clicks: 0,
          fan_growth_rate: 0,
          top_venue_performance: 0,
        };
      }

      // Get event views and interactions for creator's events (all users)
      const eventIds = creatorEvents.map((e: any) => e.id);
      const interactions = await AnalyticsDataService.getAllUserInteractions(
        eventIds,
        undefined,
        ['event']
      );

      console.log('🔍 CreatorAnalyticsService: Found interactions for events:', interactions?.length || 0);
      if (interactions && interactions.length > 0) {
        console.log('📊 CreatorAnalyticsService: Interaction details:', interactions.map(i => ({
          event_type: i.event_type,
          entity_id: i.entity_id,
          user_id: i.user_id
        })));
      }

      // Get reviews for this creator's events
      const { data: reviews } = await supabase
        .from('reviews')
        .select(`
          *,
          event:events!inner(id, artist_name)
        `)
        .in('event_id', eventIds);

      console.log('🔍 CreatorAnalyticsService: Found reviews for events:', reviews?.length || 0);

      // Calculate metrics
      const totalFollowers = followerCount || 0;
      const totalEventViews = interactions?.filter((i: any) => i.event_type === 'view').length || 0;
      const totalReviews = reviews?.length || 0;
      const profileVisits = interactions?.filter((i: any) => i.event_type === 'profile_visit').length || 0;
      const ticketClicks = interactions?.filter((i: any) => i.event_type === 'click_ticket').length || 0;

      // Calculate engagement rate (interactions per follower)
      const totalInteractions = totalEventViews + profileVisits + ticketClicks;
      const engagementRate = totalFollowers > 0 ? (totalInteractions / totalFollowers) * 100 : 0;

      // Calculate fan growth rate (placeholder - would need historical data)
      const fanGrowthRate = 0; // TODO: Implement with historical data

      // Calculate top venue performance (placeholder)
      const topVenuePerformance = 0; // TODO: Implement venue analysis

      const stats = {
        total_followers: totalFollowers,
        engagement_rate: Math.round(engagementRate * 100) / 100,
        total_event_views: totalEventViews,
        total_reviews: totalReviews,
        profile_visits: profileVisits,
        ticket_clicks: ticketClicks,
        fan_growth_rate: fanGrowthRate,
        top_venue_performance: topVenuePerformance,
      };

      console.log('📊 CreatorAnalyticsService: Final stats for creator', creatorId, ':', stats);
      return stats;
    } catch (error) {
      console.error('Error getting creator stats:', error);
      return {
        total_followers: 0,
        engagement_rate: 0,
        total_event_views: 0,
        total_reviews: 0,
        profile_visits: 0,
        ticket_clicks: 0,
        fan_growth_rate: 0,
        top_venue_performance: 0,
      };
    }
  }

  /**
   * Get fan insights by venue
   */
  static async getFanInsights(creatorId: string): Promise<FanInsight[]> {
    try {
      // Get events created by this creator
      const { data: events } = await supabase
        .from('events')
        .select('*')
        .eq('created_by_user_id', creatorId);

      if (!events || events.length === 0) {
        return [];
      }

      // Get interactions for these events (all users)
      const eventIds = events.map((e: any) => e.id);
      const interactions = await AnalyticsDataService.getAllUserInteractions(
        eventIds,
        undefined,
        ['event']
      );

      // Group by venue and calculate metrics
      const venueStats = new Map<string, {
        eventCount: number;
        totalViews: number;
        interactions: any[];
      }>();

      events.forEach((event: any) => {
        const venueName = event.venue_name;
        if (!venueStats.has(venueName)) {
          venueStats.set(venueName, {
            eventCount: 0,
            totalViews: 0,
            interactions: [],
          });
        }
        venueStats.get(venueName)!.eventCount++;
      });

      interactions?.forEach((interaction: any) => {
        const event = events.find((e: any) => e.id === interaction.entity_id);
        if (event) {
          const venueName = event.venue_name;
          const stats = venueStats.get(venueName);
          if (stats) {
            stats.interactions.push(interaction);
            if (interaction.event_type === 'view') {
              stats.totalViews++;
            }
          }
        }
      });

      // Convert to FanInsight format
      const insights: FanInsight[] = Array.from(venueStats.entries()).map(([venueName, stats]) => {
        const engagementScore = stats.eventCount > 0 ? (stats.totalViews / stats.eventCount) : 0;
        const fanDensity = stats.interactions.length > 0 ? stats.interactions.length / stats.eventCount : 0;

        return {
          venue_name: venueName,
          event_count: stats.eventCount,
          total_views: stats.totalViews,
          engagement_score: Math.round(engagementScore * 100) / 100,
          fan_density: Math.round(fanDensity * 100) / 100,
        };
      });

      // Sort by engagement score
      return insights.sort((a, b) => b.engagement_score - a.engagement_score);
    } catch (error) {
      console.error('Error getting fan insights:', error);
      return [];
    }
  }

  /**
   * Get geographic insights
   */
  static async getGeographicInsights(creatorId: string): Promise<GeographicInsight[]> {
    try {
      // Get events created by this creator
      const { data: events } = await supabase
        .from('events')
        .select('*')
        .eq('created_by_user_id', creatorId);

      if (!events || events.length === 0) {
        return [];
      }

      // Get interactions for these events (all users)
      const eventIds = events.map((e: any) => e.id);
      const interactions = await AnalyticsDataService.getAllUserInteractions(
        eventIds,
        undefined,
        ['event']
      );

      // Group by location
      const locationStats = new Map<string, {
        eventCount: number;
        fanCount: number;
        interactions: any[];
      }>();

      events.forEach((event: any) => {
        const location = `${event.venue_city || 'Unknown'}, ${event.venue_state || 'Unknown'}`;
        if (!locationStats.has(location)) {
          locationStats.set(location, {
            eventCount: 0,
            fanCount: 0,
            interactions: [],
          });
        }
        locationStats.get(location)!.eventCount++;
      });

      interactions?.forEach((interaction: any) => {
        const event = events.find((e: any) => e.id === interaction.entity_id);
        if (event) {
          const location = `${event.venue_city || 'Unknown'}, ${event.venue_state || 'Unknown'}`;
          const stats = locationStats.get(location);
          if (stats) {
            stats.interactions.push(interaction);
            // Count unique users as fans
            if (!stats.interactions.some((i: any) => i.user_id === interaction.user_id)) {
              stats.fanCount++;
            }
          }
        }
      });

      // Convert to GeographicInsight format
      const insights: GeographicInsight[] = Array.from(locationStats.entries()).map(([location, stats]) => {
        const [city, state] = location.split(', ');
        const engagementRate = stats.fanCount > 0 ? (stats.interactions.length / stats.fanCount) * 100 : 0;

        return {
          city: city.trim(),
          state: state.trim(),
          fan_count: stats.fanCount,
          event_count: stats.eventCount,
          engagement_rate: Math.round(engagementRate * 100) / 100,
        };
      });

      // Sort by fan count
      return insights.sort((a, b) => b.fan_count - a.fan_count);
    } catch (error) {
      console.error('Error getting geographic insights:', error);
      return [];
    }
  }

  /**
   * Get content performance over time
   */
  static async getContentPerformance(creatorId: string, days: number = 30): Promise<ContentPerformance[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get events created by this creator
      const { data: events } = await supabase
        .from('events')
        .select('id')
        .eq('created_by_user_id', creatorId);

      if (!events || events.length === 0) {
        return [];
      }

      // Get interactions for this creator's events
      const eventIds = events.map((e: any) => e.id);
      const { data: interactions } = await (supabase as any)
        .from('interactions')
        .select('*')
        .eq('entity_type', 'event')
        .in('entity_id', eventIds)
        .gte('occurred_at', startDate.toISOString());

      // Group by date
      const dailyStats = new Map<string, {
        eventViews: number;
        profileVisits: number;
        followerGains: number;
        interactions: any[];
      }>();

      interactions?.forEach((interaction: any) => {
        const date = new Date(interaction.created_at).toISOString().split('T')[0];
        if (!dailyStats.has(date)) {
          dailyStats.set(date, {
            eventViews: 0,
            profileVisits: 0,
            followerGains: 0,
            interactions: [],
          });
        }
        const stats = dailyStats.get(date)!;
        stats.interactions.push(interaction);

        if (interaction.event_type === 'view') {
          stats.eventViews++;
        } else if (interaction.event_type === 'profile_visit') {
          stats.profileVisits++;
        }
        // TODO: Implement follower gains tracking
      });

      // Convert to ContentPerformance format
      const performance: ContentPerformance[] = Array.from(dailyStats.entries()).map(([date, stats]) => {
        const engagementRate = stats.interactions.length > 0 ? (stats.interactions.length / 10) * 100 : 0; // Placeholder calculation

        return {
          date,
          event_views: stats.eventViews,
          profile_visits: stats.profileVisits,
          follower_gains: stats.followerGains,
          engagement_rate: Math.round(engagementRate * 100) / 100,
        };
      });

      // Sort by date
      return performance.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } catch (error) {
      console.error('Error getting content performance:', error);
      return [];
    }
  }

  /**
   * Get creator achievements
   */
  static async getCreatorAchievements(creatorId: string): Promise<CreatorAchievement[]> {
    try {
      const stats = await this.getCreatorStats(creatorId);
      const fanInsights = await this.getFanInsights(creatorId);

      const achievements: CreatorAchievement[] = [
        {
          id: 'first_follower',
          name: 'First Fan',
          description: 'Get your first follower',
          icon: '👥',
          progress: Math.min(stats.total_followers, 1),
          goal: 1,
          unlocked: stats.total_followers >= 1,
          category: 'follower',
        },
        {
          id: 'growing_audience',
          name: 'Growing Audience',
          description: 'Reach 100 followers',
          icon: '📈',
          progress: Math.min(stats.total_followers, 100),
          goal: 100,
          unlocked: stats.total_followers >= 100,
          category: 'follower',
        },
        {
          id: 'popular_creator',
          name: 'Popular Creator',
          description: 'Reach 1,000 followers',
          icon: '🌟',
          progress: Math.min(stats.total_followers, 1000),
          goal: 1000,
          unlocked: stats.total_followers >= 1000,
          category: 'follower',
        },
        {
          id: 'engaging_content',
          name: 'Engaging Content',
          description: 'Achieve 10% engagement rate',
          icon: '💬',
          progress: Math.min(stats.engagement_rate, 10),
          goal: 10,
          unlocked: stats.engagement_rate >= 10,
          category: 'engagement',
        },
        {
          id: 'highly_engaging',
          name: 'Highly Engaging',
          description: 'Achieve 25% engagement rate',
          icon: '🔥',
          progress: Math.min(stats.engagement_rate, 25),
          goal: 25,
          unlocked: stats.engagement_rate >= 25,
          category: 'engagement',
        },
        {
          id: 'venue_favorite',
          name: 'Venue Favorite',
          description: 'Perform at 5 different venues',
          icon: '🎭',
          progress: Math.min(fanInsights.length, 5),
          goal: 5,
          unlocked: fanInsights.length >= 5,
          category: 'venue',
        },
        {
          id: 'touring_artist',
          name: 'Touring Artist',
          description: 'Perform at 10 different venues',
          icon: '🚌',
          progress: Math.min(fanInsights.length, 10),
          goal: 10,
          unlocked: fanInsights.length >= 10,
          category: 'venue',
        },
        {
          id: 'reviewed_performer',
          name: 'Reviewed Performer',
          description: 'Get 10 reviews from fans',
          icon: '⭐',
          progress: Math.min(stats.total_reviews, 10),
          goal: 10,
          unlocked: stats.total_reviews >= 10,
          category: 'engagement',
        },
        {
          id: 'fan_favorite',
          name: 'Fan Favorite',
          description: 'Get 50 reviews from fans',
          icon: '🏆',
          progress: Math.min(stats.total_reviews, 50),
          goal: 50,
          unlocked: stats.total_reviews >= 50,
          category: 'engagement',
        },
        {
          id: 'ticket_seller',
          name: 'Ticket Seller',
          description: 'Generate 100 ticket clicks',
          icon: '🎫',
          progress: Math.min(stats.ticket_clicks, 100),
          goal: 100,
          unlocked: stats.ticket_clicks >= 100,
          category: 'revenue',
        },
      ];

      return achievements;
    } catch (error) {
      console.error('Error getting creator achievements:', error);
      return [];
    }
  }

  /**
   * Export creator analytics data
   */
  static async exportCreatorData(creatorId: string): Promise<{
    stats: CreatorStats;
    fanInsights: FanInsight[];
    geographicInsights: GeographicInsight[];
    contentPerformance: ContentPerformance[];
    achievements: CreatorAchievement[];
  }> {
    const [stats, fanInsights, geographicInsights, contentPerformance, achievements] = await Promise.all([
      this.getCreatorStats(creatorId),
      this.getFanInsights(creatorId),
      this.getGeographicInsights(creatorId),
      this.getContentPerformance(creatorId),
      this.getCreatorAchievements(creatorId),
    ]);

    return {
      stats,
      fanInsights,
      geographicInsights,
      contentPerformance,
      achievements,
    };
  }
}
