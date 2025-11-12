import { supabase } from '@/integrations/supabase/client';
import { JamBaseArtist, JamBaseVenue } from './jambaseApiService';

export interface StoredArtist {
  id: string;
  jambase_artist_id: string;
  name: string;
  identifier: string;
  url?: string;
  image_url?: string;
  date_published?: string;
  date_modified?: string;
  created_at: string;
  updated_at: string;
}

export interface StoredVenue {
  id: string;
  jambase_venue_id: string;
  name: string;
  identifier: string;
  url?: string;
  image_url?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  date_published?: string;
  date_modified?: string;
  created_at: string;
  updated_at: string;
}

export interface UserEvent {
  id: string;
  user_id: string;
  artist_id: string;
  venue_id: string;
  event_name: string;
  event_date: string;
  event_time?: string;
  description?: string;
  created_at: string;
  updated_at: string;
  artist?: StoredArtist;
  venue?: StoredVenue;
}

export class ArtistVenueService {
  /**
   * Store or update an artist in the database
   */
  static async storeArtist(jamBaseArtist: JamBaseArtist): Promise<StoredArtist> {
    try {
      // Check if artist already exists (handle 406 errors gracefully)
      let existingArtist = null;
      try {
        const { data, error: checkError } = await supabase
        .from('artists')
        .select('*')
        .eq('jambase_artist_id', jamBaseArtist.identifier)
          .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 results gracefully

        if (data && !checkError) {
          existingArtist = data;
        }

        // Handle 406 errors specifically (Not Acceptable - usually RLS or header issues)
        if (checkError && (checkError.code === 'PGRST301' || checkError.status === 406)) {
          console.warn(`⚠️  406 error checking artist ${jamBaseArtist.name}, will try insert:`, checkError.message);
          existingArtist = null; // Treat as new artist if check fails
        } else if (checkError && checkError.code !== 'PGRST116') {
          console.warn(`⚠️  Database error checking artist ${jamBaseArtist.name}:`, checkError);
        }
      } catch (checkErr) {
        console.warn(`⚠️  Exception checking artist ${jamBaseArtist.name}:`, checkErr);
        existingArtist = null; // Treat as new artist if check fails
      }

      if (existingArtist) {
        // Update existing artist
        const { data, error } = await supabase
          .from('artists')
          .update({
            name: jamBaseArtist.name,
            identifier: jamBaseArtist.identifier,
            url: jamBaseArtist.url,
            image_url: jamBaseArtist.imageUrl,
            date_published: jamBaseArtist.datePublished,
            date_modified: jamBaseArtist.dateModified,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingArtist.id)
          .select()
          .maybeSingle();

        if (error) throw error;
        return data!;
      } else {
        // Create new artist
        const { data, error } = await supabase
          .from('artists')
          .insert({
            jambase_artist_id: jamBaseArtist.identifier,
            name: jamBaseArtist.name,
            identifier: jamBaseArtist.identifier,
            url: jamBaseArtist.url,
            image_url: jamBaseArtist.imageUrl,
            date_published: jamBaseArtist.datePublished,
            date_modified: jamBaseArtist.dateModified
          })
          .select()
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          throw new Error('Failed to insert artist: no data returned');
        }
        return data;
      }
    } catch (error) {
      console.error('Error storing artist:', error);
      throw new Error(`Failed to store artist: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store or update a venue in the database
   */
  static async storeVenue(jamBaseVenue: JamBaseVenue): Promise<StoredVenue> {
    try {
      // Check if venue already exists
      const { data: existingVenue } = await supabase
        .from('venues')
        .select('*')
        .eq('jambase_venue_id', jamBaseVenue.identifier)
        .single();

      if (existingVenue) {
        // Update existing venue
        const { data, error } = await supabase
          .from('venues')
          .update({
            name: jamBaseVenue.name,
            identifier: jamBaseVenue.identifier,
            url: jamBaseVenue.url,
            image_url: jamBaseVenue.imageUrl,
            address: jamBaseVenue.address,
            city: jamBaseVenue.city,
            state: jamBaseVenue.state,
            zip: jamBaseVenue.zip,
            country: jamBaseVenue.country,
            latitude: jamBaseVenue.latitude,
            longitude: jamBaseVenue.longitude,
            date_published: jamBaseVenue.datePublished,
            date_modified: jamBaseVenue.dateModified,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingVenue.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Create new venue
        const { data, error } = await supabase
          .from('venues')
          .insert({
            jambase_venue_id: jamBaseVenue.identifier,
            name: jamBaseVenue.name,
            identifier: jamBaseVenue.identifier,
            url: jamBaseVenue.url,
            image_url: jamBaseVenue.imageUrl,
            address: jamBaseVenue.address,
            city: jamBaseVenue.city,
            state: jamBaseVenue.state,
            zip: jamBaseVenue.zip,
            country: jamBaseVenue.country,
            latitude: jamBaseVenue.latitude,
            longitude: jamBaseVenue.longitude,
            date_published: jamBaseVenue.datePublished,
            date_modified: jamBaseVenue.dateModified
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    } catch (error) {
      console.error('Error storing venue:', error);
      throw new Error(`Failed to store venue: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a user event with artist and venue references
   */
  static async createUserEvent(
    userId: string,
    artist: JamBaseArtist,
    venue: JamBaseVenue,
    eventName: string,
    eventDate: string,
    eventTime?: string,
    description?: string
  ): Promise<UserEvent> {
    try {
      // Store artist and venue first
      const storedArtist = await this.storeArtist(artist);
      const storedVenue = await this.storeVenue(venue);

      // Create user event
      const { data, error } = await supabase
        .from('user_events')
        .insert({
          user_id: userId,
          artist_id: storedArtist.id,
          venue_id: storedVenue.id,
          event_name: eventName,
          event_date: eventDate,
          event_time: eventTime,
          description
        })
        .select(`
          *,
          artist:artists(*),
          venue:venues(*)
        `)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating user event:', error);
      throw new Error(`Failed to create user event: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user's events with artist and venue data
   */
  static async getUserEvents(userId: string): Promise<UserEvent[]> {
    try {
      const { data, error } = await supabase
        .from('user_events')
        .select(`
          *,
          artist:artists(*),
          venue:venues(*)
        `)
        .eq('user_id', userId)
        .order('event_date', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting user events:', error);
      throw new Error(`Failed to get user events: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search artists by name
   */
  static async searchArtists(query: string, limit: number = 10): Promise<StoredArtist[]> {
    try {
      const { data, error } = await supabase
        .from('artists')
        .select('*')
        .ilike('name', `%${query}%`)
        .limit(limit)
        .order('name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error searching artists:', error);
      throw new Error(`Failed to search artists: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search venues by name
   */
  static async searchVenues(query: string, limit: number = 10): Promise<StoredVenue[]> {
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('*')
        .ilike('name', `%${query}%`)
        .limit(limit)
        .order('name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error searching venues:', error);
      throw new Error(`Failed to search venues: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get artist by JamBase ID
   */
  static async getArtistByJamBaseId(jamBaseId: string): Promise<StoredArtist | null> {
    try {
      const { data, error } = await supabase
        .from('artists')
        .select('*')
        .eq('jambase_artist_id', jamBaseId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data || null;
    } catch (error) {
      console.error('Error getting artist by JamBase ID:', error);
      return null;
    }
  }

  /**
   * Get venue by JamBase ID
   */
  static async getVenueByJamBaseId(jamBaseId: string): Promise<StoredVenue | null> {
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('*')
        .eq('jambase_venue_id', jamBaseId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data || null;
    } catch (error) {
      console.error('Error getting venue by JamBase ID:', error);
      return null;
    }
  }
}
