import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

// Review system types with venue support
export interface ReviewData {
  rating?: number; // Overall rating (calculated automatically)
  artist_rating?: number; // Rating for the artist/performance
  venue_rating?: number; // Rating for the venue
  review_type: 'event' | 'venue' | 'artist'; // Type of review
  review_text?: string;
  reaction_emoji?: string;
  is_public?: boolean;
  venue_tags?: string[]; // Venue-specific tags
  artist_tags?: string[]; // Artist-specific tags
}

export interface UserReview {
  id: string;
  user_id: string;
  event_id: string;
  venue_id?: string;
  rating: number;
  artist_rating?: number;
  venue_rating?: number;
  review_type: 'event' | 'venue' | 'artist';
  reaction_emoji?: string;
  review_text?: string;
  photos?: string[];
  videos?: string[];
  mood_tags?: string[];
  genre_tags?: string[];
  context_tags?: string[];
  venue_tags?: string[];
  artist_tags?: string[];
  likes_count: number;
  comments_count: number;
  shares_count: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicReviewWithProfile extends UserReview {
  reviewer_name: string;
  reviewer_avatar?: string;
  event_title?: string;
  artist_name?: string;
  venue_name?: string;
  event_date?: string;
  venue_profile_name?: string;
  venue_address?: any;
}

export interface VenueStats {
  total_reviews: number;
  average_venue_rating: number;
  average_artist_rating: number;
  average_overall_rating: number;
  rating_distribution: {
    '1_star': number;
    '2_star': number;
    '3_star': number;
    '4_star': number;
    '5_star': number;
  };
}

export interface TagCount {
  tag: string;
  count: number;
}

// Legacy type definitions for backwards compatibility
export type UserReviewInsert = TablesInsert<'user_reviews'>;
export type UserReviewUpdate = TablesUpdate<'user_reviews'>;

export type ReviewLike = Tables<'review_likes'>;
export type ReviewLikeInsert = TablesInsert<'review_likes'>;

export type ReviewComment = Tables<'review_comments'>;
export type ReviewCommentInsert = TablesInsert<'review_comments'>;
export type ReviewCommentUpdate = TablesUpdate<'review_comments'>;

export type ReviewShare = Tables<'review_shares'>;
export type ReviewShareInsert = TablesInsert<'review_shares'>;

// Review with engagement data
export interface ReviewWithEngagement extends UserReview {
  is_liked_by_user?: boolean;
  user_like_id?: string;
  recent_comments?: ReviewComment[];
  total_comments?: number;
}

// Comment with user data
export interface CommentWithUser extends ReviewComment {
  user: {
    id: string;
    name: string;
    avatar_url?: string;
  };
}

// Pre-defined tag options for consistent tagging
export const VENUE_TAGS = [
  'excellent-sound',
  'poor-sound',
  'great-staff',
  'rude-staff',
  'clean-facilities',
  'dirty-facilities',
  'easy-parking',
  'no-parking',
  'accessible',
  'not-accessible',
  'good-drinks',
  'expensive-drinks',
  'great-food',
  'no-food',
  'spacious',
  'cramped',
  'good-sightlines',
  'obstructed-view',
  'air-conditioned',
  'too-hot',
  'well-organized',
  'chaotic',
] as const;

export const ARTIST_TAGS = [
  'amazing-performance',
  'disappointing-performance',
  'high-energy',
  'low-energy',
  'great-setlist',
  'boring-setlist',
  'excellent-vocals',
  'poor-vocals',
  'great-stage-presence',
  'no-stage-presence',
  'interactive',
  'distant',
  'on-time',
  'very-late',
  'good-sound-mix',
  'bad-sound-mix',
  'played-hits',
  'no-hits',
  'long-set',
  'short-set',
] as const;

export type VenueTag = typeof VENUE_TAGS[number];
export type ArtistTag = typeof ARTIST_TAGS[number];

export class ReviewService {
  /**
   * Create or update a review for an event, venue, or artist
   */
  static async setEventReview(
    userId: string,
    eventId: string,
    reviewData: ReviewData,
    venueId?: string
  ): Promise<UserReview> {
    try {
      // Check if user already has a review for this event
      const { data: existingReview, error: checkError } = await supabase
        .from('user_reviews')
        .select('id')
        .eq('user_id', userId)
        .eq('event_id', eventId)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existingReview) {
        // Update existing review
        const { data, error } = await supabase
          .from('user_reviews')
          .update({
            venue_id: venueId,
            ...reviewData,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingReview.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Create new review
        const { data, error } = await supabase
          .from('user_reviews')
          .insert({
            user_id: userId,
            event_id: eventId,
            venue_id: venueId,
            ...reviewData
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    } catch (error) {
      console.error('Error setting event review:', error);
      throw new Error(`Failed to set event review: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user's review for an event
   */
  static async getUserEventReview(userId: string, eventId: string): Promise<UserReview | null> {
    try {
      const { data, error } = await supabase
        .from('user_reviews')
        .select('*')
        .eq('user_id', userId)
        .eq('event_id', eventId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data || null;
    } catch (error) {
      console.error('Error getting user event review:', error);
      return null;
    }
  }

  /**
   * Get all reviews for an event with engagement data
   */
  static async getEventReviews(
    eventId: string, 
    userId?: string
  ): Promise<{
    reviews: ReviewWithEngagement[];
    averageRating: number;
    totalReviews: number;
  }> {
    try {
      // Get reviews with user engagement data
      const { data: reviews, error } = await supabase
        .from('user_reviews')
        .select(`
          *,
          review_likes!left(id, user_id)
        `)
        .eq('event_id', eventId)
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Check if current user has liked any of these reviews
      let userLikes: string[] = [];
      if (userId) {
        const { data: likes } = await supabase
          .from('review_likes')
          .select('review_id')
          .eq('user_id', userId)
          .in('review_id', reviews?.map(r => r.id) || []);
        
        userLikes = likes?.map(l => l.review_id) || [];
      }

      // Process reviews with engagement data
      const processedReviews: ReviewWithEngagement[] = (reviews || []).map(review => ({
        ...review,
        is_liked_by_user: userLikes.includes(review.id),
        user_like_id: userLikes.includes(review.id) 
          ? review.review_likes?.find(l => l.user_id === userId)?.id 
          : undefined
      }));

      const totalReviews = processedReviews.length;
      const averageRating = totalReviews > 0 
        ? processedReviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews 
        : 0;

      return {
        reviews: processedReviews,
        averageRating,
        totalReviews
      };
    } catch (error) {
      console.error('Error getting event reviews:', error);
      throw new Error(`Failed to get event reviews: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user's review history
   */
  static async getUserReviewHistory(userId: string): Promise<{
    reviews: Array<{
      review: UserReview;
      event: any; // JamBase event data
    }>;
    total: number;
  }> {
    try {
      console.log('🔍 ReviewService: Getting user review history for userId:', userId);
      
      const { data, error } = await supabase
        .from('user_reviews')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      console.log('🔍 ReviewService: Raw query result:', { data, error });

      if (error) throw error;

      const result = {
        reviews: (data || []).map((item: any) => ({
          review: {
            id: item.id,
            user_id: item.user_id,
            event_id: item.event_id,
            rating: item.rating,
            reaction_emoji: item.reaction_emoji,
            review_text: item.review_text,
            photos: item.photos,
            videos: item.videos,
            mood_tags: item.mood_tags,
            genre_tags: item.genre_tags,
            context_tags: item.context_tags,
            created_at: item.created_at,
            updated_at: item.updated_at,
            likes_count: item.likes_count,
            comments_count: item.comments_count,
            shares_count: item.shares_count,
            is_public: item.is_public
          },
          event: null // We'll fetch event data separately if needed
        })),
        total: Array.isArray(data) ? data.length : 0
      };
      
      console.log('🔍 ReviewService: Processed result:', result);
      return result;
    } catch (error) {
      console.error('❌ ReviewService: Error getting user review history:', error);
      throw new Error(`Failed to get user review history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a review
   */
  static async deleteEventReview(userId: string, eventId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_reviews')
        .delete()
        .eq('user_id', userId)
        .eq('event_id', eventId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting event review:', error);
      throw new Error(`Failed to delete event review: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Like a review
   */
  static async likeReview(userId: string, reviewId: string): Promise<ReviewLike> {
    try {
      const { data, error } = await supabase
        .from('review_likes')
        .insert({
          user_id: userId,
          review_id: reviewId
        })
        .select()
        .single();

      if (error) throw error;

      // Update likes count
      await this.updateReviewCounts(reviewId, 'likes', 1);

      return data;
    } catch (error) {
      console.error('Error liking review:', error);
      throw new Error(`Failed to like review: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Unlike a review
   */
  static async unlikeReview(userId: string, reviewId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('review_likes')
        .delete()
        .eq('user_id', userId)
        .eq('review_id', reviewId);

      if (error) throw error;

      // Update likes count
      await this.updateReviewCounts(reviewId, 'likes', -1);
    } catch (error) {
      console.error('Error unliking review:', error);
      throw new Error(`Failed to unlike review: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add a comment to a review
   */
  static async addComment(
    userId: string, 
    reviewId: string, 
    commentText: string, 
    parentCommentId?: string
  ): Promise<ReviewComment> {
    try {
      const { data, error } = await supabase
        .from('review_comments')
        .insert({
          user_id: userId,
          review_id: reviewId,
          comment_text: commentText,
          parent_comment_id: parentCommentId
        })
        .select()
        .single();

      if (error) throw error;

      // Update comments count
      await this.updateReviewCounts(reviewId, 'comments', 1);

      return data;
    } catch (error) {
      console.error('Error adding comment:', error);
      throw new Error(`Failed to add comment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get comments for a review
   */
  static async getReviewComments(reviewId: string): Promise<CommentWithUser[]> {
    try {
      // First, get the comments
      const { data: comments, error: commentsError } = await supabase
        .from('review_comments')
        .select('*')
        .eq('review_id', reviewId)
        .order('created_at', { ascending: true });

      if (commentsError) throw commentsError;

      if (!comments || comments.length === 0) {
        return [];
      }

      // Get unique user IDs from comments
      const userIds = [...new Set(comments.map(comment => comment.user_id))];

      // Fetch user profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, user_id')
        .in('user_id', userIds);

      if (profilesError) throw profilesError;

      // Create a map of user_id to profile data
      const profileMap = new Map();
      profiles?.forEach(profile => {
        profileMap.set(profile.user_id, {
          id: profile.id,
          name: profile.name,
          avatar_url: profile.avatar_url
        });
      });

      // Combine comments with user data
      const commentsWithUsers: CommentWithUser[] = comments.map(comment => ({
        ...comment,
        user: profileMap.get(comment.user_id) || {
          id: comment.user_id,
          name: 'Unknown User',
          avatar_url: undefined
        }
      }));

      return commentsWithUsers;
    } catch (error) {
      console.error('Error getting review comments:', error);
      throw new Error(`Failed to get review comments: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Share a review
   */
  static async shareReview(
    userId: string, 
    reviewId: string, 
    platform?: string
  ): Promise<ReviewShare> {
    try {
      const { data, error } = await supabase
        .from('review_shares')
        .insert({
          user_id: userId,
          review_id: reviewId,
          share_platform: platform
        })
        .select()
        .single();

      if (error) throw error;

      // Update shares count
      await this.updateReviewCounts(reviewId, 'shares', 1);

      return data;
    } catch (error) {
      console.error('Error sharing review:', error);
      throw new Error(`Failed to share review: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get public reviews with profiles (using the view)
   */
  static async getPublicReviewsWithProfiles(
    eventId?: string,
    venueId?: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{
    reviews: PublicReviewWithProfile[];
    total: number;
  }> {
    try {
      let query = supabase
        .from('public_reviews_with_profiles')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (eventId) {
        query = query.eq('event_id', eventId);
      }

      // Note: Some environments' views may not expose venue_id. To keep compatibility,
      // we do not push a venue_id equality filter here. Callers can filter by venue
      // name client-side if needed.

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        reviews: data || [],
        total: count || 0
      };
    } catch (error) {
      console.error('Error getting public reviews with profiles:', error);
      throw new Error(`Failed to get public reviews: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update review counts (likes, comments, shares)
   */
  private static async updateReviewCounts(
    reviewId: string, 
    type: 'likes' | 'comments' | 'shares', 
    delta: number
  ): Promise<void> {
    try {
      const column = `${type}_count`;
      const { error } = await supabase.rpc('increment_review_count' as any, {
        review_id: reviewId,
        column_name: column,
        delta: delta
      });

      if (error) throw error;
    } catch (error) {
      console.error(`Error updating ${type} count:`, error);
      // Don't throw here as it's not critical
    }
  }

  /**
   * Get popular tags for filtering
   */
  static async getPopularTags(type: 'mood' | 'genre' | 'context' | 'venue' | 'artist'): Promise<Array<{ tag: string; count: number }>> {
    try {
      const column = `${type}_tags`;
      const { data, error } = await supabase
        .from('user_reviews')
        .select(column)
        .not(column, 'is', null)
        .eq('is_public', true);

      if (error) throw error;

      // Count tag occurrences
      const tagCounts: Record<string, number> = {};
      data?.forEach(review => {
        const tags = review[column] as string[] || [];
        tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      });

      return Object.entries(tagCounts)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);
    } catch (error) {
      console.error('Error getting popular tags:', error);
      return [];
    }
  }

  /**
   * Get venue statistics
   */
  static async getVenueStats(venueId: string): Promise<VenueStats> {
    try {
      const { data, error } = await supabase
        .rpc('get_venue_stats', { venue_uuid: venueId });

      if (error) throw error;

      return data[0] || {
        total_reviews: 0,
        average_venue_rating: 0,
        average_artist_rating: 0,
        average_overall_rating: 0,
        rating_distribution: {
          '1_star': 0,
          '2_star': 0,
          '3_star': 0,
          '4_star': 0,
          '5_star': 0,
        }
      };
    } catch (error) {
      console.error('Error getting venue stats:', error);
      throw new Error(`Failed to get venue stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get popular venue tags
   */
  static async getPopularVenueTags(venueId?: string): Promise<TagCount[]> {
    try {
      const { data, error } = await supabase
        .rpc('get_popular_venue_tags', venueId ? { venue_uuid: venueId } : {});

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error getting popular venue tags:', error);
      return [];
    }
  }

  /**
   * Get reviews for a specific venue
   */
  static async getVenueReviews(
    venueId: string,
    userId?: string
  ): Promise<{
    reviews: ReviewWithEngagement[];
    averageRating: number;
    totalReviews: number;
  }> {
    try {
      // Get reviews with user engagement data
      const { data: reviews, error } = await supabase
        .from('user_reviews')
        .select(`
          *,
          review_likes!left(id, user_id)
        `)
        .eq('venue_id', venueId)
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Check if current user has liked any of these reviews
      let userLikes: string[] = [];
      if (userId) {
        const { data: likes } = await supabase
          .from('review_likes')
          .select('review_id')
          .eq('user_id', userId)
          .in('review_id', reviews?.map(r => r.id) || []);
        
        userLikes = likes?.map(l => l.review_id) || [];
      }

      // Process reviews with engagement data
      const processedReviews: ReviewWithEngagement[] = (reviews || []).map(review => ({
        ...review,
        is_liked_by_user: userLikes.includes(review.id),
        user_like_id: userLikes.includes(review.id) 
          ? review.review_likes?.find(l => l.user_id === userId)?.id 
          : undefined
      }));

      const totalReviews = processedReviews.length;
      const averageRating = totalReviews > 0 
        ? processedReviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews 
        : 0;

      return {
        reviews: processedReviews,
        averageRating,
        totalReviews
      };
    } catch (error) {
      console.error('Error getting venue reviews:', error);
      throw new Error(`Failed to get venue reviews: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
