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
   */
  static async uploadPhoto(request: UploadEventPhotoRequest): Promise<EventPhoto> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      // Upload photo to storage
      const uploadResult = await storageService.uploadPhoto(
        request.photo_file,
        'event-media',
        user.id
      );

      // Create photo record
      const { data, error } = await supabase
        .from('event_photos')
        .insert({
          event_id: request.event_id,
          user_id: user.id,
          photo_url: uploadResult.url,
          caption: request.caption || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Fetch full photo data
      const photos = await this.getEventPhotos(request.event_id, 1);
      return photos[0];
    } catch (error) {
      console.error('Error uploading event photo:', error);
      throw error;
    }
  }

  /**
   * Get photos for an event
   */
  static async getEventPhotos(
    eventId: string,
    limit = 20,
    offset = 0
  ): Promise<EventPhoto[]> {
    try {
      const { data, error } = await supabase.rpc('get_event_photos', {
        p_event_id: eventId,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting event photos:', error);
      throw error;
    }
  }

  /**
   * Like/unlike photo
   */
  static async togglePhotoLike(photoId: string, liked: boolean): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      if (liked) {
        // Add like
        const { error } = await supabase
          .from('event_photo_likes')
          .insert({
            photo_id: photoId,
            user_id: user.id,
          });

        if (error && error.code !== '23505') throw error; // Ignore duplicate
      } else {
        // Remove like
        const { error } = await supabase
          .from('event_photo_likes')
          .delete()
          .eq('photo_id', photoId)
          .eq('user_id', user.id);

        if (error) throw error;
      }
    } catch (error) {
      console.error('Error toggling photo like:', error);
      throw error;
    }
  }

  /**
   * Add comment to photo
   */
  static async addComment(photoId: string, comment: string): Promise<PhotoComment> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('event_photo_comments')
        .insert({
          photo_id: photoId,
          user_id: user.id,
          comment: comment.trim(),
        })
        .select(`
          *,
          user:profiles!event_photo_comments_user_id_fkey (
            name,
            avatar_url
          )
        `)
        .single();

      if (error) throw error;

      return {
        id: data.id,
        photo_id: data.photo_id,
        user_id: data.user_id,
        user_name: (data.user as any).name,
        user_avatar_url: (data.user as any).avatar_url,
        comment: data.comment,
        created_at: data.created_at,
      };
    } catch (error) {
      console.error('Error adding comment:', error);
      throw error;
    }
  }

  /**
   * Get photo comments
   */
  static async getPhotoComments(photoId: string): Promise<PhotoComment[]> {
    try {
      const { data, error } = await supabase
        .from('event_photo_comments')
        .select(`
          *,
          user:profiles!event_photo_comments_user_id_fkey (
            name,
            avatar_url
          )
        `)
        .eq('photo_id', photoId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data || []).map((item: any) => ({
        id: item.id,
        photo_id: item.photo_id,
        user_id: item.user_id,
        user_name: item.user?.name,
        user_avatar_url: item.user?.avatar_url,
        comment: item.comment,
        created_at: item.created_at,
      }));
    } catch (error) {
      console.error('Error getting photo comments:', error);
      throw error;
    }
  }

  /**
   * Delete photo
   */
  static async deletePhoto(photoId: string): Promise<void> {
    try {
      // Get photo to delete from storage
      const { data: photo } = await supabase
        .from('event_photos')
        .select('photo_url, user_id')
        .eq('id', photoId)
        .single();

      if (!photo) throw new Error('Photo not found');

      // Check ownership
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id !== photo.user_id) {
        throw new Error('You can only delete your own photos');
      }

      // Delete from storage
      const path = storageService.getPathFromUrl(photo.photo_url, 'event-media');
      if (path) {
        await storageService.deletePhoto('event-media', path);
      }

      // Delete from database
      const { error } = await supabase
        .from('event_photos')
        .delete()
        .eq('id', photoId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting photo:', error);
      throw error;
    }
  }

  /**
   * Update photo caption
   */
  static async updateCaption(photoId: string, caption: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('event_photos')
        .update({ caption: caption.trim() })
        .eq('id', photoId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating caption:', error);
      throw error;
    }
  }

  /**
   * Get user's uploaded photos
   */
  static async getUserPhotos(userId?: string): Promise<EventPhoto[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      const targetUserId = userId || user.id;

      const { data, error } = await supabase
        .from('event_photos')
        .select(`
          *,
          event:jambase_events (
            id,
            title,
            artist_name,
            event_date
          ),
          user:profiles!event_photos_user_id_fkey (
            name,
            avatar_url
          )
        `)
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting user photos:', error);
      throw error;
    }
  }

  /**
   * Feature/unfeature photo (admin only)
   */
  static async toggleFeatured(photoId: string, featured: boolean): Promise<void> {
    try {
      const { error } = await supabase
        .from('event_photos')
        .update({ is_featured: featured })
        .eq('id', photoId);

      if (error) throw error;
    } catch (error) {
      console.error('Error toggling featured status:', error);
      throw error;
    }
  }
}

export default EventPhotoService;

