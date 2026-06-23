import { supabase } from '@/integrations/supabase/client';
import { UnifiedFeedItem } from './unifiedFeedService';
import { cacheService, CacheKeys, CacheTTL } from './cacheService';

export class FriendsReviewService {
  /**
   * Get reviews from direct friends only
   */
  static async getFriendsReviews(
    userId: string, 
    limit: number = 20,
    offset: number = 0
  ): Promise<UnifiedFeedItem[]> {
    try {
      // First get the user's friends from user_relationships table (3NF compliant)
      const { data: friends, error: friendsError } = await supabase
        .from('user_relationships')
        .select('user_id, related_user_id')
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .or(`user_id.eq.${userId},related_user_id.eq.${userId}`);

      if (friendsError) throw friendsError;

      if (!friends || friends.length === 0) {
        return []; // No friends, no reviews
      }

      // Extract friend user IDs
      const friendIds = friends.map(f => 
        f.user_id === userId ? f.related_user_id : f.user_id
      );

      // Get reviews from friends with automatic joins via foreign keys
      const { data: reviews, error } = await supabase
        .from('reviews')
        .select(`
          *,
          user:users!reviews_user_id_fkey (
            name,
            avatar_url,
            verified,
            account_type
          ),
          events (
            id,
            title,
            venue_name,
            event_date,
            artist_name,
            artist_id
          )
        `)
        .in('user_id', friendIds)
        .eq('is_public', true)
        .eq('is_draft', false)
        .neq('review_text', 'ATTENDANCE_ONLY')
        .not('review_text', 'is', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return (reviews || []).map((review: any) => {
        const event = review.events;
        return {
        id: `friends-review-${review.id}`,
        type: 'review' as const,
        review_id: review.id,
        title: `${review.user?.name || 'Friend'}'s Review`,
        content: review.review_text || '',
        author: {
          id: review.user_id,
          name: review.user?.name || 'Anonymous',
          avatar_url: review.user?.avatar_url
        },
        created_at: review.created_at,
        updated_at: review.updated_at,
        rating: review.rating,
        is_public: true,
        photos: review.photos || undefined,
        setlist: review.setlist || undefined,
        likes_count: review.likes_count || 0,
        comments_count: review.comments_count || 0,
        shares_count: review.shares_count || 0,
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
        event_info: {
          event_name: event?.title || 'Concert Review',
          venue_name: event?.venue_name || 'Unknown Venue',
          event_date: event?.event_date || review.created_at,
          artist_name: event?.artist_name,
          artist_id: event?.artist_id
        },
        relevance_score: this.calculateFriendReviewRelevance(review, 1) // Direct friend = higher score
      };
      });
    } catch (error) {
      console.error('Error fetching friends reviews:', error);
      return [];
    }
  }

  /**
   * Get reviews from friends and friends of friends
   */
  static async getFriendsPlusOneReviews(
    userId: string, 
    limit: number = 20,
    offset: number = 0
  ): Promise<UnifiedFeedItem[]> {
    try {
      // Get user's friends from user_relationships table (3NF compliant)
      const { data: friends, error: friendsError } = await supabase
        .from('user_relationships')
        .select('user_id, related_user_id')
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .or(`user_id.eq.${userId},related_user_id.eq.${userId}`);

      if (friendsError) throw friendsError;

      if (!friends || friends.length === 0) {
        return []; // No friends, no reviews
      }

      // Extract direct friend IDs
      const directFriendIds = friends.map(f => 
        f.user_id === userId ? f.related_user_id : f.user_id
      );

      // Get friends of friends
      const { data: friendsOfFriends, error: fofError } = await supabase
        .from('user_relationships')
        .select('user_id, related_user_id')
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .in('user_id', directFriendIds);

      if (fofError) throw fofError;

      // Extract friends of friends IDs (excluding direct friends)
      const friendsOfFriendsIds = (friendsOfFriends || [])
        .map(f => f.user_id === userId ? f.related_user_id : f.user_id)
        .filter(id => !directFriendIds.includes(id) && id !== userId);

      // Combine all friend IDs (direct friends + friends of friends)
      const allFriendIds = [...directFriendIds, ...friendsOfFriendsIds];

      if (allFriendIds.length === 0) {
        return [];
      }

      // Get reviews from all friends with automatic joins via foreign keys
      const { data: reviews, error } = await supabase
        .from('reviews')
        .select(`
          *,
          user:users!reviews_user_id_fkey (
            name,
            avatar_url,
            verified,
            account_type
          ),
          events (
            id,
            title,
            venue_name,
            event_date,
            artist_name,
            artist_id
          )
        `)
        .in('user_id', allFriendIds)
        .eq('is_public', true)
        .eq('is_draft', false)
        .neq('review_text', 'ATTENDANCE_ONLY')
        .not('review_text', 'is', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return (reviews || []).map((review: any) => {
        const isDirectFriend = directFriendIds.includes(review.user_id);
        const connectionDegree = isDirectFriend ? 1 : 2;
        const event = review.events;
        
        return {
          id: `friends-plus-one-review-${review.id}`,
          type: 'review' as const,
          review_id: review.id,
          title: `${review.user?.name || 'Friend'}'s Review`,
          content: review.review_text || '',
          author: {
            id: review.user_id,
            name: review.profiles?.name || 'Anonymous',
            avatar_url: review.profiles?.avatar_url
          },
          created_at: review.created_at,
          updated_at: review.updated_at,
          rating: review.rating,
          is_public: true,
          photos: review.photos || undefined,
          setlist: review.setlist || undefined,
          likes_count: review.likes_count || 0,
          comments_count: review.comments_count || 0,
          shares_count: review.shares_count || 0,
          event_info: {
            event_name: event?.title || 'Concert Review',
            venue_name: event?.venue_name || 'Unknown Venue',
            event_date: event?.event_date || review.created_at,
            artist_name: event?.artist_name,
            artist_id: event?.artist_id
          },
          relevance_score: this.calculateFriendReviewRelevance(review, connectionDegree)
        };
      });
    } catch (error) {
      console.error('Error fetching friends plus one reviews:', error);
      return [];
    }
  }

  /**
   * Get friend activity (recent reviews from friends)
   */
  static async getFriendActivity(
    userId: string, 
    limit: number = 10
  ): Promise<UnifiedFeedItem[]> {
    try {
      // Get recent reviews from friends
      const friendsReviews = await this.getFriendsReviews(userId, Math.floor(limit * 0.7), 0);
      
      // Get recent friend requests accepted notifications
      const { data: friendActivity, error } = await supabase
        .from('notifications')
        .select('id, type, title, message, data, created_at')
        .eq('user_id', userId)
        .in('type', ['friend_accepted'])
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('Error fetching friend notifications:', error);
        // Don't throw, just return friends reviews
        return friendsReviews.slice(0, limit);
      }

      const activityItems: UnifiedFeedItem[] = [...friendsReviews];
      
      // Add friend acceptance notifications (simplified without profile joins)
      if (friendActivity && friendActivity.length > 0) {
        friendActivity.forEach(notification => {
          activityItems.push({
            id: `friend-activity-${notification.id}`,
            type: 'friend_activity' as const,
            title: notification.title,
            content: notification.message,
            author: {
              id: 'system',
              name: 'Synth',
              avatar_url: undefined
            },
            created_at: notification.created_at,
            relevance_score: 0.8 // High relevance for friend activity
          });
        });
      }

      return activityItems.slice(0, limit);
    } catch (error) {
      console.error('Error fetching friend activity:', error);
      return [];
    }
  }

  /**
   * Calculate relevance score for friend reviews
   */
  private static calculateFriendReviewRelevance(review: any, connectionDegree: number): number {
    let score = 0.5; // Base score

    // Higher score for closer connections
    if (connectionDegree === 1) {
      score += 0.4; // Direct friends get higher relevance
    } else if (connectionDegree === 2) {
      score += 0.2; // Friends of friends get medium relevance
    }

    // Boost score for recent reviews
    const daysSinceReview = Math.floor((Date.now() - new Date(review.created_at).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceReview <= 7) score += 0.2;
    else if (daysSinceReview <= 30) score += 0.1;

    // Boost score for reviews with content
    if (review.review_text && review.review_text.length > 50) score += 0.1;

    // Boost score for reviews with photos
    if (review.photos && review.photos.length > 0) score += 0.1;

    // Boost score for higher ratings (people like seeing positive reviews)
    if (review.rating >= 4) score += 0.1;

    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Get friend count for a user
   */
  static async getFriendCount(userId: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('user_relationships')
        .select('*', { count: 'exact', head: true })
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .or(`user_id.eq.${userId},related_user_id.eq.${userId}`);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error getting friend count:', error);
      return 0;
    }
  }

  /**
   * Check if two users are friends
   */
  static async areFriends(userId1: string, userId2: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('user_relationships')
        .select('id')
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .or(`and(user_id.eq.${userId1},related_user_id.eq.${userId2}),and(user_id.eq.${userId2},related_user_id.eq.${userId1})`)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return !!data;
    } catch (error) {
      console.error('Error checking friendship:', error);
      return false;
    }
  }

  /**
   * Get reviews from 1st, 2nd, and relevant 3rd degree connections
   * Uses the reviews_with_connection_degree view created by SQL
   */
  static async getConnectionDegreeReviews(
    userId: string, 
    limit: number = 20,
    offset: number = 0
  ): Promise<UnifiedFeedItem[]> {
    try {
      // Check cache first (only for first page to avoid stale pagination)
      if (offset === 0) {
        const cacheKey = CacheKeys.reviews(userId, limit, offset);
        const cached = cacheService.get<UnifiedFeedItem[]>(cacheKey);
        if (cached) {
          return cached;
        }
      }

      // Use the RPC function or query the view directly
      const { data, error } = await supabase
        .rpc('get_connection_degree_reviews', {
          p_user_id: userId,
          p_limit: limit,
          p_offset: offset
        });

      if (error) {
        // Fallback: Query reviews directly using connection degree functions
        console.warn('⚠️ RPC function get_connection_degree_reviews failed, using direct query with connection functions');
        console.warn('Error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
        });
        
        try {
          // Get 1st and 2nd degree connections using RPC functions
          const [firstDegreeResult, secondDegreeResult] = await Promise.all([
            supabase.rpc('get_first_degree_connections', { target_user_id: userId }),
            supabase.rpc('get_second_degree_connections', { target_user_id: userId }),
          ]);

          const firstDegreeIds = (firstDegreeResult.data || []).map((c: any) => c.connected_user_id);
          const secondDegreeIds = (secondDegreeResult.data || []).map((c: any) => c.connected_user_id);
          const allConnectionIds = [...firstDegreeIds, ...secondDegreeIds];

          if (allConnectionIds.length === 0) {
            return [];
          }

          // Query reviews from connections
          const { data: reviewsData, error: reviewsError } = await supabase
            .from('reviews')
            .select(`
              *,
              users:user_id (
                user_id,
                name,
                avatar_url,
                verified,
                account_type
              ),
              events (
                id,
                title,
                venue_name,
                event_date,
                artist_name
              )
            `)
            .in('user_id', allConnectionIds)
            .eq('is_public', true)
            .eq('is_draft', false)
            .not('review_text', 'is', null)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

          if (reviewsError) {
            console.warn('Direct reviews query failed, returning empty array:', reviewsError);
            return [];
          }

          // Transform to UnifiedFeedItem format with connection degree
          return (reviewsData || []).map((review: any) => {
            const connectionDegree = firstDegreeIds.includes(review.user_id) ? 1 : 2;
            const user = review.users || {};
            const event = review.events || {};
            
            return {
              id: `review-${review.id}`,
              type: 'review' as const,
              review_id: review.id,
              title: `${user.name || 'User'}'s Review`,
              content: review.review_text || '',
              author: {
                id: review.user_id,
                name: user.name || 'Anonymous',
                avatar_url: user.avatar_url,
                verified: user.verified,
                account_type: user.account_type,
              },
              created_at: review.created_at,
              updated_at: review.updated_at,
              rating: review.rating,
              is_public: review.is_public,
              photos: review.photos || undefined,
              setlist: review.setlist || undefined,
              likes_count: review.likes_count || 0,
              comments_count: review.comments_count || 0,
              shares_count: review.shares_count || 0,
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
              event_info: {
                event_name: event.title || 'Concert Review',
                venue_name: event.venue_name || 'Unknown Venue',
                event_date: event.event_date || review.created_at,
                artist_name: event.artist_name,
                artist_id: event.artist_id,
              },
              connection_degree: connectionDegree,
              connection_type_label: connectionDegree === 1 ? 'Friend' : 'Mutual Friend',
              relevance_score: this.calculateFriendReviewRelevance(review, connectionDegree),
            } as UnifiedFeedItem;
          });
        } catch (fallbackErr) {
          console.warn('Error in fallback query, returning empty array:', fallbackErr);
          return [];
        }
      }

      const reviews = (data || []).map((review: any) => this.transformConnectionReview(review));
      
      // Cache the results (only for first page)
      if (offset === 0) {
        const cacheKey = CacheKeys.reviews(userId, limit, offset);
        cacheService.set(cacheKey, reviews, CacheTTL.REVIEWS);
      }
      
      return reviews;
    } catch (error) {
      console.error('Error fetching connection degree reviews:', error);
      return this.getFriendsPlusOneReviews(userId, limit, offset);
    }
  }

