/**
 * Event Photo Service
 * Handles user-uploaded event photos with likes and comments
 */

import { supabase } from '@/integrations/supabase/client';
import { storageService } from './storageService';

export interface UploadEventPhotoRequest {
  event_id: string;
  photo_file: File;
  caption?: string;
}

export interface EventPhoto {
  id: string;
  event_id: string;
  photo_url: string;
  caption?: string;
  likes_count: number;
  comments_count: number;
  is_featured: boolean;
  user_id: string;
  user_name: string;
  user_avatar_url?: string;
  user_has_liked: boolean;
  created_at: string;
}

export interface PhotoComment {
  id: string;
  photo_id: string;
  user_id: string;
  user_name: string;
  user_avatar_url?: string;
  comment: string;
  created_at: string;
}

export class EventPhotoService {
  /**
   * Upload event photo
   * DISABLED: Photos are stored in reviews.photos array, not a separate event_photos table
   * To add photos, users need to create/update a review with photos
   */
  static async uploadPhoto(request: UploadEventPhotoRequest): Promise<EventPhoto> {
    // Photos are stored in reviews, not a separate event_photos table
    // Users should add photos when creating/editing reviews
    throw new Error('Photo uploads are handled through reviews. Please add photos when creating or editing a review.');
  }

  /**
   * Get photos for an event
   * Photos are stored in event_media table (synced from reviews)
   */
  static async getEventPhotos(
    eventId: string,
    limit = 20,
    offset = 0
  ): Promise<EventPhoto[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get photos from event_media table
      const { data: mediaRecords, error } = await supabase
        .from('event_media')
        .select(`
          id,
          url,
          review_id,
          created_at,
          review:reviews!event_media_review_id_fkey (
            user_id,
            user:users!reviews_user_id_fkey (
              name,
              avatar_url
            )
          )
        `)
        .eq('event_id', eventId)
        .eq('media_type', 'photo')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.warn('Error getting event photos from event_media:', error);
        return [];
      }

      // Convert to EventPhoto format
      const photos: EventPhoto[] = (mediaRecords || []).map((media: any) => {
        const review = media.review as any;
        const reviewUser = review?.user as any;
        
        return {
          id: media.id,
          event_id: eventId,
          photo_url: media.url,
          caption: undefined,
          likes_count: 0, // Photos in reviews don't have separate likes
          comments_count: 0, // Photos in reviews don't have separate comments
          is_featured: false,
          user_id: review?.user_id || '',
          user_name: reviewUser?.name || 'Unknown',
          user_avatar_url: reviewUser?.avatar_url || null,
          user_has_liked: false,
          created_at: media.created_at,
        };
      });

      return photos;
    } catch (error) {
      console.error('Error getting event photos:', error);
      return []; // Return empty array instead of throwing to prevent breaking UI
    }
  }

  /**
   * Like/unlike photo
   * DISABLED: Photos in reviews don't have separate likes - they use review likes
   */
  static async togglePhotoLike(photoId: string, liked: boolean): Promise<void> {
    // Photos in reviews don't have separate likes
    // Users can like the review instead
    console.warn('Photo likes not supported - photos are part of reviews');
  }

  /**
   * Add comment to photo
   * DISABLED: Photos in reviews don't have separate comments - they use review comments
   */
  static async addComment(photoId: string, comment: string): Promise<PhotoComment> {
    // Photos in reviews don't have separate comments
    // Users can comment on the review instead
    throw new Error('Photo comments not supported - photos are part of reviews. Please comment on the review instead.');
  }

  /**
   * Get photo comments
   * DISABLED: Photos in reviews don't have separate comments
   */
  static async getPhotoComments(photoId: string): Promise<PhotoComment[]> {
    // Photos in reviews don't have separate comments
    return [];
  }

  /**
   * Delete photo
   * DISABLED: Photos are stored in reviews - users should edit the review to remove photos
   */
  static async deletePhoto(photoId: string): Promise<void> {
    // Photos are part of reviews - users should edit the review to remove photos
    throw new Error('Photos are part of reviews. Please edit the review to remove photos.');
  }

  /**
   * Update photo caption
   * DISABLED: Photos in reviews don't have separate captions
   */
  static async updateCaption(photoId: string, caption: string): Promise<void> {
    // Photos in reviews don't have separate captions
    throw new Error('Photo captions not supported - photos are part of reviews.');
  }

  /**
   * Get user's uploaded photos
   * Photos are stored in event_media table (synced from reviews)
   */
  static async getUserPhotos(userId?: string): Promise<EventPhoto[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      const targetUserId = userId || user.id;

      // First get review IDs for this user
      const { data: reviews, error: reviewsError } = await supabase
        .from('reviews')
        .select('id')
        .eq('user_id', targetUserId)
        .eq('is_public', true)
        .eq('is_draft', false);

      if (reviewsError || !reviews || reviews.length === 0) {
        return [];
      }

      const reviewIds = reviews.map(r => r.id);

      // Get photos from event_media for these reviews
      const { data: mediaRecords, error } = await supabase
        .from('event_media')
        .select(`
          id,
          url,
          review_id,
          event_id,
          created_at,
          review:reviews!event_media_review_id_fkey (
            user:users!reviews_user_id_fkey (
              name,
              avatar_url
            )
          ),
          event:events (
            id,
            title,
            artist_name,
            event_date
          )
        `)
        .in('review_id', reviewIds)
        .eq('media_type', 'photo')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Error getting user photos from event_media:', error);
        return [];
      }

      // Convert to EventPhoto format
      const photos: EventPhoto[] = (mediaRecords || []).map((media: any) => {
        const review = media.review as any;
        const reviewUser = review?.user as any;
        
        return {
          id: media.id,
          event_id: media.event_id || '',
          photo_url: media.url,
          caption: undefined,
          likes_count: 0,
          comments_count: 0,
          is_featured: false,
          user_id: review?.user_id || targetUserId,
          user_name: reviewUser?.name || 'Unknown',
          user_avatar_url: reviewUser?.avatar_url || null,
          user_has_liked: false,
          created_at: media.created_at,
        };
      });

      return photos;
    } catch (error) {
      console.error('Error getting user photos:', error);
      return [];
    }
  }

  /**
   * Feature/unfeature photo (admin only)
   * DISABLED: Photos in reviews don't have featured status
   */
  static async toggleFeatured(photoId: string, featured: boolean): Promise<void> {
    // Photos in reviews don't have featured status
    throw new Error('Photo featuring not supported - photos are part of reviews.');
  }
}

export default EventPhotoService;

