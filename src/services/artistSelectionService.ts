import { JamBaseEventsService, JamBaseEvent } from './jambaseEventsService';
import { supabase } from '@/integrations/supabase/client';
import type { ArtistSearchResult } from './unifiedArtistSearchService';
import type { Artist } from '@/types/concertSearch';
import { UnifiedEventSearchService } from './unifiedEventSearchService';

export interface ArtistSelectionResult {
  artist: Artist;
  events: JamBaseEvent[];
  totalEvents: number;
  source: 'database' | 'api';
}

export class ArtistSelectionService {
  /**
   * Handle artist selection: fetch events from JamBase API and populate database
   */
  static async selectArtist(artistSearchResult: ArtistSearchResult): Promise<ArtistSelectionResult> {
    try {
      console.log('🎯 Selecting artist:', artistSearchResult.name);
      
      // Convert ArtistSearchResult to Artist type
      const artist: Artist = {
        id: artistSearchResult.id,
        jambase_artist_id: artistSearchResult.identifier,
        name: artistSearchResult.name,
        description: `Artist found with upcoming events`,
        genres: artistSearchResult.genres || [],
        image_url: artistSearchResult.image_url,
        popularity_score: artistSearchResult.num_upcoming_events || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source: artistSearchResult.is_from_database ? 'database' : 'jambase'
      };

      // Fetch events from database first
      console.log('🌐 Fetching events for artist:', artist.name);
      const dbEventsResult = await JamBaseEventsService.getEventsFromDatabase(artist.name, {
        page: 1,
        perPage: 50,
        eventType: 'all'
      });

      // Call Ticketmaster API to fetch upcoming and past events
      let ticketmasterEvents: JamBaseEvent[] = [];
      try {
        console.log('🎫 Fetching Ticketmaster events for artist:', artist.name);
        const tmEvents = await UnifiedEventSearchService.searchByArtist({
          artistName: artist.name,
          includePastEvents: true, // Include past events (last 3 months)
          pastEventsMonths: 3,
          limit: 200
        });
        
        // Convert UnifiedEvent to JamBaseEvent format
        ticketmasterEvents = tmEvents.map(event => ({
          id: event.id,
          jambase_event_id: event.jambase_event_id || event.ticketmaster_event_id,
          ticketmaster_event_id: event.ticketmaster_event_id,
          title: event.title,
          artist_name: event.artist_name,
          artist_id: event.artist_id,
          venue_name: event.venue_name,
          venue_id: event.venue_id,
          event_date: event.event_date,
          doors_time: event.doors_time,
          description: event.description,
          genres: event.genres,
          venue_address: event.venue_address,
          venue_city: event.venue_city,
          venue_state: event.venue_state,
          venue_zip: event.venue_zip,
          latitude: event.latitude,
          longitude: event.longitude,
          ticket_available: event.ticket_available,
          price_range: event.price_range,
          ticket_urls: event.ticket_urls,
          external_url: event.external_url,
          setlist: event.setlist,
          tour_name: event.tour_name,
          source: event.source || 'ticketmaster'
        } as JamBaseEvent));
        
        console.log(`✅ Fetched ${ticketmasterEvents.length} events from Ticketmaster`);
      } catch (tmError) {
        console.warn('⚠️ Ticketmaster API call failed, using database events only:', tmError);
      }

      // Merge database and Ticketmaster events
      const dbEvents: JamBaseEvent[] = (dbEventsResult.events || []).map(event => ({
        ...event,
        source: event.source || 'jambase'
      }));

      const allEvents = [...dbEvents, ...ticketmasterEvents];

      // Deduplicate events by artist_name + venue_name + event_date (normalized)
      const deduplicatedEvents = deduplicateEvents(allEvents);

      // Sort by date
      deduplicatedEvents.sort((a, b) => 
        new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
      );

      const upcomingCount = deduplicatedEvents.filter(e => new Date(e.event_date) >= new Date()).length;

      console.log('✅ Found events:', deduplicatedEvents.length, 'total (upcoming:', upcomingCount, ')');

      // Update artist description with actual event count
      artist.description = `Artist found with ${upcomingCount} upcoming events`;

      return {
        artist,
        events: deduplicatedEvents,
        totalEvents: deduplicatedEvents.length,
        source: ticketmasterEvents.length > 0 ? 'api' : (dbEventsResult.events.length > 0 ? 'database' : 'api')
      };

    } catch (error) {
      console.error('❌ Error selecting artist:', error);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to load events for this artist.';
      
      if (error instanceof Error) {
        if (error.message.includes('API error')) {
          errorMessage = 'Unable to connect to events database. Please try again later.';
        } else if (error.message.includes('Network')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else {
          errorMessage = `Failed to load events: ${error.message}`;
        }
      }
      
      throw new Error(errorMessage);
    }
  }

  // Helper function to deduplicate events
  function deduplicateEvents(events: JamBaseEvent[]): JamBaseEvent[] {
    const seen = new Map<string, JamBaseEvent>();
    
    return events.filter(event => {
      // Normalize artist and venue names for better matching
      const normalizeArtist = (event.artist_name || '').toLowerCase().trim();
      const normalizeVenue = (event.venue_name || '').toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/\bthe\s+/gi, '')
        .replace(/[^\w\s]/g, '')
        .trim();
      
      // Create unique key from artist + venue + date (date only, ignore time)
      const dateKey = event.event_date?.split('T')[0] || '';
      const key = `${normalizeArtist}|${normalizeVenue}|${dateKey}`;
      
      if (seen.has(key)) {
        // Prefer Ticketmaster if duplicate (newer data source)
        const existing = seen.get(key)!;
        if (event.source === 'ticketmaster' && existing.source !== 'ticketmaster') {
          seen.set(key, event);
          return true;
        }
        // If both are Ticketmaster or both database, prefer the first one
        return false;
      }
      
      seen.set(key, event);
      return true;
    });
  }

  /**
   * Get artist events from database only (no API call)
   */
  static async getArtistEventsFromDatabase(artistName: string): Promise<{
    events: JamBaseEvent[];
    total: number;
  }> {
    try {
      const result = await JamBaseEventsService.getEventsFromDatabase(artistName, {
        page: 1,
        perPage: 50,
        eventType: 'all'
      });

      return {
        events: result.events,
        total: result.total
      };
    } catch (error) {
      console.error('❌ Error getting artist events from database:', error);
      return { events: [], total: 0 };
    }
  }

  /**
   * Store artist selection in user's profile (optional)
   */
  static async storeArtistSelection(userId: string, artist: Artist): Promise<void> {
    try {
      // This could store the artist selection in a user_artists table
      // For now, we'll just log it
      console.log('💾 Storing artist selection for user:', userId, 'artist:', artist.name);
      
      // TODO: Implement user artist preferences storage if needed
      // const { error } = await supabase
      //   .from('user_artists')
      //   .upsert({
      //     user_id: userId,
      //     artist_id: artist.id,
      //     artist_name: artist.name
      //   });
      
    } catch (error) {
      console.error('❌ Error storing artist selection:', error);
      // Don't throw - this is optional
    }
  }
}
