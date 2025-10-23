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
      // First get the user's friends
      const { data: friends, error: friendsError } = await supabase
        .from('friends')
        .select('user1_id, user2_id')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

      if (friendsError) throw friendsError;

      if (!friends || friends.length === 0) {
        return []; // No friends, no reviews
      }

      // Extract friend user IDs
      const friendIds = friends.map(f => 
        f.user1_id === userId ? f.user2_id : f.user1_id
      );

      // Get reviews from friends
      const { data: reviews, error } = await supabase
        .from('user_reviews')
        .select(`
          *,
          profiles:user_id (
            name,
            avatar_url
          ),
          jambase_events:event_id (
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
        title: `${review.profiles?.name || 'Friend'}'s Review`,
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
      // Get user's friends
      const { data: friends, error: friendsError } = await supabase
        .from('friends')
        .select('user1_id, user2_id')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

      if (friendsError) throw friendsError;

      if (!friends || friends.length === 0) {
        return []; // No friends, no reviews
      }

      // Extract direct friend IDs
      const directFriendIds = friends.map(f => 
        f.user1_id === userId ? f.user2_id : f.user1_id
      );

      // Get friends of friends
      const { data: friendsOfFriends, error: fofError } = await supabase
        .from('friends')
        .select('user1_id, user2_id')
        .in('user1_id', directFriendIds);

      if (fofError) throw fofError;

      // Extract friends of friends IDs (excluding direct friends)
      const friendsOfFriendsIds = (friendsOfFriends || [])
        .map(f => f.user1_id === userId ? f.user2_id : f.user1_id)
        .filter(id => !directFriendIds.includes(id) && id !== userId);

      // Combine all friend IDs (direct friends + friends of friends)
      const allFriendIds = [...directFriendIds, ...friendsOfFriendsIds];

      if (allFriendIds.length === 0) {
        return [];
      }

      // Get reviews from all friends
      const { data: reviews, error } = await supabase
        .from('user_reviews')
        .select(`
          *,
          profiles:user_id (
            name,
            avatar_url
          ),
          jambase_events:event_id (
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
          title: `${review.profiles?.name || 'Friend'}'s Review`,
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
        .from('friends')
        .select('*', { count: 'exact', head: true })
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

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
        .from('friends')
        .select('id')
        .or(`and(user1_id.eq.${userId1},user2_id.eq.${userId2}),and(user1_id.eq.${userId2},user2_id.eq.${userId1})`)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return !!data;
    } catch (error) {
      console.error('Error checking friendship:', error);
      return false;
    }
  }
}
