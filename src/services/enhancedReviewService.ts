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
      // Query reviews table with proper joins
      const { data: reviews, error } = await (supabase as any)
        .from('reviews')
        .select(`
          *,
          users:users!reviews_user_id_fkey (
            user_id,
            name,
            avatar_url,
            verified,
            account_type
          ),
          events:events (
            id,
            title,
            artist_name,
            venue_name,
            event_date
          ),
          artists:artists (
            id,
            normalized_name,
            image_url,
            url,
            jambase_id
          ),
          venues:venues (
            id,
            normalized_name,
            image_url,
            address,
            city,
            state,
            jambase_id
          )
        `)
        .eq('event_id', eventId)
        .eq('is_public', true)
        .eq('is_draft', false)
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
          .in('entity_id', reviews?.map((r: any) => r.id) || []);
        
        userLikes = likes?.map(l => l.entity_id) || [];
      }

      // Process reviews with engagement data and transform to match expected format
      const processedReviews: EnhancedReviewWithEngagement[] = (reviews || []).map((review: any) => ({
        ...review,
        reviewer_name: review.users?.name,
        reviewer_avatar: review.users?.avatar_url,
        reviewer_verified: review.users?.verified,
        reviewer_account_type: review.users?.account_type,
        event_title: review.events?.title,
        artist_name: review.events?.artist_name,
        venue_name: review.events?.venue_name,
        event_date: review.events?.event_date,
        artist_uuid: review.artists?.id,
        artist_normalized_name: review.artists?.normalized_name,
        artist_image_url: review.artists?.image_url,
        artist_url: review.artists?.url,
        artist_jambase_id: review.artists?.jambase_id,
        venue_uuid: review.venues?.id,
        venue_normalized_name: review.venues?.normalized_name,
        venue_image_url: review.venues?.image_url,
        venue_address: review.venues?.address,
        venue_city: review.venues?.city,
        venue_state: review.venues?.state,
        venue_jambase_id: review.venues?.jambase_id,
        is_liked_by_user: userLikes.includes(review.id),
        user_like_id: userLikes.includes(review.id) 
          ? review.review_likes?.find((l: any) => l.user_id === userId)?.id 
          : undefined,
        // Use the proper UUIDs for clickable links
        artist_id: review.artists?.id || review.artist_id,
        venue_id: review.venues?.id || review.venue_id,
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
      let query = (supabase as any)
        .from('reviews')
        .select(`
          *,
          users:users!reviews_user_id_fkey (
            user_id,
            name,
            avatar_url,
            verified,
            account_type
          ),
          events:events (
            id,
            title,
            artist_name,
            venue_name,
            event_date
          ),
          artists:artists (
            id,
            normalized_name,
            image_url,
            url,
            jambase_id
          ),
          venues:venues (
            id,
            normalized_name,
            image_url,
            address,
            city,
            state,
            jambase_id
          )
        `, { count: 'exact' })
        .eq('is_public', true)
        .eq('is_draft', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (eventId) {
        query = query.eq('event_id', eventId);
      }

      if (venueId) {
        query = query.eq('venue_id', venueId);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      // Process reviews to use proper UUIDs and transform to match expected format
      const processedReviews: EnhancedPublicReviewWithProfile[] = (data || []).map((review: any) => ({
        ...review,
        reviewer_name: review.users?.name,
        reviewer_avatar: review.users?.avatar_url,
        reviewer_verified: review.users?.verified,
        reviewer_account_type: review.users?.account_type,
        event_title: review.events?.title,
        artist_name: review.events?.artist_name,
        venue_name: review.events?.venue_name,
        event_date: review.events?.event_date,
        artist_uuid: review.artists?.id,
        artist_normalized_name: review.artists?.normalized_name,
        artist_image_url: review.artists?.image_url,
        artist_url: review.artists?.url,
        artist_jambase_id: review.artists?.jambase_id,
        venue_uuid: review.venues?.id,
        venue_normalized_name: review.venues?.normalized_name,
        venue_image_url: review.venues?.image_url,
        venue_address: review.venues?.address,
        venue_city: review.venues?.city,
        venue_state: review.venues?.state,
        venue_jambase_id: review.venues?.jambase_id,
        // Use the proper UUIDs for clickable links
        artist_id: review.artists?.id || review.artist_id,
        venue_id: review.venues?.id || review.venue_id,
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