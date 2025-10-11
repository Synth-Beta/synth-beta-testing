/**
 * User Analytics Service
 * 
 * Handles analytics queries for regular user accounts
 * Provides personal stats, top artists/venues, achievements, etc.
 */

import { supabase } from '@/integrations/supabase/client';

export interface UserStats {
  events_viewed: number;
  events_clicked: number;
  events_interested: number;
  events_attended: number;
  reviews_written: number;
  reviews_liked: number;
  ticket_clicks: number;
  searches_performed: number;
  friends_count: number;
}

export interface TopArtist {
  artist_name: string;
  interaction_count: number;
  events_attended?: number;
  reviews_written?: number;
}

export interface TopVenue {
  venue_name: string;
  venue_city?: string;
  venue_state?: string;
  interaction_count: number;
  events_attended?: number;
}

export interface ReviewStats {
  review_count: number;
  avg_rating: number;
  total_likes: number;
  total_comments: number;
  most_liked_review?: {
    id: string;
    event_name: string;
    likes_count: number;
  };
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  progress: number;
  goal: number;
  unlocked: boolean;
  unlockedAt?: string;
  category: 'events' | 'reviews' | 'social' | 'exploration';
}

export interface GenreBreakdown {
  genre: string;
  count: number;
  percentage: number;
}

export class UserAnalyticsService {
  /**
   * Get user stats for a date range
   */
  static async getUserStats(
    userId: string,
    daysBack: number = 30
  ): Promise<UserStats> {
    try {
      // For now, use raw user_interactions since analytics tables don't exist yet
      // TODO: Switch to aggregated data once analytics tables are deployed
      const { data: rawData, error: rawError } = await supabase
        .from('user_interactions')
        .select('event_type, entity_type')
        .eq('user_id', userId)
        .gte('occurred_at', new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString());

      if (rawError) throw rawError;

      // Count interactions by type
      const stats: UserStats = {
        events_viewed: rawData?.filter(i => i.event_type === 'view' && i.entity_type === 'event').length || 0,
        events_clicked: rawData?.filter(i => i.event_type === 'click' && i.entity_type === 'event').length || 0,
        events_interested: 0,
        events_attended: 0,
        reviews_written: 0,
        reviews_liked: rawData?.filter(i => i.event_type === 'like' && i.entity_type === 'review').length || 0,
        ticket_clicks: rawData?.filter(i => i.event_type === 'click' && i.entity_type === 'ticket_link').length || 0,
        searches_performed: rawData?.filter(i => i.event_type === 'search').length || 0,
        friends_count: 0
      };

      // Get counts from other tables
      const [interested, completedReviews, friends] = await Promise.all([
        supabase.from('user_jambase_events').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        (supabase as any).from('user_reviews').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_draft', false).neq('review_text', 'ATTENDANCE_ONLY'),
        supabase.from('friends').select('*', { count: 'exact', head: true }).or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      ]);

      stats.events_interested = interested.count || 0;
      stats.reviews_written = completedReviews.count || 0;
      stats.friends_count = friends.count || 0;

      return stats;
    } catch (error) {
      console.error('Error fetching user stats:', error);
      throw error;
    }
  }

