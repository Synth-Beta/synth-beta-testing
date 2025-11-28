import { supabase } from '@/integrations/supabase/client';
import type { Artist, ArtistSearchResult, PaginatedEvents, ArtistEventSearch } from '@/types/concertSearch';

// Type definitions - using any since Supabase Database types are not properly exported
export type JamBaseEvent = any;
export type UserJamBaseEvent = any;
export type UserJamBaseEventInsert = any;
export type JamBaseEventInsert = any;
export type JamBaseEventUpdate = any;

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
      .from('events')
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
      .from('events')
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
    const now = new Date().toISOString();
    
    // First, try to get upcoming events (sorted by date ascending - nearest first)
    const { data: upcomingEvents, error: upcomingError } = await supabase
      .from('events')
      .select('*')
      .ilike('artist_name', `%${artistName}%`)
      .gte('event_date', now) // Only events in the future
      .order('event_date', { ascending: true })
      .limit(limit);

    if (upcomingError) throw upcomingError;
    
    // If we got enough upcoming events, return them
    if (upcomingEvents && upcomingEvents.length >= limit) {
      return upcomingEvents;
    }
    
    // Otherwise, get the most recent past events to fill out the remaining slots
    if (upcomingEvents && upcomingEvents.length > 0) {
      const remainingSlots = limit - upcomingEvents.length;
      const { data: pastEvents, error: pastError } = await supabase
        .from('events')
        .select('*')
        .ilike('artist_name', `%${artistName}%`)
        .lt('event_date', now)
        .order('event_date', { ascending: false }) // Most recent past events first
        .limit(remainingSlots);
      
      if (pastError) throw pastError;
      
      return [...(upcomingEvents || []), ...(pastEvents || [])];
    }
    
    // If no upcoming events, just return the most recent past events
    const { data: allEvents, error: allError } = await supabase
      .from('events')
      .select('*')
      .ilike('artist_name', `%${artistName}%`)
      .order('event_date', { ascending: false })
      .limit(limit);
    
    if (allError) throw allError;
    return allEvents;
  }

  /**
   * Search JamBase events by venue
   */
  static async searchEventsByVenue(venueName: string, limit = 20) {
    const { data, error } = await supabase
      .from('events')
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
      .from('events')
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
      .from('events')
      .insert(event)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update a JamBase event
   */
  static async updateEvent(id: string, updates: JamBaseEventUpdate) {
    const { data, error } = await supabase
      .from('events')
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
      .from('events')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Get user's interested JamBase events
   */
  static async getUserEvents(userId: string) {
    // Get all user's interested events from relationships table (3NF schema)
    // First get relationships, then query events separately (no foreign key join available)
    // Try with status filter first
    let { data: relationships, error: relationshipsError } = await supabase
      .from('relationships')
      .select('related_entity_id, created_at, status')
      .eq('user_id', userId)
      .eq('related_entity_type', 'event')
      .eq('relationship_type', 'interest')
      .eq('status', 'accepted')
      .order('created_at', { ascending: false });
    
    // If no results with status filter, try without it (in case status wasn't set)
    if ((!relationships || relationships.length === 0) && !relationshipsError) {
      console.log('🔍 getUserEvents: No relationships found with status filter, trying without...');
      const { data: relationshipsWithoutStatus, error: errorWithoutStatus } = await supabase
        .from('relationships')
        .select('related_entity_id, created_at, status')
        .eq('user_id', userId)
        .eq('related_entity_type', 'event')
        .eq('relationship_type', 'interest')
        .order('created_at', { ascending: false });
      
      if (errorWithoutStatus) {
        relationshipsError = errorWithoutStatus;
      } else if (relationshipsWithoutStatus && relationshipsWithoutStatus.length > 0) {
        relationships = relationshipsWithoutStatus;
        console.log(`🔍 getUserEvents: Found ${relationships.length} relationships without status filter`);
      }
    }

    if (relationshipsError) throw relationshipsError;
    
    if (!relationships || relationships.length === 0) {
      return [];
    }

    // Extract event IDs (they're stored as TEXT UUIDs in related_entity_id)
    const eventIds = relationships.map(r => r.related_entity_id).filter(Boolean);
    
    if (eventIds.length === 0) {
      console.log('🔍 getUserEvents: No event IDs found in relationships');
      return [];
    }

    console.log('🔍 getUserEvents: Querying events for IDs:', eventIds.slice(0, 5));

    // Query events separately - eventIds are TEXT UUIDs, but events.id is UUID type
    // Supabase should handle the conversion, but we'll query both ways to be safe
    let events: any[] = [];
    let uuidError: any = null;
    
    // First try: query by UUID (eventIds might be UUID strings)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validUuids = eventIds.filter(id => uuidPattern.test(String(id)));
    
    if (validUuids.length > 0) {
      const result = await supabase
        .from('events')
        .select(`
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
          tour_name
        `)
        .in('id', validUuids);
      
      uuidError = result.error;
      
      if (result.data && !result.error) {
        events = result.data;
        console.log(`🔍 getUserEvents: Found ${events.length} events by UUID`);
      } else if (result.error) {
        console.warn('🔍 getUserEvents: Error querying by UUID:', result.error);
      }
    }
    
    // Second try: if we didn't find all events, try by jambase_event_id for any remaining
    const foundEventIds = new Set(events.map(e => String(e.id || e.jambase_event_id)));
    const missingIds = eventIds.filter(id => !foundEventIds.has(String(id)));
    
    if (missingIds.length > 0 && events.length < eventIds.length) {
      console.log(`🔍 getUserEvents: ${missingIds.length} events not found by UUID, trying jambase_event_id`);
      const { data: eventsByJambaseId, error: jambaseError } = await supabase
        .from('events')
        .select(`
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
          tour_name
        `)
        .in('jambase_event_id', missingIds);
      
      if (eventsByJambaseId && !jambaseError) {
        // Merge with existing events, avoiding duplicates
        const existingIds = new Set(events.map(e => String(e.id || e.jambase_event_id)));
        const newEvents = eventsByJambaseId.filter(e => !existingIds.has(String(e.id || e.jambase_event_id)));
        events = [...events, ...newEvents];
        console.log(`🔍 getUserEvents: Added ${newEvents.length} more events by jambase_event_id`);
      } else if (jambaseError) {
        console.warn('🔍 getUserEvents: Error querying by jambase_event_id:', jambaseError);
      }
    }

    // Combine relationships with events, preserving order
    // Create map with multiple key formats to ensure matching (handle UUID as both UUID and TEXT)
    const eventMap = new Map<string, any>();
    events.forEach(e => {
      // Add by UUID (id) - normalize to lowercase string for consistent matching
      if (e.id) {
        const idStr = String(e.id).toLowerCase();
        eventMap.set(idStr, e);
        eventMap.set(String(e.id), e);
        eventMap.set(e.id, e); // Also add as-is in case of type mismatch
      }
      // Add by jambase_event_id
      if (e.jambase_event_id) {
        eventMap.set(String(e.jambase_event_id).toLowerCase(), e);
        eventMap.set(String(e.jambase_event_id), e);
      }
    });
    
    console.log('🔍 getUserEvents - Matching relationships to events:', {
      relationshipsCount: relationships.length,
      eventsCount: events.length,
      eventMapKeys: Array.from(eventMap.keys()).slice(0, 5),
      sampleRelatedEntityIds: relationships.slice(0, 3).map(r => r.related_entity_id)
    });
    
    const data = relationships
      .map(r => {
        // Try to find event by related_entity_id (stored as TEXT UUID)
        // Normalize to lowercase for consistent matching
        const normalizedId = String(r.related_entity_id).toLowerCase();
        const event = eventMap.get(normalizedId) || 
                     eventMap.get(r.related_entity_id) || 
                     eventMap.get(String(r.related_entity_id));
        
        if (!event) {
          console.warn('⚠️ Could not match relationship to event:', {
            related_entity_id: r.related_entity_id,
            normalizedId,
            availableKeys: Array.from(eventMap.keys()).slice(0, 10)
          });
        }
        
        return event ? { created_at: r.created_at, event } : null;
      })
      .filter(Boolean);

    if (uuidError && !events.length) {
      console.warn('🔍 getUserEvents: Error fetching events:', uuidError);
      // Return empty array if we can't fetch events
      return [];
    }
    
    // Filter out events that have been marked as attended (have a review with was_there=true)
    // This ensures "Interested Events" only shows events user hasn't attended yet
    try {
      const { data: attendedData, error: attendedError } = await supabase
        .from('reviews')
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
        const eventId = item.event?.id;
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
      .from('relationships')
      .insert({
        user_id: userId,
        related_entity_type: 'event',
        related_entity_id: jambaseEventId,
        relationship_type: 'interest',
        status: 'accepted',
        metadata: { event_id: jambaseEventId }
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
      .from('relationships')
      .delete()
      .eq('user_id', userId)
      .eq('related_entity_type', 'event')
      .eq('related_entity_id', jambaseEventId)
      .in('relationship_type', ['interest', 'going', 'maybe']);

    if (error) throw error;
  }

  /**
   * Check if user is interested in a specific event
   */
  static async isUserInterested(userId: string, jambaseEventId: string) {
    const { data, error } = await supabase
      .from('relationships')
      .select('id')
      .eq('user_id', userId)
      .eq('related_entity_type', 'event')
      .eq('related_entity_id', jambaseEventId)
      .in('relationship_type', ['interest', 'going', 'maybe'])
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  }

  /**
   * Get upcoming events for a user (events they're interested in that are in the future)
   */
  static async getUpcomingUserEvents(userId: string) {
    const now = new Date().toISOString();
    
    // Get all user's interested events, then filter for upcoming ones
    const { data, error } = await supabase
      .from('relationships')
      .select(`
        created_at,
        event:events(
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
          tour_name
        )
      `)
      .eq('user_id', userId)
      .eq('related_entity_type', 'event')
      .in('relationship_type', ['interest', 'going', 'maybe']);

    if (error) throw error;
    
    // Filter for upcoming events and sort by date
    const upcomingEvents = data
      ?.filter(item => item.event && item.event.event_date >= now)
      .sort((a, b) => {
        const dateA = a.event?.event_date || '';
        const dateB = b.event?.event_date || '';
        return dateA.localeCompare(dateB);
      }) || [];
    
    return upcomingEvents;
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
        .from('events')
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

        // Use relative URL in production (Vercel serverless functions) or backend URL in development
        const isProduction = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && !window.location.hostname.startsWith('127.0.0.1');
        const backendUrl = isProduction ? '' : (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001');
        
        const queryParams = new URLSearchParams();
        queryParams.append('apikey', JAMBASE_API_KEY);
        queryParams.append('artistName', query);
        queryParams.append('num', limit.toString());
        queryParams.append('o', 'json');
        
        const searchUrl = `${backendUrl}/api/jambase/artists?${queryParams.toString()}`;
        console.log('🌐 API URL:', searchUrl);

        const response = await fetch(searchUrl, {
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
        .from('events')
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

      // Insert artists as "profile events" in the database using individual inserts
      for (const event of eventsToStore) {
        try {
          // Check if event already exists
          const { data: existing } = await supabase
            .from('events')
            .select('id')
            .eq('jambase_event_id', event.jambase_event_id)
            .single();
          
          if (!existing) {
            // Insert new event
            const { error: insertError } = await supabase
              .from('events')
              .insert(event);
            
            if (insertError) {
              console.error('Error inserting artist event:', insertError);
            }
          }
        } catch (error) {
          console.error('Error processing artist event:', error);
        }
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
