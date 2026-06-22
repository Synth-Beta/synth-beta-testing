import { supabase } from '@/integrations/supabase/client';
import { AnalyticsErrorHandler } from './analyticsErrorHandler';
import { AnalyticsDataService } from './analyticsDataService';

export interface BusinessStats {
  total_events: number;
  total_attendees: number;
  total_revenue: number;
  conversion_rate: number;
  customer_satisfaction: number;
  repeat_customer_rate: number;
  avg_event_attendance: number;
  revenue_growth_rate: number;
}

export interface EventPerformance {
  event_id: string;
  title: string;
  artist_name: string;
  event_date: string;
  venue_name: string;
  total_views: number;
  total_interested: number;
  ticket_clicks: number;
  reviews_count: number;
  avg_rating: number;
  revenue_generated: number;
  attendance_rate: number;
}

export interface CustomerInsight {
  customer_segment: string;
  count: number;
  percentage: number;
  avg_events_attended: number;
  avg_spending: number;
  loyalty_score: number;
}

export interface RevenueInsight {
  date: string;
  revenue: number;
  ticket_clicks: number;
  conversion_rate: number;
  avg_ticket_price: number;
}

export interface ArtistPerformance {
  artist_name: string;
  events_count: number;
  total_views: number;
  avg_rating: number;
  total_revenue: number;
  customer_satisfaction: number;
  repeat_rate: number;
}

export interface BusinessAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  progress: number;
  goal: number;
  unlocked: boolean;
  unlockedAt?: string;
  category: 'revenue' | 'events' | 'customers' | 'growth';
}

export class BusinessAnalyticsService {
  /**
   * Get comprehensive business stats
   */
  static async getBusinessStats(userId: string): Promise<BusinessStats> {
    try {
      console.log('🔍 BusinessAnalyticsService: Getting business stats for user:', userId);

      // Get events created by this user
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('created_by_user_id', userId)
        .eq('event_status', 'published');

      if (eventsError) {
        console.error('Error fetching business events:', eventsError);
        throw eventsError;
      }

      console.log('🔍 BusinessAnalyticsService: Found events:', events?.length || 0);

      if (!events || events.length === 0) {
        console.log('🔍 BusinessAnalyticsService: No events found, returning default stats');
        return {
          total_events: 0,
          total_attendees: 0,
          total_revenue: 0,
          conversion_rate: 0,
          customer_satisfaction: 0,
          repeat_customer_rate: 0,
          avg_event_attendance: 0,
          revenue_growth_rate: 0,
        };
      }

      const eventIds = events.map((e: any) => e.id);

      // Get interactions for these events (all users)
      const interactions = await AnalyticsDataService.getAllUserInteractions(
        eventIds,
        undefined,
        ['event']
      );

      // Get reviews for these events (all users)
      const reviews = await AnalyticsDataService.getAllUserReviews(eventIds);

      // Get interested users (all users)
      const interestedUsers = await AnalyticsDataService.getAllInterestedUsers(eventIds);

      // Calculate metrics
      const totalEvents = events.length;
      const totalViews = interactions?.filter((i: any) => i.event_type === 'view').length || 0;
      const ticketClicks = interactions?.filter((i: any) => i.event_type === 'click_ticket').length || 0;
      const totalReviews = reviews?.length || 0;
      const totalInterested = interestedUsers?.length || 0;

      // Calculate conversion rate (ticket clicks / views)
      const conversionRate = totalViews > 0 ? (ticketClicks / totalViews) * 100 : 0;

      // Calculate customer satisfaction (average rating from reviews)
      const avgRating = reviews?.length > 0 
        ? reviews.reduce((sum: number, review: any) => sum + (review.rating || 0), 0) / reviews.length 
        : 0;

      // Calculate repeat customer rate (users who attended multiple events)
      const uniqueUsers = new Set(interestedUsers?.map((u: any) => u.user_id) || []);
      const repeatCustomers = Array.from(uniqueUsers).filter((userId: any) => 
        interestedUsers?.filter((u: any) => u.user_id === userId).length > 1
      ).length;
      const repeatCustomerRate = uniqueUsers.size > 0 ? (repeatCustomers / uniqueUsers.size) * 100 : 0;

      // Calculate average event attendance
      const avgEventAttendance = totalEvents > 0 ? totalInterested / totalEvents : 0;

      // Revenue calculation - only count actual revenue if we have real data
      // For now, return 0 until we have actual revenue tracking
      const totalRevenue = 0;

      return {
        total_events: totalEvents,
        total_attendees: totalInterested,
        total_revenue: totalRevenue,
        conversion_rate: Math.round(conversionRate * 100) / 100,
        customer_satisfaction: Math.round(avgRating * 100) / 100,
        repeat_customer_rate: Math.round(repeatCustomerRate * 100) / 100,
        avg_event_attendance: Math.round(avgEventAttendance * 100) / 100,
        revenue_growth_rate: 0, // TODO: Implement with historical data
      };
    } catch (error) {
      console.error('Error getting business stats:', error);
      return {
        total_events: 0,
        total_attendees: 0,
        total_revenue: 0,
        conversion_rate: 0,
        customer_satisfaction: 0,
        repeat_customer_rate: 0,
        avg_event_attendance: 0,
        revenue_growth_rate: 0,
      };
    }
  }

