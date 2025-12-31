import { supabase } from '@/integrations/supabase/client';
import { ReviewService } from './reviewService';
import { JamBaseEventResponse } from '@/types/eventTypes';
import { PersonalizedFeedService, PersonalizedEvent } from './personalizedFeedService';
import { FriendsReviewService } from './friendsReviewService';

export interface UnifiedFeedItem {
  id: string;
  type: 'review' | 'event' | 'friend_activity' | 'system_news' | 'group_chat';
  title: string;
  content?: string;
  // For reviews, the underlying review id for comment actions
  review_id?: string;
  author: {
    id: string;
    name: string;
    avatar_url?: string;
    verified?: boolean;
    account_type?: string;
  };
  created_at: string;
  updated_at?: string;
  
  // Review-specific fields
  rating?: number;
  is_public?: boolean;
  photos?: string[];
  setlist?: any; // Setlist data (JSON)
  event_info?: {
    event_name?: string;
    venue_name?: string;
    event_date?: string;
    artist_name?: string;
    artist_id?: string;
    venue_id?: string;
  };
  
  // Event-specific fields
  event_data?: JamBaseEventResponse & {
    friend_interest_count?: number;
    has_friends_going?: boolean;
  };
  
  // Group chat-specific fields
  group_chat_data?: {
    chat_id: string;
    chat_name: string;
    member_count?: number;
    friends_in_chat_count?: number;
    created_at: string;
  };
  
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
  
  // Connection degree (for reviews from connections)
  connection_degree?: number;
  connection_type_label?: string; // 'Friend', 'Mutual Friend', 'Mutual Friends +', 'Stranger'
  connection_color?: string; // 'dark-green', 'light-green', 'yellow', etc.
}

export interface FeedOptions {
  userId: string;
  limit?: number;
  offset?: number;
  userLocation?: { lat: number; lng: number };
  includePrivateReviews?: boolean;
  maxDistanceMiles?: number;
  feedType?: 'all' | 'friends' | 'friends_plus_one' | 'public_only';
  filters?: {
    genres?: string[];
    selectedCities?: string[];
    dateRange?: { from?: Date; to?: Date };
    daysOfWeek?: number[];
    filterByFollowing?: 'all' | 'following';
  };
}

