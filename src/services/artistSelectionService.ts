import { JamBaseEventsService, JamBaseEvent } from './jambaseEventsService';
import { supabase } from '@/integrations/supabase/client';
import type { ArtistSearchResult } from './unifiedArtistSearchService';
import type { Artist } from '@/types/concertSearch';

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

      // Fetch events for this artist using JamBase API - only upcoming events
      console.log('🌐 Fetching events for artist:', artist.name);
      const eventsResult = await JamBaseEventsService.getOrFetchArtistEvents(artist.name, {
        page: 1,
        perPage: 20,
        eventType: 'upcoming', // Only fetch upcoming events
        forceRefresh: true // Always fetch from API and populate database
      });

      console.log('✅ Found events:', eventsResult.events.length, 'from', eventsResult.source);
      console.log('📊 Events result details:', {
        eventsCount: eventsResult.events.length,
        total: eventsResult.total,
        firstEvent: eventsResult.events[0],
        source: eventsResult.source
      });

      // Update artist description with actual event count
      // Since we're only fetching upcoming events, all events are upcoming
      artist.description = `Artist found with ${eventsResult.events.length} upcoming events`;

      return {
        artist,
        events: eventsResult.events,
        totalEvents: eventsResult.total,
        source: eventsResult.source
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
