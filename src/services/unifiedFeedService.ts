import { supabase } from '@/integrations/supabase/client';
import { ReviewService } from './reviewService';
import { JamBaseEventResponse } from './jambaseEventsService';

export interface UnifiedFeedItem {
  id: string;
  type: 'review' | 'event' | 'friend_activity' | 'system_news';
  title: string;
  content?: string;
  author: {
    id: string;
    name: string;
    avatar_url?: string;
  };
  created_at: string;
  updated_at?: string;
  
  // Review-specific fields
  rating?: number;
  is_public?: boolean;
  event_info?: {
    event_name?: string;
    venue_name?: string;
    event_date?: string;
    artist_name?: string;
  };
  
  // Event-specific fields
  event_data?: JamBaseEventResponse;
  
  // Engagement fields
  likes_count?: number;
  comments_count?: number;
  shares_count?: number;
  is_liked?: boolean;
  
  // Location data
  location?: {
    lat: number;
    lng: number;
    venue_name?: string;
    venue_address?: string;
  };
  
  // Relevance scoring
  relevance_score: number;
  distance_miles?: number;
}

export interface FeedOptions {
  userId: string;
  limit?: number;
  offset?: number;
  userLocation?: { lat: number; lng: number };
  includePrivateReviews?: boolean;
  maxDistanceMiles?: number;
}