  /**
   * Get event performance analytics
   */
  static async getEventPerformance(userId: string): Promise<EventPerformance[]> {
    try {
      console.log('🔍 BusinessAnalyticsService: Getting event performance for user:', userId);

      // Get events created by this user
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('created_by_user_id', userId)
        .eq('event_status', 'published');

      if (eventsError) {
        console.error('Error fetching business events for performance:', eventsError);
        throw eventsError;
      }

      console.log('🔍 BusinessAnalyticsService: Found events for performance:', events?.length || 0);

      if (!events || events.length === 0) {
        console.log('🔍 BusinessAnalyticsService: No events found for performance, returning empty array');
        return [];
      }

      const eventIds = events.map((e: any) => e.id);

      // Get interactions for these events (all users)
      const interactions = await AnalyticsDataService.getAllUserInteractions(
        eventIds,
        undefined,
        ['event']
      );

      // Get reviews for these events (all users)
      const reviews = await AnalyticsDataService.getAllUserReviews(eventIds);

      // Get interested users (all users)
      const interestedUsers = await AnalyticsDataService.getAllInterestedUsers(eventIds);

      // Process each event
      const eventPerformance: EventPerformance[] = events.map((event: any) => {
        const eventInteractions = interactions?.filter((i: any) => i.entity_id === event.id) || [];
        const eventReviews = reviews?.filter((r: any) => r.event_id === event.id) || [];
        const eventInterested = interestedUsers?.filter((u: any) => u.event_id === event.id) || [];

        const totalViews = eventInteractions.filter((i: any) => i.event_type === 'view').length;
        const ticketClicks = eventInteractions.filter((i: any) => i.event_type === 'click_ticket').length;
        const avgRating = eventReviews.length > 0 
          ? eventReviews.reduce((sum: number, review: any) => sum + (review.rating || 0), 0) / eventReviews.length 
          : 0;

        // Revenue calculation - only count actual revenue if we have real data
        const revenueGenerated = 0;
        const attendanceRate = totalViews > 0 ? (eventInterested.length / totalViews) * 100 : 0;

        return {
          event_id: event.id,
          title: event.title,
          artist_name: event.artist_name,
          event_date: event.event_date,
          venue_name: event.venue_name,
          total_views: totalViews,
          total_interested: eventInterested.length,
          ticket_clicks: ticketClicks,
          reviews_count: eventReviews.length,
          avg_rating: Math.round(avgRating * 100) / 100,
          revenue_generated: revenueGenerated,
          attendance_rate: Math.round(attendanceRate * 100) / 100,
        };
      });

      // Sort by revenue generated
      return eventPerformance.sort((a, b) => b.revenue_generated - a.revenue_generated);
    } catch (error) {
      console.error('Error getting event performance:', error);
      return [];
    }
  }

