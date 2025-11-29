// Unified Event Search Service - Searches both JamBase and Ticketmaster
import { JamBaseEventsService } from './jambaseEventsService';

export interface UnifiedEventSearchParams {
  // Search criteria
  keyword?: string;
  artistName?: string;
  venueName?: string;
  venueId?: string; // Ticketmaster venue ID for accurate venue-based searches
  
  // Location
  city?: string;
  stateCode?: string;
  countryCode?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
  
  // Date range
  startDate?: string;
  endDate?: string;
  
  // Filters
  classificationName?: string;
  
  // Pagination
  page?: number;
  perPage?: number;
  limit?: number;
  
  // Options
  includePastEvents?: boolean; // If true, include past events in results
}

export interface UnifiedEvent {
  id?: string;
  source: 'jambase' | 'ticketmaster' | 'manual';
  jambase_event_id?: string;
  ticketmaster_event_id?: string;
  title: string;
  artist_name: string;
  artist_id?: string;
  venue_name: string;
  venue_id?: string;
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
  ticket_available: boolean;
  price_range?: string;
  ticket_urls?: string[];
  external_url?: string;
  price_min?: number;
  price_max?: number;
  price_currency?: string;
  event_status?: string;
  attraction_ids?: string[];
  classifications?: any[];
  sales_info?: any;
  images?: any[];
  tour_name?: string;
  setlist?: any;
}

export interface UnifiedSearchResult {
  events: UnifiedEvent[];
  total: number;
  sources: {
    jambase: boolean;
    ticketmaster: boolean;
  };
  hasNextPage: boolean;
}

export class UnifiedEventSearchService {
  /**
   * Search both JamBase and Ticketmaster APIs concurrently
   */
  static async searchEvents(params: UnifiedEventSearchParams): Promise<UnifiedSearchResult> {
    console.log('🔍 Unified search with params:', params);
    
    // Query both APIs in parallel
    const [jambaseResults, ticketmasterResults] = await Promise.allSettled([
      this.searchJamBase(params),
      this.searchTicketmaster(params)
    ]);

    // Merge results
    const allEvents: UnifiedEvent[] = [];
    
    if (jambaseResults.status === 'fulfilled') {
      allEvents.push(...jambaseResults.value);
    } else {
      console.warn('⚠️ JamBase search failed:', jambaseResults.reason);
    }
    
    if (ticketmasterResults.status === 'fulfilled') {
      allEvents.push(...ticketmasterResults.value);
    } else {
      console.warn('⚠️ Ticketmaster search failed:', ticketmasterResults.reason);
    }

    console.log(`✅ Found ${allEvents.length} total events (JamBase: ${jambaseResults.status === 'fulfilled' ? allEvents.filter(e => e.source === 'jambase').length : 0}, Ticketmaster: ${ticketmasterResults.status === 'fulfilled' ? allEvents.filter(e => e.source === 'ticketmaster').length : 0})`);

    // Deduplicate by artist + venue + date (normalized)
    const uniqueEvents = this.deduplicateEvents(allEvents);
    
    // Filter out past events only if includePastEvents is false (default behavior)
    const filteredEvents = params.includePastEvents 
      ? uniqueEvents 
      : this.filterFutureEvents(uniqueEvents);
    
    // Sort by date
    filteredEvents.sort((a, b) => 
      new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
    );

    // Apply pagination
    const page = params.page || 1;
    const perPage = params.perPage || params.limit || 20;
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedEvents = filteredEvents.slice(startIndex, endIndex);

    return {
      events: paginatedEvents,
      total: filteredEvents.length,
      sources: {
        jambase: jambaseResults.status === 'fulfilled',
        ticketmaster: ticketmasterResults.status === 'fulfilled'
      },
      hasNextPage: endIndex < filteredEvents.length
    };
  }

