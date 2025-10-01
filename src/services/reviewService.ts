import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

// Review system types with venue support
export interface ReviewData {
  rating?: number; // Overall rating (calculated automatically)
  performance_rating?: number; // Rating for artist/band performance quality (0.5-5.0)
  venue_rating?: number; // Rating for venue experience - sound, staff, facilities (0.5-5.0)
  overall_experience_rating?: number; // Rating for overall event experience - atmosphere, crowd (0.5-5.0)
  performance_review_text?: string; // Optional qualitative review for performance
  venue_review_text?: string; // Optional qualitative review for venue
  overall_experience_review_text?: string; // Optional qualitative review for overall experience
  artist_rating?: number; // Legacy field for backward compatibility
  review_type: 'event' | 'venue' | 'artist'; // Type of review
  review_text?: string;
  reaction_emoji?: string;
  photos?: string[]; // Array of photo URLs from storage
  videos?: string[]; // Array of video URLs from storage
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
  performance_rating?: number;
  venue_rating?: number;
  overall_experience_rating?: number;
  performance_review_text?: string;
  venue_review_text?: string;
  overall_experience_review_text?: string;
  artist_rating?: number; // Legacy field
  review_type?: 'event' | 'venue' | 'artist';
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
  is_public?: boolean;
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
  // projected event metadata for UI (optional)
  artist_name?: string;
  artist_id?: string;
  venue_name?: string;
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
      // Helper to ensure a valid INTEGER rating value (1..5) for inserts/updates
      const deriveRating = (data: ReviewData): number => {
        const clampToRange = (val: number) => Math.max(1, Math.min(5, val));
        if (typeof data.rating === 'number' && !Number.isNaN(data.rating)) {
          return clampToRange(Math.round(data.rating));
        }

        // Prefer new three-category system if available (decimal halves permitted at column level)
        const newParts = [data.performance_rating, data.venue_rating, data.overall_experience_rating].filter(
          (v): v is number => typeof v === 'number' && v > 0
        );
        if (newParts.length === 3) {
          const avg = newParts.reduce((a, b) => a + b, 0) / newParts.length;
          return clampToRange(Math.round(avg));
        }

        // Fallback to legacy two-category system
        const legacyParts = [data.artist_rating, data.venue_rating].filter(
          (v): v is number => typeof v === 'number' && v > 0
        );
        if (legacyParts.length > 0) {
          const avg = legacyParts.reduce((a, b) => a + b, 0) / legacyParts.length;
          return clampToRange(Math.round(avg));
        }

        // As a last resort, return mid rating to pass NOT NULL constraint while being neutral
        return 3;
      };