  /**
   * Get customer insights and segmentation
   */
  static async getCustomerInsights(userId: string): Promise<CustomerInsight[]> {
    try {
      console.log('🔍 BusinessAnalyticsService: Getting customer insights for user:', userId);

      // Get events created by this user
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('created_by_user_id', userId)
        .eq('event_status', 'published');

      if (eventsError) {
        console.error('Error fetching business events for customer insights:', eventsError);
        throw eventsError;
      }

      console.log('🔍 BusinessAnalyticsService: Found events for customer insights:', events?.length || 0);

      if (!events || events.length === 0) {
        console.log('🔍 BusinessAnalyticsService: No events found for customer insights, returning empty array');
        return [];
      }

      const eventIds = events.map((e: any) => e.id);

      // Get interested users
      const { data: interestedUsers } = await supabase
        .from('user_event_relationships')
        .select('*')
        .in('relationship_type', ['interested', 'going', 'maybe'])
        .in('event_id', eventIds);

      // Get reviews to determine satisfaction
      const { data: reviews } = await (supabase as any)
        .from('reviews')
        .select('*')
        .in('event_id', eventIds);

      // Segment customers based on behavior
      const userEventCounts = new Map<string, number>();
      const userRatings = new Map<string, number[]>();

      interestedUsers?.forEach((user: any) => {
        const count = userEventCounts.get(user.user_id) || 0;
        userEventCounts.set(user.user_id, count + 1);
      });

      reviews?.forEach((review: any) => {
        if (!userRatings.has(review.user_id)) {
          userRatings.set(review.user_id, []);
        }
        userRatings.get(review.user_id)!.push(review.rating || 0);
      });

      // Create customer segments
      const segments = {
        'New Customers': { min: 1, max: 1 },
        'Regular Customers': { min: 2, max: 4 },
        'VIP Customers': { min: 5, max: Infinity },
      };

      const insights: CustomerInsight[] = Object.entries(segments).map(([segmentName, range]) => {
        const customers = Array.from(userEventCounts.entries()).filter(
          ([_, count]) => count >= range.min && count <= range.max
        );

        const totalCustomers = userEventCounts.size;
        const count = customers.length;
        const percentage = totalCustomers > 0 ? (count / totalCustomers) * 100 : 0;

        // Calculate average events attended for this segment
        const avgEventsAttended = count > 0 
          ? customers.reduce((sum, [_, eventCount]) => sum + eventCount, 0) / count 
          : 0;

        // Calculate average spending (placeholder)
        const avgSpending = avgEventsAttended * 50; // Estimated $50 per event

        // Calculate loyalty score based on repeat visits and ratings
        const segmentRatings = customers.map(([userId, _]) => userRatings.get(userId) || []);
        const avgRating = segmentRatings.length > 0 
          ? segmentRatings.reduce((sum, ratings) => sum + ratings.reduce((a, b) => a + b, 0) / ratings.length, 0) / segmentRatings.length
          : 0;
        const loyaltyScore = (avgEventsAttended * 20) + (avgRating * 10); // Weighted score

        return {
          customer_segment: segmentName,
          count,
          percentage: Math.round(percentage * 100) / 100,
          avg_events_attended: Math.round(avgEventsAttended * 100) / 100,
          avg_spending: Math.round(avgSpending * 100) / 100,
          loyalty_score: Math.round(loyaltyScore * 100) / 100,
        };
      });

      return insights;
    } catch (error) {
      console.error('Error getting customer insights:', error);
      return [];
    }
  }