export class UnifiedFeedService {
  /**
   * Fetch all feed items in unified format
   */
  static async getFeedItems(options: FeedOptions): Promise<UnifiedFeedItem[]> {
    const { userId, limit = 50, offset = 0, userLocation, includePrivateReviews = true } = options;
    
    try {
      const feedItems: UnifiedFeedItem[] = [];
      
      // Fetch user's own reviews (private and public)
      if (includePrivateReviews) {
        const userReviews = await this.getUserReviews(userId);
        feedItems.push(...userReviews);
      }
      
      // Fetch public reviews from friends and community
      const publicReviews = await this.getPublicReviews(userId, limit);
      feedItems.push(...publicReviews);
      
      // Fetch recent events (as "news" items)
      const recentEvents = await this.getRecentEvents(userLocation, 20);
      feedItems.push(...recentEvents);
      
      // Fetch friend activity
      const friendActivity = await this.getFriendActivity(userId, 10);
      feedItems.push(...friendActivity);
      
      // Sort by relevance and recency
      const sortedItems = this.sortByRelevanceAndTime(feedItems, userLocation);
      
      // Apply pagination
      return sortedItems.slice(offset, offset + limit);
      
    } catch (error) {
      console.error('Error fetching unified feed:', error);
      throw new Error(`Failed to fetch feed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Get user's own reviews
   */
  private static async getUserReviews(userId: string): Promise<UnifiedFeedItem[]> {
    try {
      const { data: reviews, error } = await supabase
        .from('user_reviews')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      
      return (reviews || []).map(review => ({
        id: `review-${review.id}`,
        type: 'review' as const,
        title: review.is_public ? 'Your Public Review' : 'Your Private Review',
        content: review.review_text || '',
        author: {
          id: userId,
          name: 'You',
          avatar_url: undefined
        },
        created_at: review.created_at,
        updated_at: review.updated_at,
        rating: review.rating,
        is_public: review.is_public,
        likes_count: review.likes_count || 0,
        comments_count: review.comments_count || 0,
        shares_count: review.shares_count || 0,
        event_info: {
          event_name: 'Concert Review',
          venue_name: 'Unknown Venue',
          event_date: review.created_at
        },
        relevance_score: this.calculateReviewRelevance(review, true) // Higher score for own reviews
      }));
    } catch (error) {
      console.error('Error fetching user reviews:', error);
      return [];
    }
  }
  
  /**
   * Get public reviews from community
   */
  private static async getPublicReviews(userId: string, limit: number): Promise<UnifiedFeedItem[]> {
    try {
      const { data: reviews, error } = await supabase
        .from('public_reviews_with_profiles')
        .select('*')
        .neq('user_id', userId) // Exclude user's own reviews
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      
      return (reviews || []).map(review => ({
        id: `public-review-${review.review_id || review.id}`,
        type: 'review' as const,
        title: `${review.reviewer_name || 'Someone'}'s Review`,
        content: review.review_text || '',
        author: {
          id: review.reviewer_id || review.user_id,
          name: review.reviewer_name || 'Anonymous',
          avatar_url: review.reviewer_avatar
        },
        created_at: review.created_at,
        rating: review.rating,
        is_public: true,
        likes_count: review.likes_count || 0,
        comments_count: review.comments_count || 0,
        shares_count: review.shares_count || 0,
        event_info: {
          event_name: review.event_title || 'Concert Review',
          venue_name: review.venue_name || 'Unknown Venue',
          event_date: review.event_date || review.created_at,
          artist_name: review.artist_name
        },
        relevance_score: this.calculateReviewRelevance(review, false)
      }));
    } catch (error) {
      console.error('Error fetching public reviews:', error);
      return [];
    }
  }
  
  /**
   * Get recent events as feed items
   */
  private static async getRecentEvents(userLocation?: { lat: number; lng: number }, limit: number = 20): Promise<UnifiedFeedItem[]> {
    try {
      let query = supabase
        .from('jambase_events')
        .select('*')
        .gte('event_date', new Date().toISOString())
        .order('event_date', { ascending: true });
      
      // If user location is provided, prioritize nearby events
      if (userLocation) {
        // Add location-based filtering here if needed
        query = query.limit(limit * 2); // Get more to filter by distance
      } else {
        query = query.limit(limit);
      }
      
      const { data: events, error } = await query;
      
      if (error) throw error;
      
      let eventItems = (events || []).map(event => {
        const item: UnifiedFeedItem = {
          id: `event-${event.id}`,
          type: 'event' as const,
          title: `New Event: ${event.title}`,
          content: event.description || `${event.artist_name} is performing at ${event.venue_name}`,
          author: {
            id: 'system',
            name: 'PlusOne Events',
            avatar_url: undefined
          },
          created_at: event.created_at || event.event_date,
          event_data: {
            id: event.id,
            jambase_event_id: event.jambase_event_id,
            title: event.title,
            artist_name: event.artist_name,
            artist_id: event.artist_id || '',
            venue_name: event.venue_name,
            venue_id: event.venue_id || '',
            event_date: event.event_date,
            doors_time: event.doors_time,
            description: event.description,
            genres: event.genres,
            venue_address: event.venue_address,
            venue_city: event.venue_city,
            venue_state: event.venue_state,
            venue_zip: event.venue_zip,
            latitude: event.latitude ? Number(event.latitude) : undefined,
            longitude: event.longitude ? Number(event.longitude) : undefined,
            ticket_available: event.ticket_available,
            price_range: event.price_range,
            ticket_urls: event.ticket_urls,
            setlist: event.setlist,
            tour_name: event.tour_name,
            created_at: event.created_at,
            updated_at: event.updated_at
          },
          event_info: {
            event_name: event.title,
            venue_name: event.venue_name,
            event_date: event.event_date,
            artist_name: event.artist_name
          },
          location: event.latitude && event.longitude ? {
            lat: Number(event.latitude),
            lng: Number(event.longitude),
            venue_name: event.venue_name,
            venue_address: event.venue_address
          } : undefined,
          relevance_score: this.calculateEventRelevance(event, userLocation)
        };
        
        // Calculate distance if user location is available
        if (userLocation && item.location) {
          item.distance_miles = this.calculateDistance(
            userLocation.lat,
            userLocation.lng,
            item.location.lat,
            item.location.lng
          );
        }
        
        return item;
      });
      
      // Filter by distance if user location is provided
      if (userLocation) {
        eventItems = eventItems
          .filter(item => !item.distance_miles || item.distance_miles <= 50) // Within 50 miles
          .slice(0, limit);
      }
      
      return eventItems;
    } catch (error) {
      console.error('Error fetching recent events:', error);
      return [];
    }
  }
  
  /**
   * Get friend activity (new friendships, friend reviews, etc.)
   */
  private static async getFriendActivity(userId: string, limit: number): Promise<UnifiedFeedItem[]> {
    try {
      // Get recent friend requests that were accepted
      // First get the friendship records
      const { data: friendships, error } = await supabase
        .from('friends')
        .select('id, user1_id, user2_id, created_at')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      
      // If no friendships found, return empty array
      if (!friendships || friendships.length === 0) {
        return [];
      }

      // Get profile information for all friend user IDs
      const allFriendIds = friendships.map(friendship => 
        friendship.user1_id === userId ? friendship.user2_id : friendship.user1_id
      );
      
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, name, avatar_url')
        .in('user_id', allFriendIds);

      if (profileError) {
        console.error('Error fetching friend profiles:', profileError);
        return [];
      }

      // Create a map of user_id to profile for quick lookup
      const profileMap = new Map(profiles?.map(profile => [profile.user_id, profile]) || []);

      return friendships.map(friendship => {
        const otherUserId = friendship.user1_id === userId ? friendship.user2_id : friendship.user1_id;
        const otherUser = profileMap.get(otherUserId);
        
        return {
          id: `friend-activity-${friendship.id}`,
          type: 'friend_activity' as const,
          title: `You're now friends with ${otherUser?.name || 'someone'}!`,
          content: `Start chatting and discover concerts together.`,
          author: {
            id: otherUserId,
            name: otherUser?.name || 'Unknown',
            avatar_url: otherUser?.avatar_url
          },
          created_at: friendship.created_at,
          relevance_score: this.calculateFriendActivityRelevance(friendship)
        };
      });
    } catch (error) {
      console.error('Error fetching friend activity:', error);
      return [];
    }
  }
  
  /**
   * Sort items by relevance and time
   */
  private static sortByRelevanceAndTime(items: UnifiedFeedItem[], userLocation?: { lat: number; lng: number }): UnifiedFeedItem[] {
    return items.sort((a, b) => {
      // Primary sort: relevance score (higher is better)
      const relevanceDiff = b.relevance_score - a.relevance_score;
      if (Math.abs(relevanceDiff) > 0.1) {
        return relevanceDiff;
      }
      
      // Secondary sort: recency (newer is better)
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      return timeB - timeA;
    });
  }
  
  /**
   * Calculate relevance score for reviews
   */
  private static calculateReviewRelevance(review: any, isOwnReview: boolean): number {
    let score = isOwnReview ? 0.9 : 0.5; // Own reviews get higher base score
    
    // Boost for public reviews
    if (review.is_public && !isOwnReview) {
      score += 0.2;
    }
    
    // Boost for recent reviews
    const daysSinceCreated = (Date.now() - new Date(review.created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCreated < 1) score += 0.3;
    else if (daysSinceCreated < 7) score += 0.2;
    else if (daysSinceCreated < 30) score += 0.1;
    
    // Boost for engagement
    const totalEngagement = (review.likes_count || 0) + (review.comments_count || 0);
    score += Math.min(totalEngagement * 0.05, 0.3);
    
    return Math.min(score, 1.0);
  }
  
  /**
   * Calculate relevance score for events
   */
  private static calculateEventRelevance(event: any, userLocation?: { lat: number; lng: number }): number {
    let score = 0.6; // Base score for events
    
    // Boost for upcoming events (within next 30 days)
    const eventDate = new Date(event.event_date);
    const daysUntilEvent = (eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    
    if (daysUntilEvent >= 0 && daysUntilEvent <= 30) {
      score += 0.3;
    } else if (daysUntilEvent > 30 && daysUntilEvent <= 90) {
      score += 0.2;
    }
    
    // Boost for events with location data
    if (event.latitude && event.longitude) {
      score += 0.1;
    }
    
    // Boost for events with ticket availability
    if (event.ticket_available) {
      score += 0.1;
    }
    
    return Math.min(score, 1.0);
  }
  
  /**
   * Calculate relevance score for friend activity
   */
  private static calculateFriendActivityRelevance(friendship: any): number {
    let score = 0.7; // Base score for friend activity
    
    // Boost for recent friendships
    const daysSinceCreated = (Date.now() - new Date(friendship.created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCreated < 1) score += 0.2;
    else if (daysSinceCreated < 7) score += 0.1;
    
    return Math.min(score, 1.0);
  }
  
  /**
   * Calculate distance between two points using Haversine formula
   */
  private static calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  
  /**
   * Convert degrees to radians
   */
  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