  /**
   * Search JamBase API
   */
  private static async searchJamBase(params: UnifiedEventSearchParams): Promise<UnifiedEvent[]> {
    try {
      const result = await JamBaseEventsService.searchEvents({
        artistName: params.artistName || params.keyword,
        venueName: params.venueName,
        eventDateFrom: params.startDate,
        eventDateTo: params.endDate,
        geoCountryIso2: params.countryCode,
        geoStateIso: params.stateCode,
        page: params.page,
        perPage: params.perPage || params.limit || 20
      });

      return result.events.map(event => ({
        ...event,
        source: 'jambase' as const,
        ticket_available: event.ticket_available ?? false // Ensure ticket_available is always present
      })) as UnifiedEvent[];
    } catch (error) {
      console.error('❌ JamBase search error:', error);
      return [];
    }
  }

  /**
   * Search Ticketmaster API
   */
  private static async searchTicketmaster(params: UnifiedEventSearchParams): Promise<UnifiedEvent[]> {
    try {
      // Build query params for Ticketmaster
      const queryParams = new URLSearchParams();
      
      // For venue searches, prefer venueId for accuracy, fallback to venueName
      if (params.venueId) {
        // Use venueId for accurate venue-based event search
        queryParams.append('venueId', params.venueId);
        console.log(`🏢 Ticketmaster venue ID search: "${params.venueId}"`);
      } else if (params.venueName) {
        // Fallback to keyword search if venueId not available
        queryParams.append('keyword', params.venueName);
        console.log(`🏢 Ticketmaster venue name search: "${params.venueName}"`);
      } else if (params.keyword || params.artistName) {
        queryParams.append('keyword', params.artistName || params.keyword || '');
        console.log(`🎤 Ticketmaster artist search: "${params.artistName || params.keyword}"`);
      }
      
      if (params.city) queryParams.append('city', params.city);
      if (params.stateCode) queryParams.append('stateCode', params.stateCode);
      if (params.countryCode) queryParams.append('countryCode', params.countryCode);
      if (params.postalCode) queryParams.append('postalCode', params.postalCode);
      
      if (params.latitude && params.longitude) {
        queryParams.append('latlong', `${params.latitude},${params.longitude}`);
        if (params.radius) {
          queryParams.append('radius', params.radius.toString());
          queryParams.append('unit', 'miles');
        }
      }
      
      if (params.startDate) queryParams.append('startDateTime', params.startDate);
      if (params.endDate) queryParams.append('endDateTime', params.endDate);
      if (params.classificationName) queryParams.append('classificationName', params.classificationName);
      
      queryParams.append('size', (params.perPage || params.limit || 20).toString());
      // API key is handled by backend - don't expose it in frontend

      // Use relative URL in production (Vercel serverless functions) or backend URL in development
      const isProduction = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && !window.location.hostname.startsWith('127.0.0.1');
      const backendUrl = isProduction ? '' : (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001');
      const url = `${backendUrl}/api/ticketmaster/events?${queryParams.toString()}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Synth/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`Ticketmaster API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Ticketmaster API returned unsuccessful response');
      }

      let events = (data.events || []).map((event: any) => ({
        ...event,
        source: 'ticketmaster' as const
      }));

      // Filter by venue name if this is a venue search (to avoid matching artist names)
      if (params.venueName) {
        const venueNameLower = params.venueName.toLowerCase().trim();
        events = events.filter((event: UnifiedEvent) => {
          const eventVenueName = (event.venue_name || '').toLowerCase().trim();
          // Check if venue name matches (allowing for partial matches)
          return eventVenueName.includes(venueNameLower) || venueNameLower.includes(eventVenueName);
        });
        console.log(`🏢 Filtered to ${events.length} events matching venue "${params.venueName}"`);
      }

      return events;
    } catch (error) {
      console.error('❌ Ticketmaster search error:', error);
      return [];
    }
  }

