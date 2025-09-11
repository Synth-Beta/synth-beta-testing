// Concert API service for searching and managing concerts
// Integrates with JamBase API and your backend

const API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:3001';

// Original Concert interface (keeping your existing structure)
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

// Extended Event interface for JamBase integration (matches your database)
export interface Event {
  id: number; // bigserial from your events table
  location: string; // existing field
  event_name: string; // existing field
  event_date: string; // existing field (date)
  event_time: string; // existing field (time)
  url: string; // existing field
  event_price?: string; // existing field
  // New JamBase fields
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

// Search parameters for event search
export interface EventSearchParams {
  artist: string;
  venue: string;
  date: string; // YYYY-MM-DD format
}

// Result of event search
export interface EventSearchResult {
  event: Event;
  isNewEvent: boolean;
}

// Original search params (keeping for backward compatibility)
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

class ConcertApiService {
  private readonly jambaseApiKey = 'e7ed3a9b-e73a-446e-b7c6-a96d1c53a030';
  private readonly jambaseBaseUrl = 'https://www.jambase.com/jb-api/v1';

  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // JamBase Event Search - Main functionality for your app
  async searchEvent(params: EventSearchParams, userId: string): Promise<EventSearchResult> {
    const endpoint = '/api/events/search';
    
    return this.makeRequest<EventSearchResult>(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        artist: params.artist,
        venue: params.venue,
        date: params.date,
        userId: userId
      })
    });
  }

  // Get user's events (JamBase events they've searched for)
  async getUserEvents(userId: string): Promise<{ events: Event[] }> {
    return this.makeRequest<{ events: Event[] }>(`/api/events/user/${userId}`);
  }

  // Direct JamBase API call (fallback/testing)
  async searchJamBaseDirectly(params: EventSearchParams): Promise<JamBaseEvent[]> {
    const { artist, venue, date } = params;
    
    // Use the correct JamBase events endpoint
    const searchUrl = new URL(`${this.jambaseBaseUrl}/events`);
    searchUrl.searchParams.append('apikey', this.jambaseApiKey);
    
    // Add artist search if provided
    if (artist) {
      searchUrl.searchParams.append('artistName', artist);
    }
    
    // Add venue search if provided  
    if (venue) {
      searchUrl.searchParams.append('venueName', venue);
    }
    
    // Add date filter if provided
    if (date) {
      searchUrl.searchParams.append('eventDateFrom', date);
      searchUrl.searchParams.append('eventDateTo', date);
    }
    
    searchUrl.searchParams.append('limit', '10');

    try {
      console.log('Calling JamBase API directly:', searchUrl.toString());
      
      const response = await fetch(searchUrl.toString());
      
      if (!response.ok) {
        throw new Error(`JamBase API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.events || [];
    } catch (error) {
      console.error('JamBase API Error:', error);
      throw new Error(`Failed to search JamBase: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Search artists on JamBase
  async searchJamBaseArtists(artistName: string): Promise<any[]> {
    const searchUrl = new URL(`${this.jambaseBaseUrl}/artists`);
    searchUrl.searchParams.append('apikey', this.jambaseApiKey);
    searchUrl.searchParams.append('artistName', artistName);

    try {
      const response = await fetch(searchUrl.toString());
      if (!response.ok) {
        throw new Error(`JamBase API error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      return data.artists || [];
    } catch (error) {
      console.error('JamBase Artists API Error:', error);
      throw new Error(`Failed to search JamBase artists: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Search venues on JamBase
  async searchJamBaseVenues(venueName: string): Promise<any[]> {
    const searchUrl = new URL(`${this.jambaseBaseUrl}/venues`);
    searchUrl.searchParams.append('apikey', this.jambaseApiKey);
    searchUrl.searchParams.append('venueName', venueName);

    try {
      const response = await fetch(searchUrl.toString());
      if (!response.ok) {
        throw new Error(`JamBase API error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      return data.venues || [];
    } catch (error) {
      console.error('JamBase Venues API Error:', error);
      throw new Error(`Failed to search JamBase venues: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Original concert search methods (keeping for backward compatibility)
  async searchConcerts(params: SearchParams): Promise<SearchResponse> {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        searchParams.append(key, value.toString());
      }
    });

    const queryString = searchParams.toString();
    const endpoint = `/api/concerts/search${queryString ? `?${queryString}` : ''}`;

    return this.makeRequest<SearchResponse>(endpoint);
  }

  async getConcertById(id: string): Promise<{ success: boolean; concert: Concert }> {
    return this.makeRequest<{ success: boolean; concert: Concert }>(`/api/concerts/${id}`);
  }

  async getRecentConcerts(limit: number = 10): Promise<{ success: boolean; concerts: Concert[] }> {
    return this.makeRequest<{ success: boolean; concerts: Concert[] }>(`/api/concerts/recent?limit=${limit}`);
  }

  async getConcertStats(): Promise<{ success: boolean; stats: ConcertStats }> {
    return this.makeRequest<{ success: boolean; stats: ConcertStats }>('/api/concerts/stats');
  }

  // Convert Event to Concert format for backward compatibility
  private eventToConcert(event: Event): Concert {
    return {
      id: event.id.toString(),
      artist: event.artist_name || event.event_name.split(' at ')[0] || 'Unknown Artist',
      date: event.event_date,
      venue: event.venue_name || event.location,
      profile_pic: undefined,
      tour: event.tour_name,
      setlist: Array.isArray(event.setlist) ? event.setlist : [],
      venue_location: event.venue_city && event.venue_state 
        ? `${event.venue_city}, ${event.venue_state}` 
        : event.location,
      source: event.jambase_event_id ? 'jambase_api' : 'manual',
      confidence: event.jambase_event_id ? 'high' : 'medium',
      created_at: event.created_at || new Date().toISOString()
    };
  }

  // Get user events in Concert format for existing components
  async getUserConcerts(userId: string): Promise<Concert[]> {
    const result = await this.getUserEvents(userId);
    return result.events.map(event => this.eventToConcert(event));
  }


}

export const concertApiService = new ConcertApiService();