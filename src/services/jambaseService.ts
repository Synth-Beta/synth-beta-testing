import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type JamBaseEvent = Tables<'jambase_events'>;
export type UserJamBaseEvent = Tables<'user_jambase_events'>;
export type JamBaseEventInsert = TablesInsert<'jambase_events'>;
export type UserJamBaseEventInsert = TablesInsert<'user_jambase_events'>;

export class JamBaseService {
  /**
   * Get all JamBase events
   */
  static async getEvents(limit = 50, offset = 0) {
    const { data, error } = await supabase
      .from('jambase_events')
      .select('*')
      .order('event_date', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data;
  }

  /**
   * Get a specific JamBase event by ID
   */
  static async getEventById(id: string) {
    const { data, error } = await supabase
      .from('jambase_events')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Search JamBase events by artist name
   */
  static async searchEventsByArtist(artistName: string, limit = 20) {
    const { data, error } = await supabase
      .from('jambase_events')
      .select('*')
      .ilike('artist_name', `%${artistName}%`)
      .order('event_date', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  /**
   * Search JamBase events by venue
   */
  static async searchEventsByVenue(venueName: string, limit = 20) {
    const { data, error } = await supabase
      .from('jambase_events')
      .select('*')
      .ilike('venue_name', `%${venueName}%`)
      .order('event_date', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  /**
   * Get events by date range
   */
  static async getEventsByDateRange(startDate: string, endDate: string) {
    const { data, error } = await supabase
      .from('jambase_events')
      .select('*')
      .gte('event_date', startDate)
      .lte('event_date', endDate)
      .order('event_date', { ascending: true });

    if (error) throw error;
    return data;
  }

  /**
   * Create a new JamBase event
   */
  static async createEvent(event: JamBaseEventInsert) {
    const { data, error } = await supabase
      .from('jambase_events')
      .insert(event)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update a JamBase event
   */
  static async updateEvent(id: string, updates: TablesUpdate<'jambase_events'>) {
    const { data, error } = await supabase
      .from('jambase_events')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Delete a JamBase event
   */
  static async deleteEvent(id: string) {
    const { error } = await supabase
      .from('jambase_events')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Get user's interested JamBase events
   */
  static async getUserEvents(userId: string) {
    const { data, error } = await supabase
      .from('user_jambase_events')
      .select(`
        created_at,
        jambase_event:jambase_events(
          id,
          title,
          artist_name,
          venue_name,
          venue_city,
          venue_state,
          event_date,
          doors_time,
          description,
          genres,
          price_range,
          ticket_available
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  /**
   * Add a JamBase event to user's interests
   */
  static async addUserEvent(userId: string, jambaseEventId: string) {
    const { data, error } = await supabase
      .from('user_jambase_events')
      .insert({
        user_id: userId,
        jambase_event_id: jambaseEventId
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Remove a JamBase event from user's interests
   */
  static async removeUserEvent(userId: string, jambaseEventId: string) {
    const { error } = await supabase
      .from('user_jambase_events')
      .delete()
      .eq('user_id', userId)
      .eq('jambase_event_id', jambaseEventId);

    if (error) throw error;
  }

  /**
   * Check if user is interested in a specific event
   */
  static async isUserInterested(userId: string, jambaseEventId: string) {
    const { data, error } = await supabase
      .from('user_jambase_events')
      .select('id')
      .eq('user_id', userId)
      .eq('jambase_event_id', jambaseEventId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  }

  /**
   * Get upcoming events for a user (events they're interested in that are in the future)
   */
  static async getUpcomingUserEvents(userId: string) {
    const now = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('user_jambase_events')
      .select(`
        created_at,
        jambase_event:jambase_events(
          id,
          title,
          artist_name,
          venue_name,
          venue_city,
          venue_state,
          event_date,
          doors_time,
          description,
          genres,
          price_range,
          ticket_available
        )
      `)
      .eq('user_id', userId)
      .gte('jambase_events.event_date', now)
      .order('jambase_events.event_date', { ascending: true });

    if (error) throw error;
    return data;
  }
}
