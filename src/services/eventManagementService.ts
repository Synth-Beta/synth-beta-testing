/**
 * Simplified Event Management Service
 * Handles event creation for admin, creator, and business accounts
 * No claiming logic - just simple ownership tracking
 */

import { supabase } from '@/integrations/supabase/client';

export interface CreateEventData {
  title: string;
  artist_name?: string;
  venue_name?: string;
  event_date?: string;
  latitude?: number;
  longitude?: number;
  poster_image_url?: string;
  video_url?: string;
  age_restriction?: string;
  accessibility_info?: string;
  parking_info?: string;
  venue_capacity?: number;
  estimated_attendance?: number;
  media_urls?: string[];
}

class EventManagementService {
  /**
   * Create a new event (DISABLED - users must submit requests instead)
   * This method now submits a request instead of creating directly
   */
  static async createEvent(eventData: CreateEventData): Promise<any> {
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      // Submit a request instead of creating directly
      const { MissingEntityRequestService } = await import('@/services/missingEntityRequestService');
      const request = await MissingEntityRequestService.submitRequest({
        entity_type: 'event',
        entity_name: eventData.title,
        entity_description: eventData.artist_name && eventData.venue_name 
          ? `${eventData.artist_name} at ${eventData.venue_name}`
          : undefined,
        entity_date: eventData.event_date,
        entity_location: eventData.venue_name,
        entity_image_url: eventData.poster_image_url,
        additional_info: {
          artist_name: eventData.artist_name,
          venue_name: eventData.venue_name,
          latitude: eventData.latitude,
          longitude: eventData.longitude,
          video_url: eventData.video_url,
          age_restriction: eventData.age_restriction,
          accessibility_info: eventData.accessibility_info,
          parking_info: eventData.parking_info,
          venue_capacity: eventData.venue_capacity,
          estimated_attendance: eventData.estimated_attendance,
          media_urls: eventData.media_urls,
        },
      });

      // Return a placeholder object so the UI doesn't break
      return {
        id: request.id,
        title: eventData.title,
        status: 'pending',
        message: 'Your event request has been submitted for review.',
      };
    } catch (error) {
      console.error('Error submitting event request:', error);
      throw error;
    }
  }

  /**
   * Get events created by the current user
   */
  static async getMyCreatedEvents(): Promise<any[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('created_by_user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching created events:', error);
      throw error;
    }
  }

  /**
   * Update an event (only by the creator)
   */
  static async updateEvent(eventId: string, updates: Partial<CreateEventData>): Promise<any> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      // Verify user owns this event
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('created_by_user_id')
        .eq('id', eventId)
        .single();

      if (eventError) throw eventError;
      if (event.created_by_user_id !== user.id) {
        throw new Error('You can only update events you created');
      }

      // Update the event
      const { data: updatedEvent, error: updateError } = await supabase
        .from('events')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventId)
        .select()
        .single();

      if (updateError) throw updateError;
      return updatedEvent;
    } catch (error) {
      console.error('Error updating event:', error);
      throw error;
    }
  }

  /**
   * Delete an event (only by the creator)
   */
  static async deleteEvent(eventId: string): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      // Verify user owns this event
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('created_by_user_id')
        .eq('id', eventId)
        .single();

      if (eventError) throw eventError;
      if (event.created_by_user_id !== user.id) {
        throw new Error('You can only delete events you created');
      }

      // Delete the event
      const { error: deleteError } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);

      if (deleteError) throw deleteError;
    } catch (error) {
      console.error('Error deleting event:', error);
      throw error;
    }
  }

  /**
   * Check if user can create events
   */
  static async canCreateEvents(): Promise<boolean> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return false;

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('account_type')
        .eq('user_id', user.id)
        .single();

      if (profileError) return false;
      return ['business', 'creator', 'admin'].includes(profile.account_type);
    } catch (error) {
      console.error('Error checking create permissions:', error);
      return false;
    }
  }
}

export default EventManagementService;
