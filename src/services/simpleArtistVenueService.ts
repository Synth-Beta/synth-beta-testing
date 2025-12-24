// Simple Artist/Venue Service - Works with existing infrastructure
// This service provides the missing functionality without requiring database changes

import { supabase } from '@/integrations/supabase/client';

export interface ArtistWithEvents {
  id: string;
  name: string;
  image_url?: string;
  events: Array<{
    event_id: string;
    event_title: string;
    venue_name: string;
    event_date: string;
    venue_city?: string;
    venue_state?: string;
  }>;
}

export interface VenueWithEvents {
  id: string;
  name: string;
  image_url?: string;
  events: Array<{
    event_id: string;
    event_title: string;
    artist_name: string;
    event_date: string;
    venue_city?: string;
    venue_state?: string;
  }>;
}

export class SimpleArtistVenueService {
  /**
   * Get artist data with events by matching artist name from jambase_events
   */
  static async getArtistByName(artistName: string): Promise<ArtistWithEvents | null> {
    try {
      // First, try to find the artist in the artists table by name
      const { data: artist, error: artistError } = await supabase
        .from('artists')
        .select('*')
        .eq('name', artistName)
        .single();

      if (artist && !artistError) {
        // Get events for this artist
        const events = await this.getEventsForArtist(artist.id);
        return {
          id: artist.id,
          name: artist.name,
          image_url: artist.image_url,
          events
        };
      }

      // If not found by exact name, try to find by jambase_artist_id from jambase_events
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('artist_id, artist_name')
        .eq('artist_name', artistName)
        .not('artist_id', 'is', null)
        .limit(1)
        .single();

      if (eventData && !eventError && eventData.artist_id) {
        // Try to find artist by jambase_artist_id
        const { data: artistByJambaseId, error: artistByJambaseError } = await supabase
          .from('artists')
          .select('*')
          .eq('jambase_artist_id', eventData.artist_id)
          .single();

        if (artistByJambaseId && !artistByJambaseError) {
          const events = await this.getEventsForArtist(artistByJambaseId.id);
          return {
            id: artistByJambaseId.id,
            name: artistByJambaseId.name,
            image_url: artistByJambaseId.image_url,
            events
          };
        }
      }

      // Fallback: return basic artist info with events from jambase_events
      const events = await this.getEventsForArtistByName(artistName);
      return {
        id: `temp-${artistName.toLowerCase().replace(/\s+/g, '-')}`,
        name: artistName,
        image_url: undefined,
        events
      };
    } catch (error) {
      console.error('Error getting artist by name:', error);
      return null;
    }
  }

  /**
   * Get venue data with events by matching venue name from jambase_events
   */
  static async getVenueByName(venueName: string): Promise<VenueWithEvents | null> {
    try {
      // First, try to find the venue in the venues table by name
      const { data: venue, error: venueError } = await supabase
        .from('venues')
        .select('*')
        .eq('name', venueName)
        .single();

      if (venue && !venueError) {
        // Get events for this venue
        const events = await this.getEventsForVenue(venue.id);
        return {
          id: venue.id,
          name: venue.name,
          image_url: venue.image_url,
          events
        };
      }

      // If not found by exact name, try to find by jambase_venue_id from jambase_events
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('venue_id, venue_name')
        .eq('venue_name', venueName)
        .not('venue_id', 'is', null)
        .limit(1)
        .single();

      if (eventData && !eventError && eventData.venue_id) {
        // Try to find venue by jambase_venue_id
        const { data: venueByJambaseId, error: venueByJambaseError } = await supabase
          .from('venues')
          .select('*')
          .eq('jambase_venue_id', eventData.venue_id)
          .single();

        if (venueByJambaseId && !venueByJambaseError) {
          const events = await this.getEventsForVenue(venueByJambaseId.id);
          return {
            id: venueByJambaseId.id,
            name: venueByJambaseId.name,
            image_url: venueByJambaseId.image_url,
            events
          };
        }
      }

      // Fallback: return basic venue info with events from jambase_events
      const events = await this.getEventsForVenueByName(venueName);
      return {
        id: `temp-${venueName.toLowerCase().replace(/\s+/g, '-')}`,
        name: venueName,
        image_url: undefined,
        events
      };
    } catch (error) {
      console.error('Error getting venue by name:', error);
      return null;
    }
  }

