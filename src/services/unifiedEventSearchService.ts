// Unified Event Search Service - Database only (no external APIs)
import { supabase } from '@/integrations/supabase/client';

export interface UnifiedEventSearchParams {
  // Search criteria
  keyword?: string;
  artistName?: string;
  venueName?: string;
  venueId?: string;
  
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
  source: 'manual';
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
   * Search events from database only
   */
  static async searchEvents(params: UnifiedEventSearchParams): Promise<UnifiedSearchResult> {
    console.log('🔍 Database search with params:', params);
    
    try {
      let query = supabase
        .from('events')
        .select('*', { count: 'exact' });

      // Apply filters
      if (params.artistName || params.keyword) {
        const searchTerm = (params.artistName || params.keyword || '').toLowerCase();
        query = query.ilike('artist_name', `%${searchTerm}%`);
      }

      if (params.venueName) {
        query = query.ilike('venue_name', `%${params.venueName}%`);
      }

      if (params.venueId) {
        query = query.eq('venue_id', params.venueId);
      }

      if (params.city) {
        query = query.ilike('venue_city', `%${params.city}%`);
      }

      if (params.stateCode) {
        query = query.eq('venue_state', params.stateCode);
      }

      // Date filtering
      if (!params.includePastEvents) {
        query = query.gte('event_date', new Date().toISOString());
      } else if (params.startDate) {
        query = query.gte('event_date', params.startDate);
      }

      if (params.endDate) {
        query = query.lte('event_date', params.endDate);
      }

      // Location-based filtering (if latitude/longitude provided)
      if (params.latitude && params.longitude && params.radius) {
        // Note: This is a simplified approach. For accurate radius filtering,
        // you'd need to use PostGIS or calculate distance in the query
        // For now, we'll filter by city/state if provided
      }

      // Order by date
      query = query.order('event_date', { ascending: true });

      // Pagination
      const page = params.page || 1;
      const perPage = params.perPage || params.limit || 20;
      const startIndex = (page - 1) * perPage;
      const endIndex = startIndex + perPage - 1;
      query = query.range(startIndex, endIndex);

      const { data, error, count } = await query;

      if (error) {
        console.error('❌ Database search error:', error);
        return {
          events: [],
          total: 0,
          sources: { jambase: false, ticketmaster: false },
          hasNextPage: false
        };
      }

      const events: UnifiedEvent[] = (data || []).map(event => ({
        id: event.id,
        source: 'manual' as const,
        title: event.title || event.artist_name || 'Event',
        artist_name: event.artist_name || 'Unknown Artist',
        artist_id: event.artist_id,
        venue_name: event.venue_name || 'Unknown Venue',
        venue_id: event.venue_id,
        event_date: event.event_date,
        doors_time: event.doors_time,
        description: event.description,
        genres: event.genres || [],
        venue_address: event.venue_address,
        venue_city: event.venue_city,
        venue_state: event.venue_state,
        venue_zip: event.venue_zip,
        latitude: event.latitude,
        longitude: event.longitude,
        ticket_available: event.ticket_available ?? true,
        price_range: event.price_range,
        ticket_urls: event.ticket_urls || [],
        external_url: event.external_url,
        price_min: event.price_min,
        price_max: event.price_max,
        price_currency: event.price_currency,
        event_status: event.event_status,
        attraction_ids: event.attraction_ids,
        classifications: event.classifications,
        sales_info: event.sales_info,
        images: event.images,
        tour_name: event.tour_name,
        setlist: event.setlist,
      }));

      return {
        events,
        total: count || 0,
        sources: { jambase: false, ticketmaster: false },
        hasNextPage: (count || 0) > endIndex + 1
      };
    } catch (error) {
      console.error('❌ Search error:', error);
      return {
        events: [],
        total: 0,
        sources: { jambase: false, ticketmaster: false },
        hasNextPage: false
      };
    }
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
   * Search events by artist name (database only)
   */
  static async searchByArtist(params: {
    artistName: string;
    includePastEvents?: boolean;
    pastEventsMonths?: number;
    limit?: number;
  }): Promise<UnifiedEvent[]> {
    const now = new Date();
    const pastDate = new Date();
    pastDate.setMonth(pastDate.getMonth() - (params.pastEventsMonths || 3));

    let query = supabase
      .from('events')
      .select('*')
      .ilike('artist_name', `%${params.artistName}%`);

    if (!params.includePastEvents) {
      query = query.gte('event_date', now.toISOString());
    } else {
      query = query.gte('event_date', pastDate.toISOString());
    }

    query = query.order('event_date', { ascending: true });
    
    if (params.limit) {
      query = query.limit(params.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Error searching events by artist:', error);
      return [];
    }

    return (data || []).map(event => ({
      id: event.id,
      source: 'manual' as const,
      title: event.title || event.artist_name || 'Event',
      artist_name: event.artist_name || 'Unknown Artist',
      artist_id: event.artist_id,
      venue_name: event.venue_name || 'Unknown Venue',
      venue_id: event.venue_id,
      event_date: event.event_date,
      doors_time: event.doors_time,
      description: event.description,
      genres: event.genres || [],
      venue_address: event.venue_address,
      venue_city: event.venue_city,
      venue_state: event.venue_state,
      venue_zip: event.venue_zip,
      latitude: event.latitude,
      longitude: event.longitude,
      ticket_available: event.ticket_available ?? true,
      price_range: event.price_range,
      ticket_urls: event.ticket_urls || [],
      external_url: event.external_url,
      price_min: event.price_min,
      price_max: event.price_max,
      price_currency: event.price_currency,
      event_status: event.event_status,
      attraction_ids: event.attraction_ids,
      classifications: event.classifications,
      sales_info: event.sales_info,
      images: event.images,
      tour_name: event.tour_name,
      setlist: event.setlist,
    }));
  }

  /**
   * Search events by venue name (database only)
   */
  static async searchByVenue(params: {
    venueName: string;
    venueCity?: string;
    venueState?: string;
    includePastEvents?: boolean;
    pastEventsMonths?: number;
    limit?: number;
  }): Promise<UnifiedEvent[]> {
    const now = new Date();
    const pastDate = new Date();
    pastDate.setMonth(pastDate.getMonth() - (params.pastEventsMonths || 3));

    let query = supabase
      .from('events')
      .select('*')
      .ilike('venue_name', `%${params.venueName}%`);

    if (params.venueCity) {
      query = query.ilike('venue_city', `%${params.venueCity}%`);
    }

    if (params.venueState) {
      query = query.eq('venue_state', params.venueState);
    }

    if (!params.includePastEvents) {
      query = query.gte('event_date', now.toISOString());
    } else {
      query = query.gte('event_date', pastDate.toISOString());
    }

    query = query.order('event_date', { ascending: true });
    
    if (params.limit) {
      query = query.limit(params.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Error searching events by venue:', error);
      return [];
    }

    return (data || []).map(event => ({
      id: event.id,
      source: 'manual' as const,
      title: event.title || event.artist_name || 'Event',
      artist_name: event.artist_name || 'Unknown Artist',
      artist_id: event.artist_id,
      venue_name: event.venue_name || 'Unknown Venue',
      venue_id: event.venue_id,
      event_date: event.event_date,
      doors_time: event.doors_time,
      description: event.description,
      genres: event.genres || [],
      venue_address: event.venue_address,
      venue_city: event.venue_city,
      venue_state: event.venue_state,
      venue_zip: event.venue_zip,
      latitude: event.latitude,
      longitude: event.longitude,
      ticket_available: event.ticket_available ?? true,
      price_range: event.price_range,
      ticket_urls: event.ticket_urls || [],
      external_url: event.external_url,
      price_min: event.price_min,
      price_max: event.price_max,
      price_currency: event.price_currency,
      event_status: event.event_status,
      attraction_ids: event.attraction_ids,
      classifications: event.classifications,
      sales_info: event.sales_info,
      images: event.images,
      tour_name: event.tour_name,
      setlist: event.setlist,
    }));
  }
}
