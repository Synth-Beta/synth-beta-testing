import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import type { Artist, ArtistSearchResult, PaginatedEvents, ArtistEventSearch } from '@/types/concertSearch';

export type JamBaseEvent = Tables<'jambase_events'>;
export type UserJamBaseEvent = Tables<'user_jambase_events'>;
export type JamBaseEventInsert = TablesInsert<'jambase_events'>;
export type UserJamBaseEventInsert = TablesInsert<'user_jambase_events'>;

// Temporary types for new tables until Supabase types are updated
export type ArtistRecord = {
  id: string;
  jambase_artist_id?: string;
  name: string;
  description?: string;
  genres?: string[];
  image_url?: string;
  popularity_score?: number;
  created_at?: string;
  updated_at?: string;
};

export type UserArtist = {
  id: string;
  user_id: string;
  artist_id: string;
  created_at?: string;
};

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
    // Get all user's interested events
    const { data, error } = await supabase
      .from('user_jambase_events')
      .select(`
        created_at,
        jambase_event:jambase_events(
          id,
          jambase_event_id,
          title,
          artist_name,
          artist_id,
          venue_name,
          venue_id,
          venue_city,
          venue_state,
          venue_address,
          venue_zip,
          event_date,
          doors_time,
          description,
          genres,
          latitude,
          longitude,
          price_range,
          ticket_available,
          ticket_urls,
          setlist,
          setlist_enriched,
          setlist_song_count,
          setlist_fm_id,
          setlist_fm_url,
          setlist_source,
          setlist_last_updated,
          tour_name
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    // Filter out events that have been marked as attended (have a review with was_there=true)
    // This ensures "Interested Events" only shows events user hasn't attended yet
    try {
      const { data: attendedData, error: attendedError } = await supabase
        .from('user_reviews')
        .select('event_id')
        .eq('user_id', userId)
        .eq('was_there', true);
      
      if (attendedError) {
        console.warn('Could not fetch attended events, returning all interested events:', attendedError);
        return data;
      }
      
      // Create a Set of attended event IDs for fast lookup
      const attendedEventIds = new Set(attendedData?.map(item => item.event_id) || []);
      
      // Filter out attended events from the interested events list
      const filteredData = data?.filter(item => {
        const eventId = item.jambase_event?.id;
        return eventId && !attendedEventIds.has(eventId);
      });
      
      console.log(`📊 JamBaseService.getUserEvents: ${data?.length} total interested, ${attendedEventIds.size} attended, ${filteredData?.length} still interested`);
      
      return filteredData;
    } catch (err) {
      console.warn('Error filtering attended events, returning all interested events:', err);
      return data;
    }
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
          ticket_available,
          setlist,
          setlist_enriched,
          setlist_song_count,
          setlist_fm_id,
          setlist_fm_url,
          setlist_source,
          setlist_last_updated,
          tour_name
        )
      `)
      .eq('user_id', userId)
      .gte('jambase_events.event_date', now)
      .order('jambase_events.event_date', { ascending: true });

    if (error) throw error;
    return data;
  }

  // ===== ARTIST SEARCH METHODS =====

  /**
   * Search for artists using both database and JamBase API for complete results
   */
  static async searchArtists(query: string, limit: number = 10): Promise<ArtistSearchResult> {
    // NOTE: Avoid throwing in production; rely on env-configured backend when available
    
    console.log('🔍 Searching for artists:', query);
    console.log('🌐 Current origin:', window.location.origin);
    
    const allArtists = new Map();
    let totalFound = 0;

    try {
      // 1. Search database for artists
      console.log('📊 Searching database...');
      const { data: events, error } = await supabase
        .from('jambase_events')
        .select('artist_name, artist_id, genres')
        .ilike('artist_name', `%${query}%`)
        .limit(limit);

      if (!error && events && events.length > 0) {
        console.log('✅ Found', events.length, 'artists in database');
        
        // Convert events to artist format
        events.forEach(event => {
          if (event.artist_name && !allArtists.has(event.artist_name.toLowerCase())) {
            allArtists.set(event.artist_name.toLowerCase(), {
              id: event.artist_id || `db-${event.artist_name.toLowerCase().replace(/\s+/g, '-')}`,
              jambase_artist_id: event.artist_id,
              name: event.artist_name,
              description: `Artist found in our database with ${events.filter(e => e.artist_name === event.artist_name).length} events`,
              genres: event.genres || [],
              image_url: null,
              popularity_score: events.filter(e => e.artist_name === event.artist_name).length,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              source: 'database'
            });
          }
        });
      } else if (error) {
        console.error('❌ Database search error:', error);
      } else {
        console.log('📭 No artists found in database, trying fallback...');
      }

      // 2. Search JamBase API for additional artists
      console.log('🌐 Searching JamBase API...');
      try {
        const JAMBASE_API_KEY = import.meta.env.VITE_JAMBASE_API_KEY || 'e7ed3a9b-e73a-446e-b7c6-a96d1c53a030';

        // API routes disabled - will cause deployment to fail
        const baseUrl = 'http://localhost:3001/api/jambase';
        const searchUrl = new URL('/artists', baseUrl);
        searchUrl.searchParams.append('apikey', JAMBASE_API_KEY);
        searchUrl.searchParams.append('artistName', query);
        searchUrl.searchParams.append('num', limit.toString());
        searchUrl.searchParams.append('o', 'json');
        
        console.log('🌐 API URL:', searchUrl.toString());

        const response = await fetch(searchUrl.toString(), {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'PlusOneEventCrew/1.0'
          }
        });
        
        if (response.ok) {
          const data = await response.json();

          // Handle different response formats
          let apiArtists: any[] = [];
          if (data.success && data.artists && Array.isArray(data.artists)) {
            apiArtists = data.artists;
          } else if (Array.isArray(data)) {
            apiArtists = data;
          } else if (data.artists && Array.isArray(data.artists)) {
            apiArtists = data.artists;
          } else if (data['@graph'] && Array.isArray(data['@graph'])) {
            apiArtists = data['@graph'];
          }

          if (apiArtists.length > 0) {
            console.log('✅ Found', apiArtists.length, 'artists from JamBase API');
            
            // Transform and add API artists (avoid duplicates)
            const transformedArtists = this.transformJamBaseArtists(apiArtists);
            transformedArtists.forEach(artist => {
              const key = artist.name.toLowerCase();
              if (!allArtists.has(key)) {
                allArtists.set(key, {
                  ...artist,
                  source: 'jambase'
                });
              }
            });

            // Store API artists in database for future searches
            console.log('💾 Storing API artists in database...');
            try {
              await this.storeArtistsInDatabase(transformedArtists);
            } catch (storeError) {
              console.log('⚠️ Could not store artists in database:', storeError);
            }
          }
        } else {
          console.log('⚠️ JamBase API not available:', response.status);
        }
      } catch (apiError) {
        console.log('⚠️ JamBase API error:', apiError);
      }

      // 3. If we have results from database or API, return them
      const combinedArtists = Array.from(allArtists.values());
      
      if (combinedArtists.length > 0) {
        console.log('🎉 Total artists found from database/API:', combinedArtists.length);
        console.log('🎉 Artist sources:', combinedArtists.map(a => `${a.name} (${(a as any).source})`));
        return {
          artists: combinedArtists.slice(0, limit),
          totalFound: combinedArtists.length,
          query
        };
      }

      // 4. If no results from either source, use fallback
      console.log('📝 No results found, using fallback data');
      const fallbackArtists = this.getFallbackArtists(query);
      
      // Always ensure we have at least some results
      if (fallbackArtists.length === 0) {
        fallbackArtists.push({
          id: 'fallback-generic',
          jambase_artist_id: 'fallback-generic',
          name: query || 'Unknown Artist',
          description: `Search results for "${query}" - try searching for a specific artist name`,
          genres: ['Various'],
          image_url: null,
          popularity_score: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source: 'fallback'
        });
      }
      
      console.log('🎉 Returning fallback artists:', fallbackArtists.length);
      return {
        artists: fallbackArtists,
        totalFound: fallbackArtists.length,
        query
      };

    } catch (error) {
      console.error('❌ Search error:', error);
      console.log('📝 Using fallback data');
      
      // Return fallback data as last resort
      const fallbackArtists = this.getFallbackArtists(query);
      return {
        artists: fallbackArtists,
        totalFound: fallbackArtists.length,
        query
      };
    }
  }

  /**
   * Get paginated events for a specific artist (search by artist name)
   */
  static async getArtistEvents(searchParams: ArtistEventSearch): Promise<PaginatedEvents> {
    const { artistId, page, limit, dateRange, eventType = 'all' } = searchParams;
    const offset = (page - 1) * limit;

    try {
      // Get artist name from the artistId (which is actually the artist name in this simplified version)
      const artistName = artistId;

      // Build query for events using artist_name (case-insensitive partial match)
      let query = supabase
        .from('jambase_events')
        .select('*', { count: 'exact' })
        .ilike('artist_name', `%${artistName}%`);

      // Apply date filters
      const now = new Date().toISOString();
      if (eventType === 'past') {
        query = query.lt('event_date', now);
      } else if (eventType === 'upcoming') {
        query = query.gte('event_date', now);
      }

      if (dateRange?.startDate) {
        query = query.gte('event_date', dateRange.startDate);
      }
      if (dateRange?.endDate) {
        query = query.lte('event_date', dateRange.endDate);
      }

      // Order by date
      query = query.order('event_date', { ascending: eventType === 'past' ? false : true });

      const { data: events, error, count } = await query
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const totalFound = count || 0;
      const totalPages = Math.ceil(totalFound / limit);

      return {
        events: events || [],
        totalFound,
        currentPage: page,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      };

    } catch (error) {
      console.error('Error getting artist events:', error);
      throw new Error(`Failed to get artist events: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Transform JamBase artist data (no caching)
   */
  private static transformJamBaseArtists(jambaseArtists: any[]): Artist[] {
    return jambaseArtists.map((jbArtist, index) => ({
      id: jbArtist.identifier?.replace('jambase:', '') || jbArtist.id || `artist-${index}`,
      jambase_artist_id: jbArtist.identifier?.replace('jambase:', '') || jbArtist.id,
      name: jbArtist.name || 'Unknown Artist',
      description: jbArtist.description || jbArtist.bio || `Artist: ${jbArtist.name}`,
      genres: Array.isArray(jbArtist.genre) ? jbArtist.genre : [],
      image_url: jbArtist.image || jbArtist.photo || null,
      popularity_score: jbArtist['x-numUpcomingEvents'] || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
  }

  /**
   * Store artists in database for future searches
   */
  private static async storeArtistsInDatabase(artists: Artist[]): Promise<void> {
    try {
      // Create a simple events table entry for each artist
      const eventsToStore = artists.map(artist => ({
        jambase_event_id: `artist-${artist.id}`,
        title: `${artist.name} - Artist Profile`,
        artist_name: artist.name,
        artist_id: artist.jambase_artist_id || artist.id,
        venue_name: 'Artist Profile',
        venue_id: 'artist-profile',
        event_date: new Date().toISOString(),
        description: artist.description || `Artist: ${artist.name}`,
        genres: artist.genres || [],
        venue_city: 'Various',
        venue_state: 'Various',
        ticket_available: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      // Insert artists as "profile events" in the database
      const { error } = await supabase
        .from('jambase_events')
        .upsert(eventsToStore, { 
          onConflict: 'jambase_event_id',
          ignoreDuplicates: false 
        });

      if (error) {
        console.error('Error storing artists:', error);
      } else {
        console.log('✅ Stored', artists.length, 'artists in database');
      }
    } catch (error) {
      console.error('Error in storeArtistsInDatabase:', error);
    }
  }

  /**
   * Get fallback artist data for testing when API is unavailable
   */
  private static getFallbackArtists(query: string): Artist[] {
    const fallbackArtists = [
      {
        id: 'fallback-1',
        jambase_artist_id: 'fallback-1',
        name: 'The Beatles',
        description: 'English rock band, formed in Liverpool in 1960. One of the most influential bands in the history of popular music.',
        genres: ['Rock', 'Pop', 'Psychedelic Rock'],
        image_url: null,
        popularity_score: 95,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'fallback-2',
        jambase_artist_id: 'fallback-2',
        name: 'Radiohead',
        description: 'English rock band formed in Abingdon, Oxfordshire, in 1985. Known for their experimental and alternative rock sound.',
        genres: ['Alternative Rock', 'Electronic', 'Art Rock'],
        image_url: null,
        popularity_score: 88,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'fallback-3',
        jambase_artist_id: 'fallback-3',
        name: 'Pink Floyd',
        description: 'English rock band formed in London in 1965. Known for their progressive and psychedelic rock music.',
        genres: ['Progressive Rock', 'Psychedelic Rock', 'Art Rock'],
        image_url: null,
        popularity_score: 92,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'fallback-4',
        jambase_artist_id: 'fallback-4',
        name: 'Goose',
        description: 'American jam band from Connecticut known for their improvisational live performances.',
        genres: ['Jam Band', 'Rock', 'Funk'],
        image_url: null,
        popularity_score: 75,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'fallback-5',
        jambase_artist_id: 'fallback-5',
        name: 'Taylor Swift',
        description: 'American singer-songwriter known for her narrative songwriting and genre-spanning discography.',
        genres: ['Pop', 'Country', 'Folk'],
        image_url: null,
        popularity_score: 98,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'fallback-6',
        jambase_artist_id: 'fallback-6',
        name: 'Drake',
        description: 'Canadian rapper, singer, and songwriter known for his melodic rap style and commercial success.',
        genres: ['Hip-Hop', 'R&B', 'Pop'],
        image_url: null,
        popularity_score: 96,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'fallback-7',
        jambase_artist_id: 'fallback-7',
        name: 'Billie Eilish',
        description: 'American singer-songwriter known for her unique sound and introspective lyrics.',
        genres: ['Alternative Pop', 'Electronic', 'Indie'],
        image_url: null,
        popularity_score: 94,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'fallback-8',
        jambase_artist_id: 'fallback-8',
        name: 'The Weeknd',
        description: 'Canadian singer-songwriter known for his distinctive voice and R&B style.',
        genres: ['R&B', 'Pop', 'Alternative R&B'],
        image_url: null,
        popularity_score: 93,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    // If query is provided, try to find matches first
    if (query.trim()) {
      const matches = fallbackArtists.filter(artist => 
        artist.name.toLowerCase().includes(query.toLowerCase())
      );
      
      // If we found matches, return them
      if (matches.length > 0) {
        return matches;
      }
      
      // If no matches, return all fallback artists (better than nothing)
      return fallbackArtists;
    }

    return fallbackArtists;
  }
}