  /**
   * Transform review from connection_degree view to UnifiedFeedItem
   */
  private static transformConnectionReview(review: any): UnifiedFeedItem {
    return {
      id: `connection-review-${review.review_id}`,
      type: 'review' as const,
      review_id: review.review_id,
      title: `${review.reviewer_name || 'User'}'s Review`,
      content: review.review_text || review.content || '',
      author: {
        id: review.reviewer_id,
        name: review.reviewer_name || 'Anonymous',
        avatar_url: review.reviewer_avatar,
        verified: review.reviewer_verified,
        account_type: review.reviewer_account_type
      },
      created_at: review.created_at,
      updated_at: review.updated_at,
      rating: review.rating,
      is_public: review.is_public,
      photos: review.photos || undefined,
      setlist: review.setlist || undefined,
      likes_count: review.likes_count || 0,
      comments_count: review.comments_count || 0,
      shares_count: review.shares_count || 0,
      event_info: {
        event_name: review.event_title || 'Concert Review',
        venue_name: review.venue_name || 'Unknown Venue',
        event_date: (review as any).Event_date || (review as any).event_date || review.event_date || review.created_at,
        artist_name: review.artist_name,
        artist_id: review.artist_id
      },
      connection_degree: review.connection_degree,
      connection_type_label: review.connection_type_label, // 'Friend', 'Mutual Friend', 'Mutual Friends +', 'Stranger'
      connection_color: (review as any).connection_color, // Color for badge styling
      relevance_score: this.calculateFriendReviewRelevance(review, review.connection_degree || 3)
    };
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
        .select('id, title, artist_name, artist_id, venue_name, venue_id, event_date, venue_city, venue_state')
        .in('id', uniqueIds);

      if (error) {
        console.warn('⚠️ Unable to load events for friend reviews:', error);
        return eventMap;
      }

      for (const event of data ?? []) {
        if (event.id) {
          eventMap.set(event.id, event);
        }
      }
    } catch (err) {
      console.warn('⚠️ Unexpected error while loading events for friend reviews:', err);
    }

    return eventMap;
  }
}
