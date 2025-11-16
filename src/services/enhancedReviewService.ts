// Enhanced Review Service - Uses the new database relationships
import { supabase } from '@/integrations/supabase/client';
import { ReviewService, ReviewWithEngagement, PublicReviewWithProfile } from './reviewService';

export interface EnhancedReviewWithEngagement extends ReviewWithEngagement {
  artist_uuid?: string;
  venue_uuid?: string;
  artist_normalized_name?: string;
  venue_normalized_name?: string;
  artist_image_url?: string;
  venue_image_url?: string;
}

export interface EnhancedPublicReviewWithProfile extends PublicReviewWithProfile {
  artist_uuid?: string;
  venue_uuid?: string;
  artist_normalized_name?: string;
  venue_normalized_name?: string;
  artist_image_url?: string;
  venue_image_url?: string;
}

export class EnhancedReviewService {
  /**
   * Get reviews with proper artist/venue UUIDs using the enhanced view
   */
  static async getEventReviewsWithArtistVenueIds(
    eventId: string, 
    userId?: string
  ): Promise<{
    reviews: EnhancedReviewWithEngagement[];
    averageRating: number;
    totalReviews: number;
  }> {
    try {
      // Use the enhanced view that already has proper relationships
      const { data: reviews, error } = await supabase
        .from('enhanced_reviews_with_profiles')
        .select(`
          id,
          user_id,
          event_id,
          venue_id,
          artist_id,
          rating,
          artist_rating,
          venue_rating,
          review_type,
          reaction_emoji,
          review_text,
          photos,
          videos,
          mood_tags,
          genre_tags,
          context_tags,
          venue_tags,
          artist_tags,
          likes_count,
          comments_count,
          shares_count,
          created_at,
          updated_at,
          reviewer_name,
          reviewer_avatar,
          event_title,
          artist_name,
          venue_name,
          event_date,
          artist_uuid,
          artist_normalized_name,
          artist_image_url,
          artist_url,
          artist_jambase_id,
          venue_uuid,
          venue_normalized_name,
          venue_image_url,
          venue_address,
          venue_city,
          venue_state,
          venue_jambase_id
        `)
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Check if current user has liked any of these reviews
      let userLikes: string[] = [];
      if (userId) {
        const { data: likes } = await supabase
          .from('engagements')
          .select('entity_id')
          .eq('user_id', userId)
          .eq('entity_type', 'review')
          .eq('engagement_type', 'like')
          .in('entity_id', reviews?.map(r => r.id) || []);
        
        userLikes = likes?.map(l => l.entity_id) || [];
      }

      // Process reviews with engagement data
      const processedReviews: EnhancedReviewWithEngagement[] = (reviews || []).map((review: any) => ({
        ...review,
        is_liked_by_user: userLikes.includes(review.id),
        user_like_id: userLikes.includes(review.id) 
          ? review.review_likes?.find((l: any) => l.user_id === userId)?.id 
          : undefined,
        // Use the proper UUIDs for clickable links
        artist_id: review.artist_uuid || review.artist_id,
        venue_id: review.venue_uuid || review.venue_id,
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
      console.error('Error getting enhanced event reviews:', error);
      // Fallback to original service
      return ReviewService.getEventReviews(eventId, userId);
    }
  }

  /**
   * Get public reviews with proper artist/venue UUIDs using the enhanced view
   */
  static async getPublicReviewsWithArtistVenueIds(
    eventId?: string,
    venueId?: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{
    reviews: EnhancedPublicReviewWithProfile[];
    total: number;
  }> {
    try {
      let query = supabase
        .from('enhanced_reviews_with_profiles')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (eventId) {
        query = query.eq('event_id', eventId);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      // Process reviews to use proper UUIDs
      const processedReviews: EnhancedPublicReviewWithProfile[] = (data || []).map((review: any) => ({
        ...review,
        // Use the proper UUIDs for clickable links
        artist_id: review.artist_uuid || review.artist_id,
        venue_id: review.venue_uuid || review.venue_id,
      }));

      return {
        reviews: processedReviews,
        total: count || 0
      };
    } catch (error) {
      console.error('Error getting enhanced public reviews:', error);
      // Fallback to original service
      return ReviewService.getPublicReviewsWithProfiles(eventId, venueId, limit, offset);
    }
  }

  /**
   * Get artist events for the artist card
   */
  static async getArtistEvents(artistId: string, limit: number = 10): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .rpc('get_artist_events', {
          artist_uuid: artistId,
          limit_count: limit
        });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting artist events:', error);
      return [];
    }
  }

  /**
   * Get venue events for the venue card
   */
  static async getVenueEvents(venueId: string, limit: number = 10): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .rpc('get_venue_events', {
          venue_uuid: venueId,
          limit_count: limit
        });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting venue events:', error);
      return [];
    }
  }

  /**
   * Get artist profile data for a review
   */
  static async getArtistForReview(reviewId: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .rpc('get_artist_for_review', { review_id: reviewId });

      if (error) throw error;
      return data?.[0] || null;
    } catch (error) {
      console.error('Error getting artist for review:', error);
      return null;
    }
  }

  /**
   * Get venue profile data for a review
   */
  static async getVenueForReview(reviewId: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .rpc('get_venue_for_review', { review_id: reviewId });

      if (error) throw error;
      return data?.[0] || null;
    } catch (error) {
      console.error('Error getting venue for review:', error);
      return null;
    }
  }

  /**
   * Check the relationship summary for debugging
   */
  static async getRelationshipSummary(): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('relationship_summary')
        .select('*');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting relationship summary:', error);
      return [];
    }
  }
}