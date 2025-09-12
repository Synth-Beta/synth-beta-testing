// Concert Search Types
// Comprehensive type definitions for the concert search functionality

export interface Event {
  id: number;
  location: string;
  event_name: string;
  event_date: string;
  event_time: string;
  url: string;
  event_price?: string;
  // JamBase fields
  jambase_event_id?: string;
  title?: string;
  artist_name?: string;
  artist_id?: string;
  venue_name?: string;
  venue_id?: string;
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
  tour_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface EventSearchParams {
  artist: string;
  venue: string;
  date: string; // YYYY-MM-DD format
}

export interface EventSearchResult {
  event: Event;
  isNewEvent: boolean;
}

// JamBase API response structure
export interface JamBaseEvent {
  id: string;
  title: string;
  artist: {
    name: string;
    id: string;
    genres?: string[];
  };
  venue: {
    name: string;
    id: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    latitude?: number;
    longitude?: number;
  };
  dateTime: string;
  doors?: string;
  description?: string;
  ticketing?: {
    available: boolean;
    priceRange?: string;
    urls?: string[];
  };
  setlist?: any[];
  tour?: string;
}

// Legacy Concert interface for backward compatibility
export interface Concert {
  id: string;
  artist: string;
  date: string;
  venue: string;
  profile_pic?: string;
  tour?: string;
  setlist?: string[];
  venue_location?: string;
  source: string;
  confidence: string;
  created_at: string;
}

// Search parameters for legacy concert search
export interface SearchParams {
  query?: string;
  artist?: string;
  venue?: string;
  date?: string;
  tour?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResponse {
  success: boolean;
  concerts: Concert[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ConcertStats {
  totalConcerts: number;
  uniqueArtists: number;
  uniqueVenues: number;
  sourceCounts: Record<string, number>;
}