export class UnifiedFeedService {
  /**
   * Fetch all feed items in unified format
   */
  static async getFeedItems(options: FeedOptions): Promise<UnifiedFeedItem[]> {
    const { userId, limit = 50, offset = 0, userLocation, includePrivateReviews = true, feedType = 'all', filters } = options;
    
    try {
      // Handle different feed types
      switch (feedType) {
        case 'friends':
        case 'friends_plus_one':
          // Use connection degree reviews (includes 1st, 2nd, and relevant 3rd degree)
          return await FriendsReviewService.getConnectionDegreeReviews(userId, limit, offset);
        
        case 'public_only':
          return await this.getPublicReviews(userId, limit);
        
        case 'all':
        default:
          return await this.getUnifiedFeed(options);
      }
    } catch (error) {
      console.error('Error fetching unified feed:', error);
      throw new Error(`Failed to fetch feed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get unified feed with all content types
   */
  private static async getUnifiedFeed(options: FeedOptions): Promise<UnifiedFeedItem[]> {
    const { userId, limit = 50, offset = 0, userLocation, includePrivateReviews = true, filters } = options;
    
    try {
      const feedItems: UnifiedFeedItem[] = [];
      
      // Fetch user's own reviews (private and public)
      if (includePrivateReviews) {
        const userReviews = await this.getUserReviews(userId);
        feedItems.push(...userReviews);
      }
      
      // Fetch reviews from connections (1st, 2nd, relevant 3rd degree)
      // This uses the connection_degree view which includes relevant connection reviews
      try {
        const connectionReviews = await FriendsReviewService.getConnectionDegreeReviews(userId, limit);
        feedItems.push(...connectionReviews);
      } catch (error) {
        console.warn('Error fetching connection degree reviews, falling back to public reviews:', error);
        // Fallback to public reviews if connection degree fails
        const publicReviews = await this.getPublicReviews(userId, limit);
        feedItems.push(...publicReviews);
      }
      
      // Fetch recent events (as "news" items) - NOW PERSONALIZED!
      const recentEvents = await this.getRecentEvents(userLocation, 20, userId, offset, filters);
      feedItems.push(...recentEvents);
      
      // Fetch friend activity
      const friendActivity = await this.getFriendActivity(userId, 10);
      feedItems.push(...friendActivity);
      
      // Deduplicate events by event ID (same event might appear as review + event)
      const deduplicatedItems = this.deduplicateFeedItems(feedItems);
      
      // Sort by relevance and recency
      const sortedItems = this.sortByRelevanceAndTime(deduplicatedItems, userLocation);

      // Enforce max 1 item per artist across the entire unified feed (all pages)
      const diverseItems = this.enforceArtistDiversity(sortedItems, 1);
      
      // Apply pagination
      return diverseItems.slice(offset, offset + limit);
      
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
      // First, fetch the user's profile to get their name and avatar
      const { data: profile } = await supabase
        .from('users')
        .select('name, avatar_url, verified, account_type')
        .eq('user_id', userId)
        .single();

      const { data: reviews, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('user_id', userId)
        .eq('is_draft', false)
        .neq('review_text', 'ATTENDANCE_ONLY')
        .not('review_text', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;

      const eventsById = await this.fetchEventsByIds(
        (reviews || []).map((review: any) => review.event_id).filter((id): id is string => !!id)
      );
      
      return (reviews || []).map((review: any) => {
        const event = review.event_id ? eventsById.get(review.event_id) : null;
        // Use the setlist from reviews if available, otherwise fall back to event setlist
        // Note: query returns events as an object (singular) not array
        const eventData = Array.isArray(review.events) ? review.events[0] : review.events;
        const setlistToUse = review.setlist || eventData?.setlist || event?.setlist;
        console.log('🎵 getUserReviews: Processing review:', {
          reviewId: review.id,
          hasUserReviewSetlist: !!review.setlist,
          hasEventSetlist: !!(eventData?.setlist || event?.setlist),
          setlistToUse: !!setlistToUse
        });
        
        return {
          id: `review-${review.id}`,
          type: 'review' as const,
          review_id: review.id,
          title: eventData?.title || event?.title || (review.is_public ? 'Your Public Review' : 'Your Private Review'),
          content: review.review_text || '',
          author: {
            id: userId,
            name: profile?.name || 'You',
            avatar_url: profile?.avatar_url,
            verified: profile?.verified,
            account_type: profile?.account_type
          },
          created_at: review.created_at,
          updated_at: review.updated_at,
          rating: review.rating,
          is_public: review.is_public,
          photos: (review as any).photos || undefined,
          setlist: setlistToUse || undefined,
          // Include all category ratings
          artist_performance_rating: (review as any).artist_performance_rating,
          production_rating: (review as any).production_rating,
          venue_rating: (review as any).venue_rating,
          location_rating: (review as any).location_rating,
          value_rating: (review as any).value_rating,
          artist_performance_feedback: (review as any).artist_performance_feedback,
          production_feedback: (review as any).production_feedback,
          venue_feedback: (review as any).venue_feedback,
          location_feedback: (review as any).location_feedback,
          value_feedback: (review as any).value_feedback,
          likes_count: review.likes_count || 0,
          comments_count: review.comments_count || 0,
          shares_count: review.shares_count || 0,
          event_info: {
            event_name: eventData?.title || event?.title || 'Concert Review',
            venue_name: eventData?.venue_name || event?.venue_name || 'Unknown Venue',
            event_date: (review as any).Event_date || (review as any).event_date || eventData?.event_date || event?.event_date || review.created_at,
            artist_name: eventData?.artist_name || event?.artist_name,
            artist_id: eventData?.artist_id || event?.artist_id
          },
          relevance_score: this.calculateReviewRelevance(review, true) // Higher score for own reviews
        };
      });
    } catch (error) {
      console.error('Error fetching user reviews:', error);
      return [];
    }
  }

  private static async fetchEventsByIds(eventIds: string[]): Promise<Map<string, any>> {
    const eventMap = new Map<string, any>();
    const uniqueIds = Array.from(new Set(eventIds));
    if (uniqueIds.length === 0) {
      return eventMap;
    }

    try {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, artist_name, artist_id, venue_name, venue_id, event_date, venue_city, venue_state, setlist')
        .in('id', uniqueIds);

      if (error) {
        console.warn('⚠️ Unable to load events for reviews:', error);
        return eventMap;
      }

      for (const event of data ?? []) {
        if (event.id) {
          eventMap.set(event.id, event);
        }
      }
    } catch (err) {
      console.warn('⚠️ Unexpected error while loading events for reviews:', err);
    }

    return eventMap;
  }

  private static async fetchUsersByIds(userIds: string[]): Promise<Map<string, any>> {
    const userMap = new Map<string, any>();
    const uniqueIds = Array.from(new Set(userIds));
    if (uniqueIds.length === 0) {
      return userMap;
    }

    try {
      const { data, error } = await supabase
        .from('users')
        .select('user_id, name, avatar_url, verified, account_type')
        .in('user_id', uniqueIds);

      if (error) {
        console.warn('⚠️ Unable to load users for reviews:', error);
        return userMap;
      }

      for (const user of data ?? []) {
        if (user.user_id) {
          userMap.set(user.user_id, user);
        }
      }
    } catch (err) {
      console.warn('⚠️ Unexpected error while loading users for reviews:', err);
    }

    return userMap;
  }
  
  /**
   * Get public reviews from community
   */
  private static async getPublicReviews(userId: string, limit: number): Promise<UnifiedFeedItem[]> {
    try {
      const { data: reviews, error } = await supabase
        .from('reviews')
        .select('*')
        .neq('user_id', userId)
        .eq('is_public', true)
        .eq('is_draft', false)
        .neq('review_text', 'ATTENDANCE_ONLY')
        .not('review_text', 'is', null)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      
      const eventsById = await this.fetchEventsByIds(
        (reviews || []).map((review: any) => review.event_id).filter((id): id is string => !!id)
      );

      const usersById = await this.fetchUsersByIds(
        (reviews || []).map((review: any) => review.user_id).filter((id): id is string => !!id)
      );
      
      return (reviews || []).map((review: any) => {
        const event = review.event_id ? eventsById.get(review.event_id) : null;
        const author = review.user_id ? usersById.get(review.user_id) : null;

        return ({
        id: `public-review-${review.id}`,
        type: 'review' as const,
        review_id: review.id,
        title: `${author?.name || 'Someone'}'s Review`,
        content: review.review_text || '',
        author: {
          id: review.user_id,
          name: author?.name || 'Anonymous',
          avatar_url: author?.avatar_url,
          verified: author?.verified,
          account_type: author?.account_type
        },
        created_at: review.created_at,
        rating: review.rating,
        is_public: true,
        photos: review.photos || undefined,
        setlist: event?.setlist || undefined,
        likes_count: review.likes_count || 0,
        comments_count: review.comments_count || 0,
        shares_count: review.shares_count || 0,
        event_info: {
          event_name: event?.title || 'Concert Review',
          venue_name: event?.venue_name || 'Unknown Venue',
          event_date: event?.event_date || review.created_at,
          artist_name: event?.artist_name,
          artist_id: review.artist_id
        },
        relevance_score: this.calculateReviewRelevance(review, false)
      });
      });
    } catch (error) {
      console.error('Error fetching public reviews:', error);
      return [];
    }
  }
  
  /**
   * Get recent events as feed items - NOW WITH PERSONALIZATION
   */
  private static async getRecentEvents(
    userLocation?: { lat: number; lng: number }, 
    limit: number = 20, 
    userId?: string,
    offset: number = 0,
    filters?: FeedOptions['filters']
  ): Promise<UnifiedFeedItem[]> {
    try {
      // Try personalized feed first if userId provided
      if (userId) {
        console.log('🎯 Attempting personalized feed for user:', userId);
        
        try {
          const personalizedEvents = await PersonalizedFeedService.getPersonalizedFeed(
            userId,
            limit,
            offset,
            false, // Only upcoming events
            filters // Pass filters to generate new personalized feed
          );
          
          // Check if we got events with valid scores
          // Empty array is valid when offset > 0 (means end of pagination)
          // But if offset = 0 and we get empty or events without scores, might indicate personalization issue
          const hasValidScores = personalizedEvents.length > 0 && 
            personalizedEvents.some(e => e.relevance_score !== undefined && e.relevance_score !== null);
          
          // Always use personalized feed if:
          // 1. We got events with scores (valid personalized feed)
          // 2. Empty array but offset > 0 (valid pagination - reached end)
          // 3. Empty array at offset = 0 but no error thrown (no personalized events exist, but function worked)
          // Only fallback if we got events but NO scores at offset = 0 (might indicate personalization failed)
          const shouldUsePersonalized = hasValidScores || 
            personalizedEvents.length === 0 ||  // Empty is valid (pagination or no results)
            offset > 0;  // Offset > 0 and empty is definitely valid pagination
          
          if (shouldUsePersonalized) {
            if (personalizedEvents.length > 0) {
              console.log('✅ Using PERSONALIZED feed:', {
                count: personalizedEvents.length,
                topScore: personalizedEvents[0]?.relevance_score,
                topArtist: (personalizedEvents[0] as any)?.artist_name,
                hasScores: hasValidScores,
                scores: personalizedEvents.slice(0, 5).map(e => ({
                  artist: (e as any).artist_name,
                  score: e.relevance_score
                }))
              });
            } else {
              console.log('✅ Using PERSONALIZED feed (empty - end of results at this offset):', {
                offset,
                limit,
                reason: offset > 0 ? 'pagination' : 'no personalized events available'
              });
            }
            
            return personalizedEvents.map(event => this.transformPersonalizedEventToFeedItem(event, userLocation));
          } else {
            // Got events at offset 0 but no scores - personalization might have failed
            // But still return them to avoid falling back unnecessarily - scores might be null/0 but still personalized
            console.warn('⚠️ Personalized feed returned events without scores at offset 0. Using anyway (scores may be 0/null but still personalized).');
            return personalizedEvents.map(event => this.transformPersonalizedEventToFeedItem(event, userLocation));
          }
        } catch (error) {
          console.warn('⚠️ Personalized feed failed, falling back to standard:', error);
        }
      }
      
      // Fallback: standard event loading (non-personalized)
      console.log('📋 Using STANDARD feed (no personalization)');
      let query = supabase
        .from('events')
        .select('*')
        .gte('event_date', new Date().toISOString())
        .order('event_date', { ascending: true });
      
      // Always fetch more than needed to ensure we get at least the limit
      const fetchLimit = Math.max(limit * 2, 40); // Fetch at least 40 or double the limit
      
      if (userLocation) {
        query = query.limit(fetchLimit);
      } else {
        query = query.limit(fetchLimit);
      }
      
      const { data: initialEvents, error } = await query;
      
      if (error) throw error;
      
      // Ensure we have at least the requested limit
      let finalEvents = initialEvents || [];
      if (finalEvents.length < limit && offset === 0) {
        console.log(`⚠️ Standard feed: Only got ${finalEvents.length} events, fetching more to reach ${limit}...`);
        // Try fetching even more
        const { data: moreEvents } = await supabase
          .from('events')
          .select('*')
          .gte('event_date', new Date().toISOString())
          .order('event_date', { ascending: true })
          .limit(limit * 3);
        
        if (moreEvents && moreEvents.length > finalEvents.length) {
          finalEvents = moreEvents;
          console.log(`✅ Standard feed: Got ${finalEvents.length} events from expanded query`);
        }
      }
      
      let eventItems = (finalEvents || []).map(event => {
        const item: UnifiedFeedItem = {
          id: `event-${event.id}`,
          type: 'event' as const,
          title: event.title,
          content: event.description || `${event.artist_name} is performing at ${event.venue_name}`,
          author: {
            id: 'system',
            name: '',
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
            ticket_urls: event.ticket_urls || (event.ticket_url ? [event.ticket_url] : []),
            setlist: event.setlist,
            setlist_enriched: event.setlist_enriched,
            setlist_song_count: event.setlist_song_count,
            setlist_fm_id: event.setlist_fm_id,
            setlist_fm_url: event.setlist_fm_url,
            tour_name: event.tour_name,
            created_at: event.created_at,
            updated_at: event.updated_at,
            // Add price fields as any to avoid type errors
            ...(event.price_min && { ticket_price_min: event.price_min }),
            ...(event.price_max && { ticket_price_max: event.price_max }),
            ...(event.ticket_url && { ticket_url: event.ticket_url }),
            ...(event.price_min && { price_min: event.price_min }),
            ...(event.price_max && { price_max: event.price_max }),
          } as any,
          event_info: {
            event_name: event.title,
            venue_name: event.venue_name,
            event_date: event.event_date,
            artist_name: event.artist_name,
            artist_id: event.artist_id
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
          .filter(item => !item.distance_miles || item.distance_miles <= 50)
          .slice(0, limit);
      }
      
      return eventItems;
    } catch (error) {
      console.error('Error fetching recent events:', error);
      return [];
    }
  }
  
  /**
   * Transform PersonalizedEvent to UnifiedFeedItem
   */
  private static transformPersonalizedEventToFeedItem(event: PersonalizedEvent, userLocation?: { lat: number; lng: number }): UnifiedFeedItem {
    // Preserve all properties including ticket_price_min/max and ticket_url
    // PersonalizedEvent extends JamBaseEvent which has all required properties
    const eventId = (event as any).id || (event as any).event_id || (event as any).jambase_event_id;
    const eventData = {
      ...(event as any),
      // Ensure ID is explicitly set (critical for deduplication)
      id: eventId,
      // Ensure ticket_price fields and ticket_url are explicitly included
      ticket_price_min: (event as any).ticket_price_min ?? null,
      ticket_price_max: (event as any).ticket_price_max ?? null,
      ticket_url: (event as any).ticket_url ?? null,
    } as JamBaseEventResponse;
    
    const item: UnifiedFeedItem = {
      id: `event-${eventId || 'unknown'}`,
      type: 'event' as const,
      title: (event as any).title,
      content: (event as any).description || `${(event as any).artist_name} is performing at ${(event as any).venue_name}`,
      author: {
        id: 'system',
        name: '',
        avatar_url: undefined
      },
      created_at: (event as any).created_at,
      event_data: eventData,
      event_info: {
        event_name: (event as any).title,
        venue_name: (event as any).venue_name,
        event_date: (event as any).event_date,
        artist_name: (event as any).artist_name,
        artist_id: (event as any).artist_id || undefined
      },
      location: (event as any).latitude && (event as any).longitude ? {
        lat: Number((event as any).latitude),
        lng: Number((event as any).longitude),
        venue_name: (event as any).venue_name,
        venue_address: (event as any).venue_address || undefined
      } : undefined,
      relevance_score: (event.relevance_score || 0) / 100 // Normalize 0-100 to 0-1
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
  }
  
  /**
   * Get friend activity (new friendships, friend reviews, etc.)
   */
  private static async getFriendActivity(userId: string, limit: number): Promise<UnifiedFeedItem[]> {
    try {
      // Get recent friend relationships from user_relationships table (3NF compliant)
      const { data: friendships, error } = await supabase
        .from('user_relationships')
        .select('id, user_id, related_user_id, created_at')
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .or(`user_id.eq.${userId},related_user_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      
      // If no friendships found, return empty array
      if (!friendships || friendships.length === 0) {
        return [];
      }

      // Get profile information for all friend user IDs
      const allFriendIds = friendships.map(friendship => 
        friendship.user_id === userId ? friendship.related_user_id : friendship.user_id
      );
      
      const { data: profiles, error: profileError } = await supabase
        .from('users')
        .select('user_id, name, avatar_url')
        .in('user_id', allFriendIds);

      if (profileError) {
        console.error('Error fetching friend profiles:', profileError);
        return [];
      }

      // Create a map of user_id to profile for quick lookup
      const profileMap = new Map(profiles?.map(profile => [profile.user_id, profile]) || []);

      return friendships.map(friendship => {
        const otherUserId = friendship.user_id === userId ? friendship.related_user_id : friendship.user_id;
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
  
  /**
   * Deduplicate feed items by event ID
   * If the same event appears multiple times (e.g., as an event item),
   * keep only the first occurrence (maintains order)
   */
  private static deduplicateFeedItems(items: UnifiedFeedItem[]): UnifiedFeedItem[] {
    const seen = new Set<string>();
    const uniqueItems: UnifiedFeedItem[] = [];
    const duplicates: string[] = [];
    
    for (const item of items) {
      // For event items, use the event ID as the key
      let key: string | null = null;
      
      // Primary: use event_data.id if available
      if (item.type === 'event' && item.event_data?.id) {
        key = `id-${String(item.event_data.id)}`;
      }
      
      // Fallback: create normalized key from artist + venue + date
      if (!key && item.type === 'event') {
        const artistName = (item.event_info?.artist_name || item.title || '').toLowerCase()
          .trim()
          .replace(/\s+/g, ' ')
          .replace(/[^\w\s]/g, ''); // Remove special chars
        
        const venueName = (item.event_info?.venue_name || item.event_data?.venue_name || '').toLowerCase()
          .trim()
          .replace(/\s+/g, ' ')
          .replace(/\bthe\s+/gi, '') // Remove "the"
          .replace(/\bo2\s+/gi, '') // Remove "o2" prefix
          .replace(/[^\w\s]/g, ''); // Remove special chars
        
        const eventDate = item.event_info?.event_date 
          ? item.event_info.event_date.split('T')[0] 
          : (item.event_data?.event_date 
            ? item.event_data.event_date.split('T')[0] 
            : '');
        
        if (artistName && venueName && eventDate) {
          key = `match-${artistName}|${venueName}|${eventDate}`;
        }
      }
      
      // Items without event info (reviews without events, friend activity, etc.) are always kept
      if (!key) {
        uniqueItems.push(item);
        continue;
      }
      
      // Only add if we haven't seen this event before
      if (!seen.has(key)) {
        seen.add(key);
        uniqueItems.push(item);
      } else {
        // Duplicate detected
        duplicates.push(key);
        const title = item.event_info?.event_name || item.title || 'Unknown';
        console.log(`🔄 Duplicate event filtered: ${title} (key: ${key})`);
      }
    }
    
    if (duplicates.length > 0) {
      console.log(`✅ Deduplication: Removed ${duplicates.length} duplicate event(s) from feed`);
    }
    
    return uniqueItems;
  }

  /**
   * Enforce a maximum number of items per artist across the entire unified feed
   * Applies to any item that has an associated artist (events and reviews with event_info)
   * Items without an artist are always kept
   */
  private static enforceArtistDiversity(items: UnifiedFeedItem[], maxPerArtist: number): UnifiedFeedItem[] {
    const counts = new Map<string, number>();
    const result: UnifiedFeedItem[] = [];

    for (const item of items) {
      // Extract artist name from event_info or event_data if present
      const rawArtist = (item.event_info?.artist_name || (item.event_data as any)?.artist_name || '').toString();

      // If no artist associated, always include
      if (!rawArtist) {
        result.push(item);
        continue;
      }

      // Normalize artist key for consistent counting
      const artistKey = rawArtist
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^[\w\s]]/g, '');

      const current = counts.get(artistKey) || 0;
      if (current < maxPerArtist) {
        result.push(item);
        counts.set(artistKey, current + 1);
      }
      // else: skip to enforce cap globally across all pages
    }

    return result;
  }
}
