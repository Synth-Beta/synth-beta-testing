// Event type definitions (replaces jambaseEventsService types)
// All API calls have been removed - these are just type definitions

export interface JamBaseEventResponse {
  id: string;
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
  ticket_available?: boolean;
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
  setlist_song_count?: number | null;
  setlist_fm_url?: string | null;
  source?: 'manual' | string;
  created_at?: string;
  updated_at?: string;
  // Deprecated fields (kept for backward compatibility with existing database records)
  /** @deprecated API infrastructure removed - field kept for database compatibility */
  jambase_event_id?: string;
  /** @deprecated API infrastructure removed - field kept for database compatibility */
  ticketmaster_event_id?: string;
  // Promotion fields
  is_promoted?: boolean;
  promotion_tier?: 'basic' | 'premium' | 'featured';
  active_promotion_id?: string;
}

export type JamBaseEvent = JamBaseEventResponse;

