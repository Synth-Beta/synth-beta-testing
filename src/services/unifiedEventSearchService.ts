// Unified Event Search Service - Searches both JamBase and Ticketmaster
import { JamBaseEventsService } from './jambaseEventsService';

export interface UnifiedEventSearchParams {
  // Search criteria
  keyword?: string;
  artistName?: string;
  venueName?: string;
  
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
    
    // Filter out past events - only show future events
    const futureEvents = this.filterFutureEvents(uniqueEvents);
    
    // Sort by tardate
    futureEvents.sort((a, b) => 
      new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
    );

    // Apply pagination
    const page = params.page || 1;
    const perPage = params.perPage || params.limit || 20;
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedEvents = futureEvents.slice(startIndex, endIndex);

    return {
      events: paginatedEvents,
      total: futureEvents.length,
      sources: {
        jambase: jambaseResults.status === 'fulfilled',
        ticketmaster: ticketmasterResults.status === 'fulfilled'
      },
      hasNextPage: endIndex < futureEvents.length
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
      
      if (params.keyword || params.artistName) {
        queryParams.append('keyword', params.artistName || params.keyword || '');
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

      return (data.events || []).map((event: any) => ({
        ...event,
        source: 'ticketmaster' as const
      }));
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
}

