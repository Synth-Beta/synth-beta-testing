import { supabase } from '@/integrations/supabase/client';
import type { ArtistSearchResult } from './unifiedArtistSearchService';
import type { Artist } from '@/types/concertSearch';
import type { JamBaseEvent } from '@/types/eventTypes';

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

      // Fetch events from database
      console.log('🌐 Fetching events for artist:', artist.name);
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .ilike('artist_name', `%${artist.name}%`)
        .order('event_date', { ascending: true })
        .limit(50);

      if (eventsError) throw eventsError;

      // Use only database events
      const dbEvents: JamBaseEvent[] = (eventsData || []).map(event => ({
        ...event,
        source: event.source || 'jambase'
      }));

      const allEvents = [...dbEvents];

      // Deduplicate events by artist_name + venue_name + event_date (normalized)
      const deduplicatedEvents = this.deduplicateEvents(allEvents);

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
        source: dbEvents.length > 0 ? 'database' : 'api'
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
  private static deduplicateEvents(events: JamBaseEvent[]): JamBaseEvent[] {
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
        // Keep first occurrence
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
      const { data: eventsData, error } = await supabase
        .from('events')
        .select('*', { count: 'exact' })
        .ilike('artist_name', `%${artistName}%`)
        .order('event_date', { ascending: true })
        .limit(50);

      if (error) throw error;

      const events: JamBaseEvent[] = (eventsData || []).map(event => ({
        ...event,
        source: event.source || 'jambase'
      }));

      return {
        events,
        total: events.length
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