      // Check if user already has a review for this event (guard against non-UUID eventId)
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId);
      // If eventId is not a UUID, skip .single() to avoid 400s and treat as not found
      const { data: existingReview, error: checkError } = isUuid
        ? await supabase
            .from('user_reviews')
            .select('id')
            .eq('user_id', userId)
            .eq('event_id', eventId)
            .maybeSingle()
        : { data: null as any, error: null as any };

      if (checkError && checkError.code !== 'PGRST116' && (checkError as any).status !== 406) {
        throw checkError;
      }

      if (existingReview) {
        // Update existing review
        // Try full update first; fallback to legacy columns if schema lacks new fields
        const fullUpdate: any = {
          ...(venueId ? { venue_id: venueId } : {}),
          ...(typeof reviewData.rating === 'number' ||
          typeof reviewData.performance_rating === 'number' ||
          typeof reviewData.venue_rating === 'number' ||
          typeof reviewData.overall_experience_rating === 'number' ||
          typeof reviewData.artist_rating === 'number'
            ? { rating: deriveRating(reviewData) }
            : {}),
          review_text: reviewData.review_text,
          reaction_emoji: reviewData.reaction_emoji,
          is_public: reviewData.is_public,
          performance_rating: reviewData.performance_rating,
          // Do not write decimals to legacy integer venue_rating; use new decimal column instead
          overall_experience_rating: reviewData.overall_experience_rating,
          performance_review_text: reviewData.performance_review_text,
          venue_review_text: reviewData.venue_review_text,
          overall_experience_review_text: reviewData.overall_experience_review_text,
          // Ensure venue data stored in both columns for compatibility
          venue_rating_new: (reviewData as any).venue_rating ?? undefined,
          artist_rating: reviewData.artist_rating, // Legacy field
          review_type: reviewData.review_type,
          venue_tags: reviewData.venue_tags,
          artist_tags: reviewData.artist_tags,
          photos: reviewData.photos, // Add photos field
          updated_at: new Date().toISOString()
        };

        // Perform update without returning to avoid 400/406 in some environments
        let { error } = await supabase
          .from('user_reviews')
          .update(fullUpdate)
          .eq('id', existingReview.id);
        // Fetch the updated row separately
        let data: any = null;
        if (!error) {
          const fetched = await supabase
            .from('user_reviews')
            .select('*')
            .eq('id', existingReview.id)
            .maybeSingle();
          data = fetched.data as any;
          error = fetched.error as any;
        }

        if (error) {
          // Retry with legacy-only columns on any 4xx schema error
          // Unknown columns: retry with legacy-only columns
          const legacyUpdate: any = {
            ...(venueId ? { venue_id: venueId } : {}),
            rating: deriveRating(reviewData),
            review_text: reviewData.review_text,
            reaction_emoji: reviewData.reaction_emoji,
            is_public: reviewData.is_public,
            photos: reviewData.photos, // Add photos field to legacy update
            updated_at: new Date().toISOString()
          };

          const retry = await supabase
            .from('user_reviews')
            .update(legacyUpdate)
            .eq('id', existingReview.id)
            .select()
            .single();
          data = retry.data as any;
          error = retry.error as any;
        }

        if (error) throw error as any;
        return data as any as UserReview;
      }

      // Create new review
      const insertPayload: UserReviewInsert = {
        user_id: userId,
        event_id: eventId,
        ...(venueId ? { venue_id: venueId } : {}),
        rating: deriveRating(reviewData),
        reaction_emoji: reviewData.reaction_emoji,
        review_text: reviewData.review_text,
        is_public: reviewData.is_public ?? true,
        performance_rating: reviewData.performance_rating,
        // Do not write decimals to legacy integer venue_rating; use new decimal column instead
        overall_experience_rating: reviewData.overall_experience_rating,
        performance_review_text: reviewData.performance_review_text,
        venue_review_text: reviewData.venue_review_text,
        overall_experience_review_text: reviewData.overall_experience_review_text,
        // Ensure venue data stored in both columns for compatibility
        venue_rating_new: (reviewData as any).venue_rating ?? undefined,
        artist_rating: reviewData.artist_rating, // Legacy field
        review_type: reviewData.review_type,
        venue_tags: reviewData.venue_tags,
        artist_tags: reviewData.artist_tags,
        photos: reviewData.photos // Add photos field
      } as UserReviewInsert;

      // Try full insert first
      let { data, error } = await supabase
        .from('user_reviews')
        .insert(insertPayload as any)
        .select()
        .maybeSingle();

      if (error) {
        // If duplicate key (user_id, event_id) already exists, fallback to update instead of failing
        const err: any = error as any;
        if (err?.code === '23505' || /duplicate key/i.test(err?.message || '')) {
          const upd = await supabase
            .from('user_reviews')
            .update(insertPayload as any)
            .eq('user_id', userId)
            .eq('event_id', eventId)
            .select()
            .maybeSingle();
          data = upd.data as any;
          error = upd.error as any;
        }
      }

      if (error) {
        // Retry with legacy-only columns
        const legacyInsert: any = {
          user_id: userId,
          event_id: eventId,
          ...(venueId ? { venue_id: venueId } : {}),
          rating: deriveRating(reviewData),
          reaction_emoji: reviewData.reaction_emoji,
          review_text: reviewData.review_text,
          is_public: reviewData.is_public ?? true,
          photos: reviewData.photos // Add photos field to legacy insert
        };

        const retry = await supabase
          .from('user_reviews')
          .insert(legacyInsert)
          .select()
          .single();
        data = retry.data as any;
        error = retry.error as any;
      }

      if (error) throw error as any;
      return data as any as UserReview;
    } catch (error) {
      // Surface deeper Supabase details when possible
      const errObj: any = error as any;
      const message = errObj?.message || errObj?.error_description || errObj?.details || errObj?.hint || JSON.stringify(errObj);
      console.error('Error setting event review:', errObj);
      throw new Error(`Failed to set event review: ${message}`);
    }
  }

  /**
   * Get user's review for an event
   */
  static async getUserEventReview(userId: string, eventId: string): Promise<UserReview | null> {
    try {
      // Validate UUID format to prevent 400 errors
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(eventId)) {
        console.log('⚠️ Invalid event ID format (not a UUID), skipping review lookup:', eventId);
        return null;
      }

      const { data, error } = await supabase
        .from('user_reviews')
        .select('*')
        .eq('user_id', userId)
        .eq('event_id', eventId)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = not found, which is okay
        throw error;
      }

      return data || null;
    } catch (error) {
      const err = error as any;
      // Don't log UUID validation errors as they're handled gracefully
      if (err?.code !== '22P02') {
        console.error('Error getting user event review:', error);
      }
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
          jambase_events: jambase_events (id, title, artist_name, artist_id, venue_name, venue_id, event_date),
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
      const processedReviews: ReviewWithEngagement[] = (reviews || []).map((review: any) => ({
        ...review,
        // Project event info onto the review for UI access
        artist_name: review.jambase_events?.artist_name,
        artist_id: review.jambase_events?.artist_id,
        venue_name: review.jambase_events?.venue_name,
        venue_id: review.jambase_events?.venue_id || review.venue_id,
        is_liked_by_user: userLikes.includes(review.id),
        user_like_id: userLikes.includes(review.id) 
          ? review.review_likes?.find(l => l.user_id === userId)?.id 
          : undefined,
        // ensure optional fields exist for typing
        review_type: (review as any).review_type,
        is_public: (review as any).is_public
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
      
      const { data, error } = await (supabase as any)
        .from('user_reviews')
        .select(`
          *,
          jambase_events: jambase_events (
            id,
            title,
            artist_name,
            venue_name,
            venue_id,
            event_date,
            doors_time,
            venue_city,
            venue_state,
            venue_zip
          )
        `)
        .eq('user_id', userId)
        .order('rating', { ascending: false })
        .order('rank_order', { ascending: true, nullsFirst: false })
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
                rank_order: (item as any).rank_order,
            performance_rating: item.performance_rating,
            venue_rating_new: item.venue_rating_new,
            overall_experience_rating: item.overall_experience_rating,
            review_type: item.review_type,
            reaction_emoji: item.reaction_emoji,
            review_text: item.review_text,
            photos: item.photos,
            videos: item.videos,
            mood_tags: item.mood_tags,
            genre_tags: item.genre_tags,
            context_tags: item.context_tags,
            venue_id: item.venue_id,
            artist_rating: item.artist_rating,
            venue_rating: item.venue_rating,
            created_at: item.created_at,
            updated_at: item.updated_at,
            likes_count: item.likes_count,
            comments_count: item.comments_count,
            shares_count: item.shares_count,
            is_public: item.is_public
          },
          event: item.jambase_events
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
   * Persist ordered ranks for a single rating group
   */
  static async setRankOrderForRatingGroup(
    userId: string,
    rating: number,
    orderedReviewIds: string[]
  ): Promise<void> {
    console.log('💾 Saving rank order:', { userId, rating, count: orderedReviewIds.length });
    
    // Defensive: ensure dense 1..N ranks
    const updates = orderedReviewIds.map((id, idx) => ({ id, rank_order: idx + 1 }));
    
    try {
      for (const u of updates) {
        console.log(`  Updating review ${u.id.slice(0, 8)}... → rank_order = ${u.rank_order}`);

        // Use 'as any' to bypass type error since 'rank_order' exists in DB but not in generated types
        const { error } = await (supabase as any)
          .from('user_reviews')
          .update({ rank_order: u.rank_order })
          .eq('id', u.id)
          .eq('user_id', userId);

        if (error) {
          console.error(`❌ Error updating review ${u.id}:`, error);
          throw error;
        }
      }
      
      console.log('✅ All rankings saved successfully');
    } catch (e) {
      console.error('❌ Error updating rank order group:', e);
      throw new Error(`Failed to update ranking: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  /**
   * Clear rank when rating changes (so item drops to bottom of its new group)
   */
  static async clearRankOnRatingChange(reviewId: string): Promise<void> {
    try {
      const { error } = await (supabase as any)
        .from('user_reviews')
        .update({ rank_order: null })
        .eq('id', reviewId);
      if (error) throw error;
    } catch (e) {
      console.warn('Failed to clear rank_order on rating change', e);
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

      const { data, error, count } = await query as any;

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
      // Prefer RPC (created by migration) to do an atomic increment
      const { error: rpcError } = await (supabase as any)
        .rpc('increment_review_count', { review_id: reviewId, column_name: column, delta });

      if (rpcError) {
        // Fallback to safe read-modify-write if RPC is unavailable
        const { data: current } = await (supabase as any)
          .from('user_reviews')
          .select('likes_count, comments_count, shares_count')
          .eq('id', reviewId)
          .single();
        const next = Math.max(0, (current?.[column] || 0) + delta);
        await (supabase as any)
          .from('user_reviews')
          .update({ [column]: next })
          .eq('id', reviewId);
      }
    } catch (error) {
      console.error(`Error updating ${type} count:`, error);
      // Don't throw here as it's not critical
    }
  }

  /**
   * Get engagement counts and like status for a review
   */
  static async getReviewEngagement(
    reviewId: string,
    userId?: string
  ): Promise<{ likes_count: number; comments_count: number; shares_count: number; is_liked_by_user: boolean } | null> {
    try {
      const { data, error } = await (supabase as any)
        .from('user_reviews')
        .select('id, likes_count, comments_count, shares_count, review_likes!left(id, user_id)')
        .eq('id', reviewId)
        .single();
      if (error) throw error;
      const likes = Array.isArray(data?.review_likes) ? data.review_likes : [];
      const isLiked = userId ? likes.some((l: any) => l.user_id === userId) : false;
      return {
        likes_count: data?.likes_count || 0,
        comments_count: data?.comments_count || 0,
        shares_count: data?.shares_count || 0,
        is_liked_by_user: isLiked,
      };
    } catch (e) {
      console.warn('ReviewService.getReviewEngagement failed', e);
      return null;
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
      const { data, error } = await (supabase as any)
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
      const { data, error } = await (supabase as any)
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
      const { data: reviews, error } = await (supabase as any)
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
      const processedReviews: ReviewWithEngagement[] = (((reviews as any[]) || [])).map((review: any) => ({
        ...review,
        is_liked_by_user: userLikes.includes(review.id),
        user_like_id: userLikes.includes(review.id)
          ? review.review_likes?.find((l: any) => l.user_id === userId)?.id
          : undefined,
        review_type: review.review_type,
        is_public: review.is_public
      })) as unknown as ReviewWithEngagement[];

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