  /**
   * Deduplicate events by artist + venue + date
   * Improved: Normalize artist and venue names for better matching
   * Prefer Ticketmaster if duplicate (better data quality)
   */
  private static deduplicateEvents(events: UnifiedEvent[]): UnifiedEvent[] {
    const seen = new Map<string, UnifiedEvent>();
    
    return events.filter(event => {
      // Normalize artist and venue names for better matching
      const normalizeArtist = (event.artist_name || '').toLowerCase().trim();
      const normalizeVenue = (event.venue_name || '').toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/\bthe\s+/gi, '') // Remove "the"
        .replace(/\bo2\s+/gi, '') // Remove "o2" prefix
        .replace(/\bacademy\b/gi, '') // Remove "academy"
        .replace(/\bballroom\b/gi, '') // Remove "ballroom"
        .replace(/\btheatre\b/gi, '') // Remove "theatre"/"theater"
        .replace(/\btheater\b/gi, '')
        .replace(/\broxy\b/gi, 'roxy') // Normalize "Roxy" / "ROXY"
        .replace(/[^\w\s]/g, '') // Remove special chars
        .trim();
      
      // Create unique key from artist + venue + date (date only, ignore time)
      const dateKey = event.event_date?.split('T')[0] || '';
      const key = `${normalizeArtist}|${normalizeVenue}|${dateKey}`;
      
      if (seen.has(key)) {
        // Prefer Ticketmaster if duplicate (better data quality)
        const existing = seen.get(key)!;
        if (event.source === 'ticketmaster' && existing.source !== 'ticketmaster') {
          seen.set(key, event);
          return true;
        }
        // If both are Ticketmaster or both JamBase, prefer the first one
        return false;
      }
      
      seen.set(key, event);
      return true;
    });
  }
  
  /**
   * Filter events to remove past events when requested
   */
  private static filterFutureEvents(events: UnifiedEvent[]): UnifiedEvent[] {
    const now = new Date();
    return events.filter(event => {
      if (!event.event_date) return false;
      const eventDate = new Date(event.event_date);
      return eventDate >= now;
    });
  }

  /**
   * Search by location with radius (for user's current location)
   */
  static async searchByLocation(params: {
    latitude: number;
    longitude: number;
    radius?: number;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<UnifiedSearchResult> {
    return this.searchEvents({
      latitude: params.latitude,
      longitude: params.longitude,
      radius: params.radius || 50,
      startDate: params.startDate,
      endDate: params.endDate,
      limit: params.limit
    });
  }

  /**
   * Search by city
   */
  static async searchByCity(params: {
    city: string;
    stateCode?: string;
    countryCode?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<UnifiedSearchResult> {
    return this.searchEvents({
      city: params.city,
      stateCode: params.stateCode,
      countryCode: params.countryCode,
      startDate: params.startDate,
      endDate: params.endDate,
      limit: params.limit
    });
  }

  /**
   * Search events by artist name (includes both upcoming and past events)
   * This method fetches from Ticketmaster API ONLY (no JamBase)
   */
  static async searchByArtist(params: {
    artistName: string;
    includePastEvents?: boolean;
    pastEventsMonths?: number; // How many months back to fetch (default: 3)
    limit?: number;
  }): Promise<UnifiedEvent[]> {
    const now = new Date();
    const pastDate = new Date();
    pastDate.setMonth(pastDate.getMonth() - (params.pastEventsMonths || 3));
    
    // Format dates for Ticketmaster API (ISO 8601 format)
    const startDate = params.includePastEvents 
      ? pastDate.toISOString().split('T')[0] + 'T00:00:00Z'
      : now.toISOString().split('T')[0] + 'T00:00:00Z';
    
    console.log(`🎫 Ticketmaster search params for "${params.artistName}":`, {
      includePastEvents: params.includePastEvents,
      pastEventsMonths: params.pastEventsMonths || 3,
      startDate: startDate,
      endDate: now.toISOString().split('T')[0] + 'T23:59:59Z',
      limit: params.limit || 200
    });
    
    // Fetch upcoming events (from today onwards, no end date)
    const upcomingParams: UnifiedEventSearchParams = {
      keyword: params.artistName, // Use keyword for Ticketmaster API
      artistName: params.artistName, // Also set for JamBase compatibility
      startDate: now.toISOString().split('T')[0] + 'T00:00:00Z',
      limit: params.limit || 200,
      includePastEvents: false
    };

    // Fetch past events if requested
    let pastEvents: UnifiedEvent[] = [];
    if (params.includePastEvents) {
      const pastParams: UnifiedEventSearchParams = {
        keyword: params.artistName, // Use keyword for Ticketmaster API
        artistName: params.artistName, // Also set for JamBase compatibility
        startDate: startDate,
        endDate: now.toISOString().split('T')[0] + 'T23:59:59Z',
        limit: params.limit || 200,
        includePastEvents: true
      };
      
      try {
        console.log(`🎫 Fetching past events from Ticketmaster for "${params.artistName}"...`);
        // Call Ticketmaster ONLY (skip JamBase)
        const pastResult = await this.searchTicketmaster(pastParams);
        pastEvents = pastResult;
        console.log(`✅ Found ${pastEvents.length} past events from Ticketmaster`);
      } catch (error) {
        console.warn('⚠️ Failed to fetch past events from Ticketmaster:', error);
      }
    }

    // Fetch upcoming events from Ticketmaster ONLY
    let upcomingEvents: UnifiedEvent[] = [];
    try {
      console.log(`🎫 Fetching upcoming events from Ticketmaster for "${params.artistName}"...`);
      // Call Ticketmaster ONLY (skip JamBase)
      upcomingEvents = await this.searchTicketmaster(upcomingParams);
      console.log(`✅ Found ${upcomingEvents.length} upcoming events from Ticketmaster`);
    } catch (error) {
      console.warn('⚠️ Failed to fetch upcoming events from Ticketmaster:', error);
    }

    // Combine and deduplicate
    const allEvents = [...upcomingEvents, ...pastEvents];
    const uniqueEvents = this.deduplicateEvents(allEvents);
    
    // Sort by date (past events first, then upcoming)
    uniqueEvents.sort((a, b) => 
      new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
    );

    return uniqueEvents;
  }

  /**
   * Search for venue by name to get venue ID
   * Uses Ticketmaster Venues API
   */
  private static async searchVenueByName(venueName: string, city?: string, stateCode?: string): Promise<string | null> {
    try {
      console.log(`🏢 Searching for venue ID: "${venueName}"`);
      
      const queryParams = new URLSearchParams();
      queryParams.append('keyword', venueName);
      if (city) queryParams.append('city', city);
      if (stateCode) queryParams.append('stateCode', stateCode);
      queryParams.append('size', '5'); // Get top 5 matches
      
      // Use relative URL in production (Vercel serverless functions) or backend URL in development
      const isProduction = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && !window.location.hostname.startsWith('127.0.0.1');
      const backendUrl = isProduction ? '' : (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001');
      const url = `${backendUrl}/api/ticketmaster/venues?${queryParams.toString()}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Synth/1.0'
        }
      });

      if (!response.ok) {
        console.warn(`⚠️ Venue search API error: ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      
      if (!data.success || !data.venues || data.venues.length === 0) {
        console.log(`⚠️ No venues found for "${venueName}"`);
        return null;
      }

      // Find the best match (exact name match preferred)
      const venueNameLower = venueName.toLowerCase().trim();
      const exactMatch = data.venues.find((v: any) => 
        v.name?.toLowerCase().trim() === venueNameLower
      );
      
      const matchedVenue = exactMatch || data.venues[0];
      const venueId = matchedVenue.id;
      
      console.log(`✅ Found venue ID: ${venueId} for "${venueName}" (matched: "${matchedVenue.name}")`);
      return venueId;
    } catch (error) {
      console.error('❌ Error searching for venue:', error);
      return null;
    }
  }

  /**
   * Search events by venue name (includes both upcoming and past events)
   * This method fetches from Ticketmaster API ONLY (no JamBase)
   * Uses venue ID-based search for accurate results
   */
  static async searchByVenue(params: {
    venueName: string;
    venueCity?: string;
    venueState?: string;
    includePastEvents?: boolean;
    pastEventsMonths?: number; // How many months back to fetch (default: 3)
    limit?: number;
  }): Promise<UnifiedEvent[]> {
    const now = new Date();
    const pastDate = new Date();
    pastDate.setMonth(pastDate.getMonth() - (params.pastEventsMonths || 3));
    
    // Format dates for Ticketmaster API (ISO 8601 format)
    const startDate = params.includePastEvents 
      ? pastDate.toISOString().split('T')[0] + 'T00:00:00Z'
      : now.toISOString().split('T')[0] + 'T00:00:00Z';
    
    // Step 1: Get venue ID by searching for the venue
    const venueId = await this.searchVenueByName(
      params.venueName,
      params.venueCity,
      params.venueState
    );

    // Step 2: Search events using venue ID (more accurate than keyword search)
    let upcomingEvents: UnifiedEvent[] = [];
    let pastEvents: UnifiedEvent[] = [];

    if (venueId) {
      // Use venue ID for accurate search
      console.log(`🏢 Using venue ID ${venueId} to search for events`);
      
      const upcomingParams: UnifiedEventSearchParams = {
        venueId: venueId, // Use venueId for accurate search
        startDate: now.toISOString().split('T')[0] + 'T00:00:00Z',
        limit: params.limit || 200,
        includePastEvents: false
      };

      if (params.includePastEvents) {
        const pastParams: UnifiedEventSearchParams = {
          venueId: venueId,
          startDate: startDate,
          endDate: now.toISOString().split('T')[0] + 'T23:59:59Z',
          limit: params.limit || 200,
          includePastEvents: true
        };
        
        try {
          console.log(`🏢 Fetching past events from Ticketmaster for venue ID ${venueId}...`);
          pastEvents = await this.searchTicketmaster(pastParams);
          console.log(`✅ Found ${pastEvents.length} past events from Ticketmaster for venue`);
        } catch (error) {
          console.warn('⚠️ Failed to fetch past events from Ticketmaster:', error);
        }
      }

      try {
        console.log(`🏢 Fetching upcoming events from Ticketmaster for venue ID ${venueId}...`);
        upcomingEvents = await this.searchTicketmaster(upcomingParams);
        console.log(`✅ Found ${upcomingEvents.length} upcoming events from Ticketmaster for venue`);
      } catch (error) {
        console.warn('⚠️ Failed to fetch upcoming events from Ticketmaster:', error);
      }
    } else {
      // Fallback to keyword search if venue ID not found
      console.warn(`⚠️ Venue ID not found for "${params.venueName}", falling back to keyword search`);
      
      const upcomingParams: UnifiedEventSearchParams = {
        venueName: params.venueName,
        startDate: now.toISOString().split('T')[0] + 'T00:00:00Z',
        limit: params.limit || 200,
        includePastEvents: false
      };

      if (params.includePastEvents) {
        const pastParams: UnifiedEventSearchParams = {
          venueName: params.venueName,
          startDate: startDate,
          endDate: now.toISOString().split('T')[0] + 'T23:59:59Z',
          limit: params.limit || 200,
          includePastEvents: true
        };
        
        try {
          pastEvents = await this.searchTicketmaster(pastParams);
        } catch (error) {
          console.warn('⚠️ Failed to fetch past events from Ticketmaster:', error);
        }
      }

      try {
        upcomingEvents = await this.searchTicketmaster(upcomingParams);
      } catch (error) {
        console.warn('⚠️ Failed to fetch upcoming events from Ticketmaster:', error);
      }
    }

    // Combine and deduplicate
    const allEvents = [...upcomingEvents, ...pastEvents];
    const uniqueEvents = this.deduplicateEvents(allEvents);
    
    // Sort by date (past events first, then upcoming)
    uniqueEvents.sort((a, b) => 
      new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
    );

    return uniqueEvents;
  }
}

