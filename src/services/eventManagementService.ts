/**
 * Event Management Service
 * Handles event creation, claiming, media management, and ticket management for Phase 2
 */

import { supabase } from '@/integrations/supabase/client';

export interface CreateEventData {
  title: string;
  artist_name: string;
  venue_name: string;
  event_date: string; // ISO format timestamp
  doors_time?: string | null;
  description?: string;
  genres?: string[];
  venue_address?: string;
  venue_city?: string;
  venue_state?: string;
  venue_zip?: string;
  latitude?: number;
  longitude?: number;
  price_range?: string;
  poster_image_url?: string;
  media_urls?: string[];
  age_restriction?: string;
  accessibility_info?: string;
  parking_info?: string;
  venue_capacity?: number;
  event_status?: 'draft' | 'published';
}

export interface TicketInfo {
  ticket_provider: string;
  ticket_url: string;
  ticket_type?: string;
  price_min?: number;
  price_max?: number;
  currency?: string;
  available_from?: string;
  available_until?: string;
  is_primary?: boolean;
}

export interface EventClaimRequest {
  event_id: string;
  claim_reason: string;
  verification_proof?: string;
}

export interface EventClaimReview {
  claim_id: string;
  approved: boolean;
  admin_notes?: string;
}

export class EventManagementService {
  /**
   * Create a new event (for business accounts)
   */
  static async createEvent(eventData: CreateEventData): Promise<any> {
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      // Check user account type
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('account_type, business_info')
        .eq('user_id', user.id)
        .single();

      if (profileError) throw profileError;

      // Only business, admin, or users creating manual events can create events
      if (!['business', 'admin'].includes(profile.account_type)) {
        // Allow regular users only if it's marked as user-created
        if (!eventData.event_status || eventData.event_status !== 'draft') {
          throw new Error('Only business accounts can create events');
        }
      }

      // Create event
      const { data: event, error: eventError } = await supabase
        .from('jambase_events')
        .insert({
          ...eventData,
          created_by_user_id: user.id,
          owned_by_account_type: profile.account_type,
          is_user_created: profile.account_type === 'user',
          event_status: eventData.event_status || 'published',
          ticket_available: false, // Will be set when tickets are added
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (eventError) throw eventError;

      return event;
    } catch (error) {
      console.error('Error creating event:', error);
      throw error;
    }
  }

  /**
   * Update an existing event
   */
  static async updateEvent(eventId: string, updates: Partial<CreateEventData>): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('jambase_events')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating event:', error);
      throw error;
    }
  }

  /**
   * Delete an event
   */
  static async deleteEvent(eventId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('jambase_events')
        .delete()
        .eq('id', eventId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting event:', error);
      throw error;
    }
  }

  /**
   * Get events created by a user
   */
  static async getUserCreatedEvents(userId?: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .rpc('get_user_created_events', {
          p_user_id: userId || null,
        });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching user created events:', error);
      throw error;
    }
  }

  /**
   * Add media to an event
   */
  static async addEventMedia(eventId: string, mediaUrls: string[]): Promise<any> {
    try {
      // Get current media
      const { data: event, error: fetchError } = await supabase
        .from('jambase_events')
        .select('media_urls')
        .eq('id', eventId)
        .single();

      if (fetchError) throw fetchError;

      const currentMedia = event.media_urls || [];
      const updatedMedia = [...currentMedia, ...mediaUrls];

      // Update event with new media
      const { data, error } = await supabase
        .from('jambase_events')
        .update({ media_urls: updatedMedia })
        .eq('id', eventId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error adding event media:', error);
      throw error;
    }
  }

  /**
   * Remove media from an event
   */
  static async removeEventMedia(eventId: string, mediaUrl: string): Promise<any> {
    try {
      // Get current media
      const { data: event, error: fetchError } = await supabase
        .from('jambase_events')
        .select('media_urls')
        .eq('id', eventId)
        .single();

      if (fetchError) throw fetchError;

      const currentMedia = event.media_urls || [];
      const updatedMedia = currentMedia.filter((url: string) => url !== mediaUrl);

      // Update event with removed media
      const { data, error } = await supabase
        .from('jambase_events')
        .update({ media_urls: updatedMedia })
        .eq('id', eventId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error removing event media:', error);
      throw error;
    }
  }

  /**
   * Add ticket information to an event
   */
  static async addEventTicket(eventId: string, ticketInfo: TicketInfo): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('event_tickets')
        .insert({
          event_id: eventId,
          ...ticketInfo,
        })
        .select()
        .single();

      if (error) throw error;

      // Update event to mark ticket as available
      await supabase
        .from('jambase_events')
        .update({ ticket_available: true })
        .eq('id', eventId);

      return data;
    } catch (error) {
      console.error('Error adding event ticket:', error);
      throw error;
    }
  }

  /**
   * Get tickets for an event
   */
  static async getEventTickets(eventId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('event_tickets')
        .select('*')
        .eq('event_id', eventId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching event tickets:', error);
      throw error;
    }
  }

  /**
   * Update ticket information
   */
  static async updateEventTicket(ticketId: string, updates: Partial<TicketInfo>): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('event_tickets')
        .update(updates)
        .eq('id', ticketId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating event ticket:', error);
      throw error;
    }
  }

  /**
   * Delete a ticket
   */
  static async deleteEventTicket(ticketId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('event_tickets')
        .delete()
        .eq('id', ticketId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting event ticket:', error);
      throw error;
    }
  }

  /**
   * Claim an event (for creators)
   */
  static async claimEvent(claimRequest: EventClaimRequest): Promise<string> {
    try {
      const { data, error } = await supabase.rpc('claim_event', {
        p_event_id: claimRequest.event_id,
        p_claim_reason: claimRequest.claim_reason,
        p_verification_proof: claimRequest.verification_proof || null,
      });

      if (error) throw error;
      return data; // Returns claim_id
    } catch (error) {
      console.error('Error claiming event:', error);
      throw error;
    }
  }

  /**
   * Get user's event claims
   */
  static async getUserEventClaims(userId?: string): Promise<any[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      const targetUserId = userId || user.id;

      const { data, error } = await supabase
        .from('event_claims')
        .select(`
          *,
          event:jambase_events(
            id,
            title,
            artist_name,
            venue_name,
            event_date,
            poster_image_url
          )
        `)
        .eq('claimer_user_id', targetUserId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching event claims:', error);
      throw error;
    }
  }

  /**
   * Get claimed events for a creator
   */
  static async getClaimedEvents(userId?: string): Promise<any[]> {
    try {
      const { data, error } = await supabase.rpc('get_claimed_events', {
        p_user_id: userId || null,
      });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching claimed events:', error);
      throw error;
    }
  }

  /**
   * Review an event claim (admin only)
   */
  static async reviewEventClaim(review: EventClaimReview): Promise<void> {
    try {
      const { error } = await supabase.rpc('review_event_claim', {
        p_claim_id: review.claim_id,
        p_approved: review.approved,
        p_admin_notes: review.admin_notes || null,
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error reviewing event claim:', error);
      throw error;
    }
  }

  /**
   * Get pending event claims (admin only)
   */
  static async getPendingEventClaims(): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('event_claims')
        .select(`
          *,
          event:jambase_events(
            id,
            title,
            artist_name,
            venue_name,
            event_date,
            poster_image_url
          ),
          claimer:profiles!event_claims_claimer_user_id_fkey(
            name,
            avatar_url
          )
        `)
        .eq('claim_status', 'pending')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching pending claims:', error);
      throw error;
    }
  }

  /**
   * Change event status
   */
  static async changeEventStatus(
    eventId: string,
    status: 'draft' | 'published' | 'cancelled' | 'postponed' | 'rescheduled'
  ): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('jambase_events')
        .update({
          event_status: status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error changing event status:', error);
      throw error;
    }
  }

  /**
   * Check if user can edit event
   */
  static async canEditEvent(eventId: string): Promise<boolean> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return false;

      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('account_type')
        .eq('user_id', user.id)
        .single();

      if (profileError) return false;

      // Admins can edit any event
      if (profile.account_type === 'admin') return true;

      // Check if user created or claimed the event
      const { data: event, error: eventError } = await supabase
        .from('jambase_events')
        .select('created_by_user_id, claimed_by_creator_id')
        .eq('id', eventId)
        .single();

      if (eventError) return false;

      return (
        event.created_by_user_id === user.id ||
        event.claimed_by_creator_id === user.id
      );
    } catch (error) {
      console.error('Error checking edit permission:', error);
      return false;
    }
  }
}

export default EventManagementService;