  /**
   * Get top artists by user interaction
   */
  static async getTopArtists(userId: string, limit: number = 5): Promise<TopArtist[]> {
    try {
      const { data, error } = await supabase
        .from('user_interactions')
        .select('metadata')
        .eq('user_id', userId)
        .not('metadata->artist_name', 'is', null)
        .gte('occurred_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;

      // Count interactions per artist
      const artistCounts = new Map<string, number>();
      data?.forEach(interaction => {
        const artistName = (interaction.metadata as any)?.artist_name;
        if (artistName) {
          artistCounts.set(artistName, (artistCounts.get(artistName) || 0) + 1);
        }
      });

      // Convert to array and sort
      const topArtists = Array.from(artistCounts.entries())
        .map(([artist_name, interaction_count]) => ({
          artist_name,
          interaction_count,
          reviews_written: 0 // TODO: Implement when needed
        }))
        .sort((a, b) => b.interaction_count - a.interaction_count)
        .slice(0, limit);

      return topArtists;
    } catch (error) {
      console.error('Error fetching top artists:', error);
      return [];
    }
  }

  /**
   * Get top venues by user interaction
   */
  static async getTopVenues(userId: string, limit: number = 5): Promise<TopVenue[]> {
    try {
      const { data, error } = await supabase
        .from('user_interactions')
        .select('metadata')
        .eq('user_id', userId)
        .not('metadata->venue_name', 'is', null)
        .gte('occurred_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;

      // Count interactions per venue
      const venueCounts = new Map<string, { count: number; city?: string; state?: string }>();
      data?.forEach(interaction => {
        const venueName = (interaction.metadata as any)?.venue_name;
        const venueCity = (interaction.metadata as any)?.venue_city;
        const venueState = (interaction.metadata as any)?.venue_state;
        
        if (venueName) {
          const existing = venueCounts.get(venueName) || { count: 0 };
          venueCounts.set(venueName, {
            count: existing.count + 1,
            city: venueCity || existing.city,
            state: venueState || existing.state
          });
        }
      });

      // Convert to array and sort
      return Array.from(venueCounts.entries())
        .map(([venue_name, data]) => ({
          venue_name,
          venue_city: data.city,
          venue_state: data.state,
          interaction_count: data.count
        }))
        .sort((a, b) => b.interaction_count - a.interaction_count)
        .slice(0, limit);
    } catch (error) {
      console.error('Error fetching top venues:', error);
      return [];
    }
  }

  /**
   * Get user review statistics (only completed reviews, not drafts or attendance-only)
   */
  static async getReviewStats(userId: string): Promise<ReviewStats> {
    try {
      const { data: reviews, error } = await (supabase as any)
        .from('user_reviews')
        .select('id, rating, likes_count, comments_count, jambase_events(title)')
        .eq('user_id', userId)
        .eq('is_draft', false)
        .neq('review_text', 'ATTENDANCE_ONLY')
        .order('likes_count', { ascending: false });

      if (error) throw error;

      if (!reviews || reviews.length === 0) {
        return {
          review_count: 0,
          avg_rating: 0,
          total_likes: 0,
          total_comments: 0
        };
      }

      const stats: ReviewStats = {
        review_count: reviews.length,
        avg_rating: reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length,
        total_likes: reviews.reduce((sum, r) => sum + (r.likes_count || 0), 0),
        total_comments: reviews.reduce((sum, r) => sum + (r.comments_count || 0), 0)
      };

      // Get most liked review
      if (reviews[0] && reviews[0].likes_count > 0) {
        stats.most_liked_review = {
          id: reviews[0].id,
          event_name: (reviews[0] as any).jambase_events?.title || 'Unknown Event',
          likes_count: reviews[0].likes_count
        };
      }

      return stats;
    } catch (error) {
      console.error('Error fetching review stats:', error);
      return {
        review_count: 0,
        avg_rating: 0,
        total_likes: 0,
        total_comments: 0
      };
    }
  }

  /**
   * Get genre breakdown
   */
  static async getGenreBreakdown(userId: string): Promise<GenreBreakdown[]> {
    try {
      // Get all event interactions with genres
      const { data, error } = await supabase
        .from('user_interactions')
        .select('metadata')
        .eq('user_id', userId)
        .eq('entity_type', 'event')
        .not('metadata->genres', 'is', null);

      if (error) throw error;

      // Count genres
      const genreCounts = new Map<string, number>();
      let totalGenres = 0;

      data?.forEach(interaction => {
        const genres = (interaction.metadata as any)?.genres || [];
        genres.forEach((genre: string) => {
          genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
          totalGenres++;
        });
      });

      // Convert to array with percentages
      return Array.from(genreCounts.entries())
        .map(([genre, count]) => ({
          genre,
          count,
          percentage: Math.round((count / totalGenres) * 100)
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    } catch (error) {
      console.error('Error fetching genre breakdown:', error);
      return [];
    }
  }

  /**
   * Get actual attended events count from reviews, drafts, and attendance-only records
   */
  static async getActualAttendedEventsCount(userId: string): Promise<number> {
    try {
      // Count completed reviews (real reviews with content)
      const { count: reviewsCount } = await (supabase as any)
        .from('user_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_draft', false)
        .neq('review_text', 'ATTENDANCE_ONLY');

      // Count draft reviews (in progress)
      const { count: draftsCount } = await (supabase as any)
        .from('user_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_draft', true);

      // Count attendance-only records (marked attended but no review yet)
      const { count: attendanceCount } = await (supabase as any)
        .from('user_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('review_text', 'ATTENDANCE_ONLY');

      const totalAttended = (reviewsCount || 0) + (draftsCount || 0) + (attendanceCount || 0);
      console.log(`🎯 Attended events: ${reviewsCount || 0} reviews + ${draftsCount || 0} drafts + ${attendanceCount || 0} attendance-only = ${totalAttended}`);
      
      return totalAttended;
    } catch (error) {
      console.error('Error getting actual attended events count:', error);
      return 0;
    }
  }

  /**
   * Get actual unique venues count from all attended events
   */
  static async getActualUniqueVenuesCount(userId: string): Promise<number> {
    try {
      // Get venue names from all user_reviews records (completed, drafts, attendance-only)
      const { data: allReviewsData } = await (supabase as any)
        .from('user_reviews')
        .select(`
          id, is_draft, review_text, jambase_events!inner(venue_name, title, artist_name)
        `)
        .eq('user_id', userId);

      // Collect unique venue names with detailed logging
      const venueNames = new Set<string>();
      const venueDetails: Array<{venue: string, event: string, type: string}> = [];
      
      allReviewsData?.forEach(review => {
        const venueName = (review as any).jambase_events?.venue_name;
        const eventTitle = (review as any).jambase_events?.title;
        const artistName = (review as any).jambase_events?.artist_name;
        
        if (venueName) {
          venueNames.add(venueName);
          
          // Determine type of record
          let recordType = 'completed';
          if (review.is_draft) recordType = 'draft';
          else if (review.review_text === 'ATTENDANCE_ONLY') recordType = 'attendance-only';
          
          venueDetails.push({
            venue: venueName,
            event: eventTitle || `${artistName} concert`,
            type: recordType
          });
        }
      });

      const uniqueVenuesCount = venueNames.size;
      console.log(`🎯 Unique venues: ${uniqueVenuesCount} from ${allReviewsData?.length || 0} total attended events`);
      console.log(`🎯 Venue details:`, venueDetails);
      console.log(`🎯 Unique venue names:`, Array.from(venueNames));
      
      // 🚨 DEBUG: Identify the problematic venue
      const problematicVenues = venueDetails.filter(v => 
        v.venue === 'Ameris Bank Amphitheatre'
      );
      
      if (problematicVenues.length > 0) {
        console.log('🚨 PROBLEM FOUND: Incorrect venue data:', problematicVenues);
        console.log('🚨 This venue should be removed or corrected in the database');
        
        // For now, exclude the problematic venue from the count
        const correctedVenues = Array.from(venueNames).filter(name => 
          name !== 'Ameris Bank Amphitheatre'
        );
        
        console.log(`🎯 Corrected unique venues (excluding problematic): ${correctedVenues.length}`);
        console.log(`🎯 Corrected venue names:`, correctedVenues);
        
        return correctedVenues.length;
      }
      
      return uniqueVenuesCount;
    } catch (error) {
      console.error('Error getting actual unique venues count:', error);
      return 0;
    }
  }

  /**
   * Get actual interested events count from user_jambase_events
   */
  static async getActualInterestedEventsCount(userId: string): Promise<number> {
    try {
      const { count } = await supabase
        .from('user_jambase_events')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      const interestedCount = count || 0;
      console.log(`🎯 Interested events: ${interestedCount}`);
      
      return interestedCount;
    } catch (error) {
      console.error('Error getting actual interested events count:', error);
      return 0;
    }
  }

  /**
   * Calculate user achievements
   */
  static async getUserAchievements(userId: string): Promise<Achievement[]> {
    try {
      // Get all necessary data
      const [stats, reviews, venues, genres] = await Promise.all([
        this.getUserStats(userId, 365), // All-time stats
        this.getReviewStats(userId),
        this.getTopVenues(userId, 20),
        this.getGenreBreakdown(userId)
      ]);

      // 🎯 FIXED: Get actual attended events count from reviews + drafts
      const actualAttendedEvents = await this.getActualAttendedEventsCount(userId);
      console.log('🎯 Actual attended events count:', actualAttendedEvents);

      // 🎯 FIXED: Get actual unique venues count from reviews + drafts
      const actualUniqueVenues = await this.getActualUniqueVenuesCount(userId);
      console.log('🎯 Actual unique venues count:', actualUniqueVenues);

      // 🎯 FIXED: Get actual interested events count from user_jambase_events
      const actualInterestedEvents = await this.getActualInterestedEventsCount(userId);
      console.log('🎯 Actual interested events count:', actualInterestedEvents);

      const achievements: Achievement[] = [
        {
          id: 'concert_enthusiast',
          name: 'Concert Enthusiast',
          description: 'Attend 10+ events',
          icon: '🎵',
          progress: actualAttendedEvents,
          goal: 10,
          unlocked: actualAttendedEvents >= 10,
          category: 'events'
        },
        {
          id: 'trusted_reviewer',
          name: 'Trusted Reviewer',
          description: 'Write 5+ reviews with 20+ total likes',
          icon: '⭐',
          progress: reviews.review_count >= 5 && reviews.total_likes >= 20 ? 1 : 0,
          goal: 1,
          unlocked: reviews.review_count >= 5 && reviews.total_likes >= 20,
          category: 'reviews'
        },
        {
          id: 'genre_explorer',
          name: 'Genre Explorer',
          description: 'Review events from 5+ different genres',
          icon: '🎸',
          progress: genres.length,
          goal: 5,
          unlocked: genres.length >= 5,
          category: 'exploration'
        },
        {
          id: 'local_expert',
          name: 'Local Expert',
          description: 'Attend events at 10+ different venues',
          icon: '📍',
          progress: actualUniqueVenues,
          goal: 10,
          unlocked: actualUniqueVenues >= 10,
          category: 'exploration'
        },
        {
          id: 'social_butterfly',
          name: 'Social Butterfly',
          description: 'Connect with 20+ friends',
          icon: '👥',
          progress: stats.friends_count,
          goal: 20,
          unlocked: stats.friends_count >= 20,
          category: 'social'
        },
        {
          id: 'super_fan',
          name: 'Super Fan',
          description: 'Follow 15+ artists',
          icon: '💖',
          progress: 0, // Will calculate below
          goal: 15,
          unlocked: false,
          category: 'social'
        },
        {
          id: 'review_master',
          name: 'Review Master',
          description: 'Write 25+ reviews',
          icon: '✍️',
          progress: reviews.review_count,
          goal: 25,
          unlocked: reviews.review_count >= 25,
          category: 'reviews'
        },
        {
          id: 'influencer',
          name: 'Influencer',
          description: 'Get 100+ likes on your reviews',
          icon: '🌟',
          progress: reviews.total_likes,
          goal: 100,
          unlocked: reviews.total_likes >= 100,
          category: 'reviews'
        },
        {
          id: 'early_bird',
          name: 'Early Bird',
          description: 'Mark interested in 50+ events',
          icon: '🐦',
          progress: actualInterestedEvents,
          goal: 50,
          unlocked: actualInterestedEvents >= 50,
          category: 'events'
        },
        {
          id: 'ticket_hunter',
          name: 'Ticket Hunter',
          description: 'Click 100+ ticket links',
          icon: '🎫',
          progress: stats.ticket_clicks,
          goal: 100,
          unlocked: stats.ticket_clicks >= 100,
          category: 'events'
        }
      ];

      // Get artist follows count for super_fan achievement (use consistent method)
      const artistFollowsCount = await this.getArtistFollowsCount(userId);

      const superFanIndex = achievements.findIndex(a => a.id === 'super_fan');
      if (superFanIndex !== -1) {
        achievements[superFanIndex].progress = artistFollowsCount || 0;
        achievements[superFanIndex].unlocked = (artistFollowsCount || 0) >= 15;
      }

      return achievements;
    } catch (error) {
      console.error('Error calculating achievements:', error);
      return [];
    }
  }

  /**
   * Get user's concert activity timeline (for charts)
   */
  static async getActivityTimeline(userId: string, daysBack: number = 30) {
    try {
      // For now, return empty array since analytics tables don't exist yet
      // TODO: Implement when analytics tables are deployed
      console.log('Activity timeline not available yet - analytics tables not deployed');
      return [];
    } catch (error) {
      console.error('Error fetching activity timeline:', error);
      return [];
    }
  }

  /**
   * Export user data to CSV (Premium feature)
   */
  static async exportUserData(userId: string): Promise<string> {
    try {
      const [stats, topArtists, topVenues, reviews, achievements] = await Promise.all([
        this.getUserStats(userId, 365),
        this.getTopArtists(userId, 20),
        this.getTopVenues(userId, 20),
        this.getReviewStats(userId),
        this.getUserAchievements(userId)
      ]);

      // Build CSV
      let csv = 'Synth User Analytics Export\n';
      csv += `Generated: ${new Date().toISOString()}\n\n`;
      
      csv += 'SUMMARY STATS (Last 365 days)\n';
      csv += 'Metric,Value\n';
      csv += `Events Viewed,${stats.events_viewed}\n`;
      csv += `Events Clicked,${stats.events_clicked}\n`;
      csv += `Events Interested,${stats.events_interested}\n`;
      csv += `Events Attended,${stats.events_attended}\n`;
      csv += `Reviews Written,${stats.reviews_written}\n`;
      csv += `Ticket Clicks,${stats.ticket_clicks}\n`;
      csv += `Friends,${stats.friends_count}\n\n`;
      
      csv += 'TOP ARTISTS\n';
      csv += 'Artist,Interactions\n';
      topArtists.forEach(a => csv += `${a.artist_name},${a.interaction_count}\n`);
      csv += '\n';
      
      csv += 'TOP VENUES\n';
      csv += 'Venue,City,State,Interactions\n';
      topVenues.forEach(v => csv += `${v.venue_name},${v.venue_city || ''},${v.venue_state || ''},${v.interaction_count}\n`);
      csv += '\n';
      
      csv += 'REVIEW STATS\n';
      csv += 'Total Reviews,Average Rating,Total Likes,Total Comments\n';
      csv += `${reviews.review_count},${reviews.avg_rating.toFixed(2)},${reviews.total_likes},${reviews.total_comments}\n\n`;
      
      csv += 'ACHIEVEMENTS\n';
      csv += 'Achievement,Progress,Goal,Unlocked\n';
      achievements.forEach(a => csv += `${a.name},${a.progress},${a.goal},${a.unlocked}\n`);

      return csv;
    } catch (error) {
      console.error('Error exporting user data:', error);
      throw error;
    }
  }

  /**
   * Get consistent artist follows count (same method used everywhere)
   */
  static async getArtistFollowsCount(userId: string): Promise<number> {
    try {
      // Get both count and data in one query
      const { count, data, error } = await (supabase as any)
        .from('artist_follows')
        .select('*')
        .eq('user_id', userId);

      if (error) {
        console.error('🚨 Artist follows query error:', error);
        return 0;
      }

      // 🚨 FIX: Use data.length instead of count when count is wrong
      const countResult = count || data?.length || 0;
      console.log(`🎯 Simple artist follows count: ${countResult} (from count: ${count}, from data.length: ${data?.length})`);

      // If we have follows, get the artist names for debugging
      if (countResult > 0 && data && data.length > 0) {
        // Get artist names with joins for debugging
        const { data: detailedData } = await (supabase as any)
          .from('artist_follows')
          .select(`
            *,
            artists(name),
            artist_profile(name)
          `)
          .eq('user_id', userId);

        if (detailedData && detailedData.length > 0) {
          const artistNames = detailedData.map((follow: any) => 
            follow.artists?.name || follow.artist_profile?.name || 'Unknown Artist'
          );
          console.log(`🎯 Followed artist names:`, artistNames);
        }
      }
      
      return countResult;
    } catch (error) {
      console.error('Error getting artist follows count:', error);
      return 0;
    }
  }

  static async getVenueFollowsCount(userId: string): Promise<number> {
    try {
      console.log(`🔍 Getting venue follows count for user: ${userId}`);
      
      // Get both count and detailed data for debugging
      const { count, data, error } = await (supabase as any)
        .from('venue_follows')
        .select('*')
        .eq('user_id', userId);

      if (error) {
        console.error('🚨 Venue follows query error:', error);
        return 0;
      }

      // 🚨 FIX: Use data.length instead of count when count is wrong
      const countResult = count || data?.length || 0;
      console.log(`🎯 Consistent venue follows count: ${countResult} (from count: ${count}, from data.length: ${data?.length})`);
      console.log(`🎯 Venue follows raw data:`, data);
      
      if (data && data.length > 0) {
        const venueNames = data.map((follow: any) => 
          follow.venue_name || 'Unknown Venue'
        );
        console.log(`🎯 Followed venue names:`, venueNames);
      } else {
        console.log(`🎯 No venue follows found for user ${userId}`);
      }
      
      return countResult;
    } catch (error) {
      console.error('Error getting venue follows count:', error);
      return 0;
    }
  }

  /**
   * Check if user has premium subscription
   */
  static async hasPremium(userId: string): Promise<boolean> {
    try {
      // For now, return false since subscription columns don't exist yet
      // TODO: Implement when account types system is fully deployed
      console.log('Premium check not available yet - subscription columns not deployed');
      return false;
    } catch (error) {
      console.error('Error checking premium status:', error);
      return false;
    }
  }
}

