import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type JamBaseEvent = Tables<'jambase_events'> & {
  is_promoted?: boolean;
  promotion_tier?: 'basic' | 'premium' | 'featured' | null;
  active_promotion_id?: string;
};
export type JamBaseEventInsert = TablesInsert<'jambase_events'>;
export type JamBaseEventUpdate = TablesUpdate<'jambase_events'>;

export interface JamBaseEventSearchParams {
  artistId?: string;
  artistName?: string;
  venueId?: string;
  venueName?: string;
  eventDateFrom?: string;
  eventDateTo?: string;
  eventType?: 'concerts' | 'festivals';
  page?: number;
  perPage?: number;
  geoCountryIso2?: string;
  geoStateIso?: string;
  geoCityId?: string;
  geoLatitude?: number;
  geoLongitude?: number;
  geoRadiusAmount?: number;
  geoRadiusUnits?: 'mi' | 'km';
  genreSlug?: string;
  // Note: expandPastEvents parameter not available for this API key
}

export interface JamBaseEventResponse {
  id: string;
  jambase_event_id?: string;
  title: string;
  artist_name: string;
  artist_id: string;
  venue_name: string;
  venue_id: string;
  event_date: string;
  doors_time?: string;
  description?: string;
  genres?: string[];
  venue_address?: string;
  venue_city?: string;
  venue_state?: string;
  venue_zip?: string;
  latitude?: number;
  longitude?: number;
  ticket_available?: boolean;
  price_range?: string;
  ticket_urls?: string[];
  setlist?: any;
  setlist_enriched?: boolean;
  setlist_song_count?: number;
  setlist_fm_id?: string;
  setlist_fm_url?: string;
  tour_name?: string;
  created_at?: string;
  updated_at?: string;
  // Promotion fields
  is_promoted?: boolean;
  promotion_tier?: 'basic' | 'premium' | 'featured' | null;
  active_promotion_id?: string;
  // Ticketmaster images
  images?: any[];
}

export interface JamBaseEventsApiResponse {
  events: JamBaseEventResponse[];
  total: number;
  page: number;
  perPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export class JamBaseEventsService {
  private static readonly JAMBASE_API_KEY = import.meta.env.VITE_JAMBASE_API_KEY || 'e7ed3a9b-e73a-446e-b7c6-a96d1c53a030';
  private static readonly JAMBASE_BASE_URL = (
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '')
  ) + '/api/jambase';