  /**
   * Get events for an artist by artist ID (JamBase ID or UUID)
   */
  private static async getEventsForArtist(artistId: string): Promise<Array<any>> {
    try {
      // First, try to get JamBase ID if artistId is a UUID
      let jambaseArtistId = artistId;
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(artistId);
      
      if (isUUID) {
        // Look up JamBase ID from artists table
        const { data: artist } = await supabase
          .from('artists')
          .select('jambase_artist_id')
          .eq('id', artistId)
          .single();
        
        if (artist?.jambase_artist_id) {
          jambaseArtistId = artist.jambase_artist_id;
        }
      }

      // Query events by JamBase artist_id
      const { data: fallbackEvents, error: fallbackError } = await supabase
        .from('events')
        .select('id, title, venue_name, event_date, venue_city, venue_state')
        .eq('artist_id', jambaseArtistId)
        .not('artist_id', 'is', null)
        .order('event_date', { ascending: false })
        .limit(10);

      if (fallbackEvents && !fallbackError) {
        return fallbackEvents.map(event => ({
          event_id: event.id,
          event_title: event.title,
          venue_name: event.venue_name,
          event_date: event.event_date,
          venue_city: event.venue_city,
          venue_state: event.venue_state
        }));
      }

      return [];
    } catch (error) {
      console.error('Error getting events for artist:', error);
      return [];
    }
  }

  /**
   * Get events for a venue by venue ID (JamBase ID or UUID)
   */
  private static async getEventsForVenue(venueId: string): Promise<Array<any>> {
    try {
      // First, try to get JamBase ID if venueId is a UUID
      let jambaseVenueId = venueId;
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(venueId);
      
      if (isUUID) {
        // Look up JamBase ID from venues table
        const { data: venue } = await supabase
          .from('venues')
          .select('jambase_venue_id')
          .eq('id', venueId)
          .single();
        
        if (venue?.jambase_venue_id) {
          jambaseVenueId = venue.jambase_venue_id;
        }
      }

      // Query events by JamBase venue_id
      const { data: fallbackEvents, error: fallbackError } = await supabase
        .from('events')
        .select('id, title, artist_name, event_date, venue_city, venue_state')
        .eq('venue_id', jambaseVenueId)
        .not('venue_id', 'is', null)
        .order('event_date', { ascending: false })
        .limit(10);

      if (fallbackEvents && !fallbackError) {
        return fallbackEvents.map(event => ({
          event_id: event.id,
          event_title: event.title,
          artist_name: event.artist_name,
          event_date: event.event_date,
          venue_city: event.venue_city,
          venue_state: event.venue_state
        }));
      }

      return [];
    } catch (error) {
      console.error('Error getting events for venue:', error);
      return [];
    }
  }

  /**
   * Get events for an artist by artist name (fallback method)
   */
  private static async getEventsForArtistByName(artistName: string): Promise<Array<any>> {
    try {
      const { data: events, error } = await supabase
        .from('events')
        .select('id, title, venue_name, event_date, venue_city, venue_state')
        .eq('artist_name', artistName)
        .order('event_date', { ascending: false })
        .limit(10);

      if (events && !error) {
        return events.map(event => ({
          event_id: event.id,
          event_title: event.title,
          venue_name: event.venue_name,
          event_date: event.event_date,
          venue_city: event.venue_city,
          venue_state: event.venue_state
        }));
      }

      return [];
    } catch (error) {
      console.error('Error getting events for artist by name:', error);
      return [];
    }
  }

  /**
   * Get events for a venue by venue name (fallback method)
   */
  private static async getEventsForVenueByName(venueName: string): Promise<Array<any>> {
    try {
      const { data: events, error } = await supabase
        .from('events')
        .select('id, title, artist_name, event_date, venue_city, venue_state')
        .eq('venue_name', venueName)
        .order('event_date', { ascending: false })
        .limit(10);

      if (events && !error) {
        return events.map(event => ({
          event_id: event.id,
          event_title: event.title,
          artist_name: event.artist_name,
          event_date: event.event_date,
          venue_city: event.venue_city,
          venue_state: event.venue_state
        }));
      }

      return [];
    } catch (error) {
      console.error('Error getting events for venue by name:', error);
      return [];
    }
  }
}
