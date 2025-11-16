import { supabase } from '@/integrations/supabase/client';
import { UnifiedFeedItem } from './unifiedFeedService';

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
      // First get the user's friends from relationships table
      const { data: friends, error: friendsError } = await supabase
        .from('relationships')
        .select('user_id, related_entity_id')
        .eq('related_entity_type', 'user')
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .or(`user_id.eq.${userId},related_entity_id.eq.${userId}`);

      if (friendsError) throw friendsError;

      if (!friends || friends.length === 0) {
        return []; // No friends, no reviews
      }

      // Extract friend user IDs
      const friendIds = friends.map(f => 
        f.user_id === userId ? f.related_entity_id : f.user_id
      );

      // Get reviews from friends
      const { data: reviews, error } = await supabase
        .from('reviews')
        .select(`
          *,
          user:users!reviews_user_id_fkey (
            name,
            avatar_url
          ),
          event:events (
            title,
            artist_name,
            venue_name,
            event_date,
            venue_city,
            venue_state,
            artist_id,
            venue_id
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

      return (reviews || []).map((review: any) => ({
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
        event_info: {
          event_name: review.event?.title || 'Concert Review',
          venue_name: review.event?.venue_name || 'Unknown Venue',
          event_date: review.event?.event_date || review.created_at,
          artist_name: review.event?.artist_name,
          artist_id: review.event?.artist_id
        },
        relevance_score: this.calculateFriendReviewRelevance(review, 1) // Direct friend = higher score
      }));
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
      // Get user's friends from relationships table
      const { data: friends, error: friendsError } = await supabase
        .from('relationships')
        .select('user_id, related_entity_id')
        .eq('related_entity_type', 'user')
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .or(`user_id.eq.${userId},related_entity_id.eq.${userId}`);

      if (friendsError) throw friendsError;

      if (!friends || friends.length === 0) {
        return []; // No friends, no reviews
      }

      // Extract direct friend IDs
      const directFriendIds = friends.map(f => 
        f.user_id === userId ? f.related_entity_id : f.user_id
      );

      // Get friends of friends
      const { data: friendsOfFriends, error: fofError } = await supabase
        .from('relationships')
        .select('user_id, related_entity_id')
        .eq('related_entity_type', 'user')
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .in('user_id', directFriendIds);

      if (fofError) throw fofError;

      // Extract friends of friends IDs (excluding direct friends)
      const friendsOfFriendsIds = (friendsOfFriends || [])
        .map(f => f.user_id === userId ? f.related_entity_id : f.user_id)
        .filter(id => !directFriendIds.includes(id) && id !== userId);

      // Combine all friend IDs (direct friends + friends of friends)
      const allFriendIds = [...directFriendIds, ...friendsOfFriendsIds];

      if (allFriendIds.length === 0) {
        return [];
      }

      // Get reviews from all friends
      const { data: reviews, error } = await supabase
        .from('reviews')
        .select(`
          *,
          user:users!reviews_user_id_fkey (
            name,
            avatar_url
          ),
          event:events (
            title,
            artist_name,
            venue_name,
            event_date,
            venue_city,
            venue_state,
            artist_id,
            venue_id
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
            event_name: review.jambase_events?.title || 'Concert Review',
            venue_name: review.jambase_events?.venue_name || 'Unknown Venue',
            event_date: review.jambase_events?.event_date || review.created_at,
            artist_name: review.jambase_events?.artist_name,
            artist_id: review.jambase_events?.artist_id
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
        .from('relationships')
        .select('*', { count: 'exact', head: true })
        .eq('related_entity_type', 'user')
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .or(`user_id.eq.${userId},related_entity_id.eq.${userId}`);

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
        .from('relationships')
        .select('id')
        .eq('related_entity_type', 'user')
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .or(`and(user_id.eq.${userId1},related_entity_id.eq.${userId2}),and(user_id.eq.${userId2},related_entity_id.eq.${userId1})`)
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
      // Use the RPC function or query the view directly
      const { data, error } = await supabase
        .rpc('get_connection_degree_reviews', {
          p_user_id: userId,
          p_limit: limit,
          p_offset: offset
        });

      if (error) {
        // Fallback: query the view directly (if it exists)
        console.warn('RPC function failed, trying direct view query:', error);
        try {
          const { data: viewData, error: viewError } = await supabase
            .from('reviews_with_connection_degree')
            .select('*')
            .order('connection_degree', { ascending: true })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

          if (viewError) {
            console.warn('View query also failed, returning empty array:', viewError);
            return [];
          }

          return (viewData || []).map((review: any) => this.transformConnectionReview(review));
        } catch (viewErr) {
          console.warn('Error querying view, returning empty array:', viewErr);
          return [];
        }
      }

      return (data || []).map((review: any) => this.transformConnectionReview(review));
    } catch (error) {
      console.error('Error fetching connection degree reviews:', error);
      return [];
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
        event_date: review.event_date || review.created_at,
        artist_name: review.artist_name,
        artist_id: review.artist_id
      },
      connection_degree: review.connection_degree,
      connection_type_label: review.connection_type_label, // 'Friend', 'Mutual Friend', 'Mutual Friends +', 'Stranger'
      connection_color: (review as any).connection_color, // Color for badge styling
      relevance_score: this.calculateFriendReviewRelevance(review, review.connection_degree || 3)
    };
  }
}
