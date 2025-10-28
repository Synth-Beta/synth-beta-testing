/**
 * Ticketmaster Population Service
 * 
 * Automatically populates NEW events from Ticketmaster API based on user location
 * when they log in. This ensures the database stays up-to-date with local events.
 */

// Use relative URL in production (Vercel serverless functions) or backend URL in development
const getBackendUrl = () => {
  if (typeof window !== 'undefined') {
    const isProduction = window.location.hostname.includes('vercel.app') || window.location.hostname !== 'localhost';
    return isProduction ? '' : (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001');
  }
  return import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
};
// API key is handled by backend via environment variable - don't expose it in frontend

export interface TicketmasterPopulationResult {
  success: boolean;
  eventsAdded: number;
  totalEvents: number;
  source: 'ticketmaster';
  error?: string;
}

export class TicketmasterPopulationService {
  /**
   * Populate new events from Ticketmaster API based on user location
   * This fetches events and the backend automatically handles deduplication
   * by checking ticketmaster_event_id
   */
  static async populateEventsNearLocation(params: {
    latitude: number;
    longitude: number;
    radius?: number; // in miles, default 50
    limit?: number; // max events to fetch, default 200
  }): Promise<TicketmasterPopulationResult> {
    const { latitude, longitude, radius = 50, limit = 200 } = params;

    try {
      console.log('🎫 Populating Ticketmaster events for location:', { latitude, longitude, radius });

      // Build query parameters for Ticketmaster API
      const queryParams = new URLSearchParams();
      queryParams.append('latlong', `${latitude},${longitude}`);
      queryParams.append('radius', radius.toString());
      queryParams.append('unit', 'miles');
      queryParams.append('size', limit.toString());
      queryParams.append('sort', 'date,asc'); // Get upcoming events first
      queryParams.append('classificationName', 'music'); // Only music events
      
      // Only get FUTURE events (today onwards)
      const now = new Date();
      queryParams.append('startDateTime', now.toISOString().split('.')[0] + 'Z');
      
      // API key is handled by backend - don't expose it in frontend

      const url = `${getBackendUrl()}/api/ticketmaster/events?${queryParams.toString()}`;
      
      console.log('📡 Calling Ticketmaster API:', url);

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

      const eventsCount = data.events?.length || 0;
      
      console.log(`✅ Populated ${eventsCount} events from Ticketmaster API`);
      console.log(`   Location: ${latitude}, ${longitude}`);
      console.log(`   Radius: ${radius} miles`);

      return {
        success: true,
        eventsAdded: eventsCount, // Backend handles deduplication, so this is what was returned
        totalEvents: eventsCount,
        source: 'ticketmaster'
      };

    } catch (error) {
      console.error('❌ Error populating Ticketmaster events:', error);
      
      return {
        success: false,
        eventsAdded: 0,
        totalEvents: 0,
        source: 'ticketmaster',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Populate events by city (fallback if location unavailable)
   */
  static async populateEventsByCity(params: {
    city: string;
    stateCode?: string;
    countryCode?: string;
    limit?: number;
  }): Promise<TicketmasterPopulationResult> {
    const { city, stateCode, countryCode, limit = 200 } = params;

    try {
      console.log('🎫 Populating Ticketmaster events for city:', { city, stateCode, countryCode });

      const queryParams = new URLSearchParams();
      queryParams.append('city', city);
      if (stateCode) queryParams.append('stateCode', stateCode);
      if (countryCode) queryParams.append('countryCode', countryCode);
      queryParams.append('size', limit.toString());
      queryParams.append('sort', 'date,asc');
      queryParams.append('classificationName', 'music');
      // API key is handled by backend - don't expose it in frontend

      const url = `${getBackendUrl()}/api/ticketmaster/events?${queryParams.toString()}`;
      
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

      const eventsCount = data.events?.length || 0;
      
      console.log(`✅ Populated ${eventsCount} events from Ticketmaster for ${city}`);

      return {
        success: true,
        eventsAdded: eventsCount,
        totalEvents: eventsCount,
        source: 'ticketmaster'
      };

    } catch (error) {
      console.error('❌ Error populating Ticketmaster events by city:', error);
      
      return {
        success: false,
        eventsAdded: 0,
        totalEvents: 0,
        source: 'ticketmaster',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