  /**
   * Search for events using JamBase API
   */
  static async searchEvents(params: JamBaseEventSearchParams): Promise<JamBaseEventsApiResponse> {
    // Call backend JamBase proxy if configured
    
    try {
      const searchParams = new URLSearchParams();
      
      // Add all non-undefined parameters
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          searchParams.append(key, value.toString());
        }
      });

      // Set defaults
      if (!params.page) searchParams.append('page', '1');
      if (!params.perPage) searchParams.append('perPage', '40');
      if (!params.eventType) searchParams.append('eventType', 'concerts');

      // Add API key to URL parameters
      searchParams.append('apikey', this.JAMBASE_API_KEY);
      const finalUrl = `${this.JAMBASE_BASE_URL}/events?${searchParams.toString()}`;
      
      console.log('🔍 Final JamBase events URL:', finalUrl);

      const response = await fetch(finalUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'PlusOneEventCrew/1.0'
        }
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`JamBase API error: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`JamBase API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('📊 JamBase events API response:', { success: data.success, eventCount: data.events?.length });
      
      // Check if the response is successful
      if (!data.success) {
        console.warn('JamBase API returned unsuccessful response:', data);
        return {
          events: [],
          total: 0,
          page: params.page || 1,
          perPage: params.perPage || 40,
          hasNextPage: false,
          hasPreviousPage: false
        };
      }
      
      // The events are already transformed by the backend API
      const events = data.events || [];
      
      return {
        events,
        total: data.total || events.length,
        page: data.page || params.page || 1,
        perPage: data.perPage || params.perPage || 40,
        hasNextPage: data.hasNextPage || false,
        hasPreviousPage: data.hasPreviousPage || false
      };

    } catch (error) {
      console.error('❌ JamBase events search error:', error);
      
      // Return empty results instead of throwing to prevent UI crashes
      console.warn('Returning empty events due to API error');
      return {
        events: [],
        total: 0,
        page: params.page || 1,
        perPage: params.perPage || 40,
        hasNextPage: false,
        hasPreviousPage: false
      };
    }
  }

  /**
   * Get events for a specific artist
   */
  static async getArtistEvents(artistId: string, options: {
    page?: number;
    perPage?: number;
    eventType?: 'concerts' | 'festivals';
    expandPastEvents?: boolean;
  } = {}): Promise<JamBaseEventsApiResponse> {
    return this.searchEvents({
      artistId,
      page: options.page || 1,
      perPage: options.perPage || 40,
      eventType: options.eventType || 'concerts'
    });
  }

  /**
   * Get events by artist name
   */
  static async getEventsByArtistName(artistName: string, options: {
    page?: number;
    perPage?: number;
    eventType?: 'concerts' | 'festivals';
  } = {}): Promise<JamBaseEventsApiResponse> {
    return this.searchEvents({
      artistName,
      page: options.page || 1,
      perPage: options.perPage || 40,
      eventType: options.eventType || 'concerts'
      // Note: expandPastEvents parameter not available for this API key
    });
  }

  /**
   * Store events in Supabase database
   * NOTE: This method is deprecated - events are now stored by the backend API
   * @deprecated Use backend API which handles storage automatically
   */
  static async storeEventsInDatabase(events: JamBaseEventResponse[]): Promise<JamBaseEvent[]> {
    console.warn('⚠️ storeEventsInDatabase is deprecated - events are stored by backend API');
    // Return empty array since backend handles storage
    return [];
  }

  /**
   * Get events from database by artist
   */
  static async getEventsFromDatabase(artistName: string, options: {
    page?: number;
    perPage?: number;
    eventType?: 'past' | 'upcoming' | 'all';
  } = {}): Promise<{
    events: JamBaseEventResponse[];
    total: number;
    page: number;
    perPage: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  }> {
    try {
      const page = options.page || 1;
      const perPage = options.perPage || 40;
      const offset = (page - 1) * perPage;

      // Use a more flexible approach to handle apostrophe variations
      let query = supabase
        .from('events')
        .select('*', { count: 'exact' });
      
      // Try multiple matching strategies for better artist name matching
      const searchTerms = [
        artistName,
        artistName.replace(/'/g, "'"), // Try different apostrophe types
        artistName.replace(/'/g, "'"),
        artistName.replace(/['']/g, '') // Try without apostrophes
      ];
      
      // Create OR conditions for all search terms
      const orConditions = searchTerms.map(term => 
        `artist_name.ilike.%${term}%`
      ).join(',');
      
      query = query.or(orConditions);

      // Apply date filters
      const now = new Date().toISOString();
      if (options.eventType === 'past') {
        query = query.lt('event_date', now);
      } else if (options.eventType === 'upcoming') {
        query = query.gte('event_date', now);
      }

      // Order by date
      query = query.order('event_date', { ascending: options.eventType === 'past' ? false : true });

      const { data: events, error, count } = await query
        .range(offset, offset + perPage - 1);

      if (error) throw error;

      const total = count || 0;
      const totalPages = Math.ceil(total / perPage);

      // Transform database events to JamBaseEventResponse format
      const transformedEvents: JamBaseEventResponse[] = (events || []).map(event => ({
        id: event.id,
        jambase_event_id: event.jambase_event_id,
        title: event.title,
        artist_name: event.artist_name,
        artist_id: event.artist_id || '',
        venue_name: event.venue_name,
        venue_id: event.venue_id || '',
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
        setlist: event.setlist,
        setlist_enriched: event.setlist_enriched,
        setlist_song_count: event.setlist_song_count,
        setlist_fm_id: event.setlist_fm_id,
        setlist_fm_url: event.setlist_fm_url,
        tour_name: event.tour_name,
        created_at: event.created_at,
        updated_at: event.updated_at,
        // Promotion fields (with safe access)
        is_promoted: (event as any).is_promoted || false,
        promotion_tier: ((event as any).promotion_tier === 'basic' || (event as any).promotion_tier === 'premium' || (event as any).promotion_tier === 'featured') 
          ? (event as any).promotion_tier as 'basic' | 'premium' | 'featured' 
          : null,
        active_promotion_id: (event as any).active_promotion_id
      }));

      return {
        events: transformedEvents,
        total,
        page,
        perPage,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      };

    } catch (error) {
      console.error('❌ Error getting events from database:', error);
      throw error;
    }
  }

  /**
   * Get or fetch events for an artist (API first for fresh results)
   */
  static async getOrFetchArtistEvents(artistName: string, options: {
    page?: number;
    perPage?: number;
    eventType?: 'past' | 'upcoming' | 'all';
    forceRefresh?: boolean;
  } = {}): Promise<{
    events: JamBaseEventResponse[];
    total: number;
    page: number;
    perPage: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    source: 'database' | 'api';
  }> {
    try {
      console.log('🔍 Getting events for artist:', artistName, 'with options:', options);
      
      // Always try API first for fresh results
      console.log('🌐 Calling JamBase API for fresh events:', artistName);
      
      try {
        const apiResult = await this.getEventsByArtistName(artistName, {
          page: options.page,
          perPage: options.perPage,
          eventType: 'concerts'
        });
        
        console.log('📊 API Result:', {
          eventsCount: apiResult.events.length,
          total: apiResult.total,
          firstEvent: apiResult.events[0]
        });

        if (apiResult.events.length > 0) {
          // Filter events to show only exact artist matches (with flexible apostrophe handling)
          const exactArtistEvents = apiResult.events.filter(event => {
            // Normalize both names by removing special characters and converting to lowercase
            const normalizeName = (name: string) => 
              name.toLowerCase()
                  .replace(/[''`]/g, '') // Remove different types of apostrophes
                  .replace(/[^\w\s]/g, '') // Remove other special characters
                  .replace(/\s+/g, ' ') // Normalize whitespace
                  .trim();
            
            return normalizeName(event.artist_name) === normalizeName(artistName);
          });
          
          console.log(`🎯 Filtered events for exact artist match "${artistName}":`, {
            totalEvents: apiResult.events.length,
            exactMatches: exactArtistEvents.length,
            sampleEvents: exactArtistEvents.slice(0, 3).map(e => ({ title: e.title, artist_name: e.artist_name }))
          });

          // Use the filtered events directly from the API response
          const dbEvents: JamBaseEventResponse[] = exactArtistEvents.map(event => ({
            id: event.id || `api-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            jambase_event_id: event.jambase_event_id || event.id || '',
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
            setlist: event.setlist,
            tour_name: event.tour_name,
            created_at: event.created_at || new Date().toISOString(),
            updated_at: event.updated_at || new Date().toISOString()
          }));

          console.log('🎯 Final API result:', {
            eventsCount: dbEvents.length,
            total: exactArtistEvents.length,
            firstEvent: dbEvents[0]
          });

          return {
            events: dbEvents,
            total: exactArtistEvents.length,
            page: apiResult.page,
            perPage: apiResult.perPage,
            hasNextPage: false,
            hasPreviousPage: false,
            source: 'api'
          };
        }
      } catch (apiError) {
        console.warn('⚠️ API call failed, trying database fallback:', apiError);
        
        // Try database fallback
        try {
          const dbResult = await this.getEventsFromDatabase(artistName, {
            page: options.page,
            perPage: options.perPage,
            eventType: options.eventType
          });
          
          if (dbResult.events.length > 0) {
            console.log('✅ Found events in database fallback:', dbResult.events.length);
            return {
              events: dbResult.events,
              total: dbResult.total,
              page: dbResult.page,
              perPage: dbResult.perPage,
              hasNextPage: dbResult.hasNextPage,
              hasPreviousPage: dbResult.hasPreviousPage,
              source: 'database'
            };
          }
        } catch (dbError) {
          console.warn('⚠️ Database fallback also failed:', dbError);
        }
      }

      // If both API and database fail, return empty results
      console.log('📭 No events found from API or database');
      return {
        events: [],
        total: 0,
        page: options.page || 1,
        perPage: options.perPage || 40,
        hasNextPage: false,
        hasPreviousPage: false,
        source: 'database'
      };

    } catch (error) {
      console.error('❌ Error getting/fetching artist events:', error);
      
      // Return empty results instead of throwing to prevent UI crashes
      console.warn('Returning empty events due to error');
      return {
        events: [],
        total: 0,
        page: options.page || 1,
        perPage: options.perPage || 40,
        hasNextPage: false,
        hasPreviousPage: false,
        source: 'database'
      };
    }
  }

  /**
   * Transform JamBase API events to our format
   */
  private static transformJamBaseEvents(apiEvents: any[]): JamBaseEventResponse[] {
    if (!Array.isArray(apiEvents)) {
      console.warn('Expected array of events, got:', typeof apiEvents, apiEvents);
      return [];
    }

    return apiEvents.map(event => {
      // Handle different possible event structures from JamBase API
      const eventId = event.identifier?.replace('jambase:', '') || 
                     event.id || 
                     event['@id']?.replace('jambase:', '') || 
                     `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const eventName = event.name || 
                       event.title || 
                       event.headline || 
                       'Untitled Event';
      
      // Extract artist information
      let artistName = 'Unknown Artist';
      let artistId = '';
      
      if (event.performer && Array.isArray(event.performer) && event.performer.length > 0) {
        artistName = event.performer[0].name || event.performer[0].title || 'Unknown Artist';
        artistId = event.performer[0].identifier?.replace('jambase:', '') || 
                  event.performer[0]['@id']?.replace('jambase:', '') || '';
      } else if (event.artist_name) {
        artistName = event.artist_name;
        artistId = event.artist_id || '';
      }
      
      
      // Extract venue information
      let venueName = 'Unknown Venue';
      let venueId = '';
      let venueAddress = null;
      let venueCity = null;
      let venueState = null;
      let venueZip = null;
      let latitude = null;
      let longitude = null;
      
      if (event.location) {
        venueName = event.location.name || event.location.title || 'Unknown Venue';
        venueId = event.location.identifier?.replace('jambase:', '') || 
                 event.location['@id']?.replace('jambase:', '') || '';
        
        if (event.location.address) {
          venueAddress = event.location.address.streetAddress || event.location.address.address || null;
          venueCity = event.location.address.addressLocality || event.location.address.city || null;
          venueState = event.location.address.addressRegion || event.location.address.state || null;
          venueZip = event.location.address.postalCode || event.location.address.zip || null;
        }
        
        if (event.location.geo) {
          latitude = event.location.geo.latitude || null;
          longitude = event.location.geo.longitude || null;
        }
      } else if (event.venue_name) {
        venueName = event.venue_name;
        venueId = event.venue_id || '';
        venueAddress = event.venue_address || null;
        venueCity = event.venue_city || null;
        venueState = event.venue_state || null;
        venueZip = event.venue_zip || null;
        latitude = event.latitude || null;
        longitude = event.longitude || null;
      }
      
      // Extract event date
      const eventDate = event.startDate || 
                       event.event_date || 
                       event.datePublished || 
                       event.start_time ||
                       new Date().toISOString();
      
      // Extract genres
      let genres = [];
      if (event.genre && Array.isArray(event.genre)) {
        genres = event.genre;
      } else if (event.genres && Array.isArray(event.genres)) {
        genres = event.genres;
      } else if (event.genre && typeof event.genre === 'string') {
        genres = [event.genre];
      }
      
      // Extract ticket information
      let ticketAvailable = false;
      let priceRange = null;
      let ticketUrls = [];
      
      if (event.offers && Array.isArray(event.offers)) {
        ticketAvailable = event.offers.some((offer: any) => offer.availability === 'InStock' || offer.availability === 'InStock');
        priceRange = event.offers.map((offer: any) => offer.price).filter(Boolean).join(' - ') || null;
        ticketUrls = event.offers.map((offer: any) => offer.url).filter(Boolean);
      } else if (event.ticket_available !== undefined) {
        ticketAvailable = event.ticket_available;
        priceRange = event.price_range || null;
        ticketUrls = event.ticket_urls || [];
      }
      
      const transformedEvent = {
        id: eventId,
        title: eventName,
        artist_name: artistName,
        artist_id: artistId,
        venue_name: venueName,
        venue_id: venueId,
        event_date: eventDate,
        doors_time: event.doorTime || event.doorsTime || event.doors_time || null,
        description: event.description || null,
        genres: genres,
        venue_address: venueAddress,
        venue_city: venueCity,
        venue_state: venueState,
        venue_zip: venueZip,
        latitude: latitude,
        longitude: longitude,
        ticket_available: ticketAvailable,
        price_range: priceRange,
        ticket_urls: ticketUrls,
        setlist: event.setlist || null,
        tour_name: event.tour?.name || event.tour_name || null
      };
      
      return transformedEvent;
    });
  }
}