  /**
   * Get revenue insights over time
   */
  static async getRevenueInsights(userId: string, days: number = 30): Promise<RevenueInsight[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get events created by this user
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('created_by_user_id', userId)
        .eq('event_status', 'published')
        .gte('event_date', startDate.toISOString());

      if (eventsError) {
        console.error('Error fetching business events for revenue insights:', eventsError);
        throw eventsError;
      }

      console.log('🔍 BusinessAnalyticsService: Found events for revenue insights:', events?.length || 0);

      if (!events || events.length === 0) {
        return [];
      }

      const eventIds = events.map((e: any) => e.id);

      // Get interactions for these events
      const { data: interactions } = await (supabase as any)
        .from('interactions')
        .select('*')
        .in('entity_id', eventIds)
        .eq('entity_type', 'event')
        .gte('created_at', startDate.toISOString());

      // Group by date
      const dailyStats = new Map<string, {
        revenue: number;
        ticketClicks: number;
        views: number;
      }>();

      interactions?.forEach((interaction: any) => {
        const date = new Date(interaction.created_at).toISOString().split('T')[0];
        if (!dailyStats.has(date)) {
          dailyStats.set(date, {
            revenue: 0,
            ticketClicks: 0,
            views: 0,
          });
        }
        const stats = dailyStats.get(date)!;

        if (interaction.event_type === 'view') {
          stats.views++;
        } else if (interaction.event_type === 'click_ticket') {
          stats.ticketClicks++;
          // Revenue calculation - only count actual revenue if we have real data
          stats.revenue += 0;
        }
      });

      // Convert to RevenueInsight format
      const insights: RevenueInsight[] = Array.from(dailyStats.entries()).map(([date, stats]) => {
        const conversionRate = stats.views > 0 ? (stats.ticketClicks / stats.views) * 100 : 0;
        const avgTicketPrice = stats.ticketClicks > 0 ? stats.revenue / stats.ticketClicks : 0;

        return {
          date,
          revenue: stats.revenue,
          ticket_clicks: stats.ticketClicks,
          conversion_rate: Math.round(conversionRate * 100) / 100,
          avg_ticket_price: Math.round(avgTicketPrice * 100) / 100,
        };
      });

      // Sort by date
      return insights.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } catch (error) {
      console.error('Error getting revenue insights:', error);
      return [];
    }
  }

  /**
   * Get artist performance analytics
   */
  static async getArtistPerformance(userId: string): Promise<ArtistPerformance[]> {
    try {
      // Get events created by this user
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('created_by_user_id', userId)
        .eq('event_status', 'published');

      if (eventsError) {
        console.error('Error fetching business events for artist performance:', eventsError);
        throw eventsError;
      }

      console.log('🔍 BusinessAnalyticsService: Found events for artist performance:', events?.length || 0);

      if (!events || events.length === 0) {
        return [];
      }

      const eventIds = events.map((e: any) => e.id);

      // Get interactions and reviews
      const [interactionsResult, reviewsResult, interestedUsersResult] = await Promise.all([
        supabase.from('interactions').select('*').in('entity_id', eventIds).eq('entity_type', 'event'),
        supabase.from('reviews').select('*').in('event_id', eventIds),
        supabase.from('user_event_relationships').select('*').in('relationship_type', ['interested', 'going', 'maybe']).in('event_id', eventIds),
      ]);
      
      const interactions = interactionsResult.data || [];
      const reviews = reviewsResult.data || [];
      const interestedUsers = interestedUsersResult.data || [];

      // Group by artist
      const artistStats = new Map<string, {
        events: any[];
        interactions: any[];
        reviews: any[];
        interested: any[];
      }>();

      events.forEach((event: any) => {
        const artistName = event.artist_name;
        if (!artistStats.has(artistName)) {
          artistStats.set(artistName, {
            events: [],
            interactions: [],
            reviews: [],
            interested: [],
          });
        }
        artistStats.get(artistName)!.events.push(event);
      });

      interactions.forEach((interaction: any) => {
        const event = events.find((e: any) => e.id === interaction.entity_id);
        if (event) {
          artistStats.get(event.artist_name)?.interactions.push(interaction);
        }
      });

      reviews.forEach((review: any) => {
        const event = events.find((e: any) => e.id === review.event_id);
        if (event) {
          artistStats.get(event.artist_name)?.reviews.push(review);
        }
      });

      interestedUsers.forEach((user: any) => {
        const event = events.find((e: any) => e.id === user.event_id);
        if (event) {
          artistStats.get(event.artist_name)?.interested.push(user);
        }
      });

      // Convert to ArtistPerformance format
      const performances: ArtistPerformance[] = Array.from(artistStats.entries()).map(([artistName, stats]) => {
        const eventsCount = stats.events.length;
        const totalViews = stats.interactions.filter((i: any) => i.event_type === 'view').length;
        const totalRevenue = stats.interactions.filter((i: any) => i.event_type === 'click_ticket').length * 50;

        const avgRating = stats.reviews.length > 0 
          ? stats.reviews.reduce((sum: number, review: any) => sum + (review.rating || 0), 0) / stats.reviews.length 
          : 0;

        const customerSatisfaction = avgRating * 20; // Convert to percentage

        // Calculate repeat rate (users who attended multiple events by this artist)
        const uniqueUsers = new Set(stats.interested.map((u: any) => u.user_id));
        const repeatUsers = Array.from(uniqueUsers).filter((userId: any) => 
          stats.interested.filter((u: any) => u.user_id === userId).length > 1
        ).length;
        const repeatRate = uniqueUsers.size > 0 ? (repeatUsers / uniqueUsers.size) * 100 : 0;

        return {
          artist_name: artistName,
          events_count: eventsCount,
          total_views: totalViews,
          avg_rating: Math.round(avgRating * 100) / 100,
          total_revenue: totalRevenue,
          customer_satisfaction: Math.round(customerSatisfaction * 100) / 100,
          repeat_rate: Math.round(repeatRate * 100) / 100,
        };
      });

      // Sort by total revenue
      return performances.sort((a, b) => b.total_revenue - a.total_revenue);
    } catch (error) {
      console.error('Error getting artist performance:', error);
      return [];
    }
  }

  /**
   * Get business achievements
   */
  static async getBusinessAchievements(userId: string): Promise<BusinessAchievement[]> {
    try {
      const stats = await this.getBusinessStats(userId);
      const eventPerformance = await this.getEventPerformance(userId);
      const customerInsights = await this.getCustomerInsights(userId);

      const achievements: BusinessAchievement[] = [
        {
          id: 'first_event',
          name: 'First Event',
          description: 'Host your first event',
          icon: '🎪',
          progress: Math.min(stats.total_events, 1),
          goal: 1,
          unlocked: stats.total_events >= 1,
          category: 'events',
        },
        {
          id: 'busy_venue',
          name: 'Busy Venue',
          description: 'Host 10 events',
          icon: '🏢',
          progress: Math.min(stats.total_events, 10),
          goal: 10,
          unlocked: stats.total_events >= 10,
          category: 'events',
        },
        {
          id: 'event_venue',
          name: 'Event Venue',
          description: 'Host 50 events',
          icon: '🎭',
          progress: Math.min(stats.total_events, 50),
          goal: 50,
          unlocked: stats.total_events >= 50,
          category: 'events',
        },
        {
          id: 'first_revenue',
          name: 'First Revenue',
          description: 'Generate $1,000 in ticket revenue',
          icon: '💰',
          progress: Math.min(stats.total_revenue, 1000),
          goal: 1000,
          unlocked: stats.total_revenue >= 1000,
          category: 'revenue',
        },
        {
          id: 'revenue_generator',
          name: 'Revenue Generator',
          description: 'Generate $10,000 in ticket revenue',
          icon: '💎',
          progress: Math.min(stats.total_revenue, 10000),
          goal: 10000,
          unlocked: stats.total_revenue >= 10000,
          category: 'revenue',
        },
        {
          id: 'high_conversion',
          name: 'High Conversion',
          description: 'Achieve 10% conversion rate',
          icon: '📈',
          progress: Math.min(stats.conversion_rate, 10),
          goal: 10,
          unlocked: stats.conversion_rate >= 10,
          category: 'growth',
        },
        {
          id: 'customer_satisfaction',
          name: 'Customer Satisfaction',
          description: 'Achieve 4.5+ average rating',
          icon: '⭐',
          progress: Math.min(stats.customer_satisfaction, 4.5),
          goal: 4.5,
          unlocked: stats.customer_satisfaction >= 4.5,
          category: 'customers',
        },
        {
          id: 'loyal_customers',
          name: 'Loyal Customers',
          description: 'Achieve 30% repeat customer rate',
          icon: '🔄',
          progress: Math.min(stats.repeat_customer_rate, 30),
          goal: 30,
          unlocked: stats.repeat_customer_rate >= 30,
          category: 'customers',
        },
        {
          id: 'popular_venue',
          name: 'Popular Venue',
          description: 'Attract 1,000 total attendees',
          icon: '👥',
          progress: Math.min(stats.total_attendees, 1000),
          goal: 1000,
          unlocked: stats.total_attendees >= 1000,
          category: 'growth',
        },
        {
          id: 'successful_business',
          name: 'Successful Business',
          description: 'Generate $50,000 in total revenue',
          icon: '🏆',
          progress: Math.min(stats.total_revenue, 50000),
          goal: 50000,
          unlocked: stats.total_revenue >= 50000,
          category: 'revenue',
        },
      ];

      return achievements;
    } catch (error) {
      console.error('Error getting business achievements:', error);
      return [];
    }
  }

  /**
   * Export business analytics data
   */
  static async exportBusinessData(userId: string): Promise<{
    stats: BusinessStats;
    eventPerformance: EventPerformance[];
    customerInsights: CustomerInsight[];
    revenueInsights: RevenueInsight[];
    artistPerformance: ArtistPerformance[];
    achievements: BusinessAchievement[];
  }> {
    const [
      stats,
      eventPerformance,
      customerInsights,
      revenueInsights,
      artistPerformance,
      achievements
    ] = await Promise.all([
      this.getBusinessStats(userId),
      this.getEventPerformance(userId),
      this.getCustomerInsights(userId),
      this.getRevenueInsights(userId),
      this.getArtistPerformance(userId),
      this.getBusinessAchievements(userId),
    ]);

    return {
      stats,
      eventPerformance,
      customerInsights,
      revenueInsights,
      artistPerformance,
      achievements,
    };
  }
}
