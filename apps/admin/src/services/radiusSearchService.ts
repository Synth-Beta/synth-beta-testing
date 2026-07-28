import { supabase } from '@/integrations/supabase/client';
import { JamBaseEventResponse } from './jambaseEventsService';
import { calculateDistance, filterEventsByRadius, calculateCenter, calculateBounds, calculateZoomLevel } from '@/utils/distanceUtils';

export interface RadiusSearchParams {
  zipCode?: string;
  city?: string;
  state?: string;
  radiusMiles?: number;
  limit?: number;
}

export interface EventWithDistance extends JamBaseEventResponse {
  distance_miles: number;
}

export interface MapConfig {
  center: [number, number];
  zoom: number;
  bounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

export class RadiusSearchService {
  // Fallback coordinates for major cities
  private static readonly CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
    'washington': { lat: 38.9072, lng: -77.0369 },
    'washington dc': { lat: 38.9072, lng: -77.0369 },
    'new york': { lat: 40.7128, lng: -74.0060 },
    'los angeles': { lat: 34.0522, lng: -118.2437 },
    'chicago': { lat: 41.8781, lng: -87.6298 },
    'houston': { lat: 29.7604, lng: -95.3698 },
    'phoenix': { lat: 33.4484, lng: -112.0740 },
    'philadelphia': { lat: 39.9526, lng: -75.1652 },
    'san antonio': { lat: 29.4241, lng: -98.4936 },
    'san diego': { lat: 32.7157, lng: -117.1611 },
    'dallas': { lat: 32.7767, lng: -96.7970 },
    'san jose': { lat: 37.3382, lng: -121.8863 },
    'austin': { lat: 30.2672, lng: -97.7431 },
    'jacksonville': { lat: 30.3322, lng: -81.6557 },
    'san francisco': { lat: 37.7749, lng: -122.4194 },
    'columbus': { lat: 39.9612, lng: -82.9988 },
    'fort worth': { lat: 32.7555, lng: -97.3308 },
    'indianapolis': { lat: 39.7684, lng: -86.1581 },
    'charlotte': { lat: 35.2271, lng: -80.8431 },
    'seattle': { lat: 47.6062, lng: -122.3321 },
    'denver': { lat: 39.7392, lng: -104.9903 },
    'boston': { lat: 42.3601, lng: -71.0589 },
    'detroit': { lat: 42.3314, lng: -83.0458 },
    'nashville': { lat: 36.1627, lng: -86.7816 },
    'portland': { lat: 45.5152, lng: -122.6784 },
    'las vegas': { lat: 36.1699, lng: -115.1398 },
    'memphis': { lat: 35.1495, lng: -90.0490 },
    'louisville': { lat: 38.2527, lng: -85.7585 },
    'baltimore': { lat: 39.2904, lng: -76.6122 },
    'milwaukee': { lat: 43.0389, lng: -87.9065 },
    'albuquerque': { lat: 35.0844, lng: -106.6504 },
    'tucson': { lat: 32.2226, lng: -110.9747 },
    'fresno': { lat: 36.7378, lng: -119.7871 },
    'sacramento': { lat: 38.5816, lng: -121.4944 },
    'kansas city': { lat: 39.0997, lng: -94.5786 },
    'mesa': { lat: 33.4152, lng: -111.8315 },
    'atlanta': { lat: 33.7490, lng: -84.3880 },
    'omaha': { lat: 41.2565, lng: -95.9345 },
    'colorado springs': { lat: 38.8339, lng: -104.8214 },
    'raleigh': { lat: 35.7796, lng: -78.6382 },
    'miami': { lat: 25.7617, lng: -80.1918 },
    'long beach': { lat: 33.7701, lng: -118.1937 },
    'virginia beach': { lat: 36.8529, lng: -75.9780 },
    'oakland': { lat: 37.8044, lng: -122.2712 },
    'minneapolis': { lat: 44.9778, lng: -93.2650 },
    'tulsa': { lat: 36.1540, lng: -95.9928 },
    'arlington': { lat: 32.7357, lng: -97.1081 },
    'tampa': { lat: 27.9506, lng: -82.4572 }
  };
  /**
   * Get events within a radius of a zip code
   */
  static async getEventsNearZip(params: RadiusSearchParams): Promise<EventWithDistance[]> {
    try {
      const { zipCode, radiusMiles = 25, limit = 100 } = params;
      
      if (!zipCode) {
        throw new Error('Zip code is required');
      }

      // First, get the center coordinates for the zip code
      const centerCoords = await this.getZipCoordinates(zipCode);
      if (!centerCoords) {
        // No coordinates found for zip code
        return [];
      }

      // Get all events with coordinates within a reasonable bounding box
      // This is more efficient than getting all events and filtering
      const latRange = radiusMiles / 69; // Approximate miles per degree latitude
      const lngRange = radiusMiles / (69 * Math.cos(centerCoords.lat * Math.PI / 180)); // Adjust for longitude

      const { data, error } = await supabase
        .from('jambase_events')
        .select('*')
        .gte('event_date', new Date().toISOString())
        .gte('latitude', centerCoords.lat - latRange)
        .lte('latitude', centerCoords.lat + latRange)
        .gte('longitude', centerCoords.lng - lngRange)
        .lte('longitude', centerCoords.lng + lngRange)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(500); // Get more events to filter by radius

      if (error) throw error;

      // Transform to our event format
      const events = (data || []).map((event: any) => ({
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
        tour_name: event.tour_name,
        created_at: event.created_at,
        updated_at: event.updated_at
      }));

      // Filter by exact radius and calculate distances
      const eventsWithDistance = filterEventsByRadius(
        events,
        centerCoords.lat,
        centerCoords.lng,
        radiusMiles
      );

      // Sort by distance and limit results
      return eventsWithDistance.slice(0, limit);
    } catch (error) {
      // Error getting events near zip
      return [];
    }
  }

  /**
   * Get events within a radius of a city
   */
  static async getEventsNearCity(params: RadiusSearchParams): Promise<EventWithDistance[]> {
    try {
      const { city, state, radiusMiles = 25, limit = 100 } = params;
      
      if (!city) {
        throw new Error('City is required');
      }

      // First, get the center coordinates for the city
      const centerCoords = await this.getCityCoordinates(city, state);
      if (!centerCoords) {
        // No coordinates found for city
        return [];
      }

      // Get all events with coordinates within a reasonable bounding box
      const latRange = radiusMiles / 69; // Approximate miles per degree latitude
      const lngRange = radiusMiles / (69 * Math.cos(centerCoords.lat * Math.PI / 180)); // Adjust for longitude

      const { data, error } = await supabase
        .from('jambase_events')
        .select('*')
        .gte('event_date', new Date().toISOString())
        .gte('latitude', centerCoords.lat - latRange)
        .lte('latitude', centerCoords.lat + latRange)
        .gte('longitude', centerCoords.lng - lngRange)
        .lte('longitude', centerCoords.lng + lngRange)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(500); // Get more events to filter by radius

      if (error) throw error;

      // Transform to our event format
      const events = (data || []).map((event: any) => ({
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
        tour_name: event.tour_name,
        created_at: event.created_at,
        updated_at: event.updated_at
      }));

      // Filter by exact radius and calculate distances
      const eventsWithDistance = filterEventsByRadius(
        events,
        centerCoords.lat,
        centerCoords.lng,
        radiusMiles
      );

      // Sort by distance and limit results
      return eventsWithDistance.slice(0, limit);
    } catch (error) {
      // Error getting events near city
      return [];
    }
  }

  /**
   * Get zip codes near a city (for city search suggestions)
   */
  static async getZipsNearCity(city: string, state?: string, radiusMiles: number = 25) {
    try {
      // For now, get unique zip codes from events in the city until RPC functions are available
      let query = supabase
        .from('jambase_events')
        .select('venue_zip, venue_city, venue_state, latitude, longitude')
        .eq('venue_city', city)
        .gte('event_date', new Date().toISOString())
        .not('venue_zip', 'is', null);

      if (state) {
        query = query.eq('venue_state', state);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Get unique zip codes
      const uniqueZips = new Map();
      (data || []).forEach((event: any) => {
        if (event.venue_zip && event.venue_zip !== '') {
          uniqueZips.set(event.venue_zip, {
            zip_code: event.venue_zip,
            city: event.venue_city,
            state: event.venue_state,
            latitude: event.latitude,
            longitude: event.longitude,
            distance_miles: 0 // Will be calculated properly once RPC functions are available
          });
        }
      });

      return Array.from(uniqueZips.values());
    } catch (error) {
      // Error getting zip codes near city
      return [];
    }
  }

  /**
   * Get map center coordinates for a zip code
   */
  static async getZipCoordinates(zipCode: string): Promise<{ lat: number; lng: number } | null> {
    try {
      // For now, get coordinates from jambase_events until zip_codes table is available
      const { data, error } = await supabase
        .from('jambase_events')
        .select('latitude, longitude')
        .eq('venue_zip', zipCode)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(1)
        .single();

      if (error) throw error;
      
      return data ? {
        lat: Number(data.latitude),
        lng: Number(data.longitude)
      } : null;
    } catch (error) {
      // Error getting zip coordinates
      return null;
    }
  }

  /**
   * Get map center coordinates for a city
   */
  static async getCityCoordinates(city: string, state?: string): Promise<{ lat: number; lng: number } | null> {
    try {
      // Normalize city name for better matching
      const normalizedCity = city.toLowerCase().trim();
      
      // Try exact match first
      let query = supabase
        .from('jambase_events')
        .select('latitude, longitude, venue_city, venue_state')
        .ilike('venue_city', `%${normalizedCity}%`)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      if (state) {
        query = query.ilike('venue_state', `%${state.toLowerCase().trim()}%`);
      }

      const { data, error } = await query.limit(5);

      if (error) {
        // Database error
        return null;
      }
      
      if (!data || data.length === 0) {
        // No coordinates found in database for city
        
        // Try fallback coordinates for major cities
        const fallbackKey = normalizedCity.replace(/\s+/g, ' ').trim();
        const fallbackCoords = this.CITY_COORDINATES[fallbackKey];
        
        if (fallbackCoords) {
          // Using fallback coordinates
          return fallbackCoords;
        }
        
        // No fallback coordinates available for city
        return null;
      }

      // Calculate average coordinates for better center point
      const validCoords = data.filter(d => 
        d.latitude != null && 
        d.longitude != null &&
        !Number.isNaN(Number(d.latitude)) &&
        !Number.isNaN(Number(d.longitude))
      );

      if (validCoords.length === 0) {
        // No valid coordinates found for city
        return null;
      }

      const avgLat = validCoords.reduce((sum, d) => sum + Number(d.latitude), 0) / validCoords.length;
      const avgLng = validCoords.reduce((sum, d) => sum + Number(d.longitude), 0) / validCoords.length;

      // Found coordinates for city
      
      return {
        lat: avgLat,
        lng: avgLng
      };
    } catch (error) {
      // Error getting city coordinates
      return null;
    }
  }

  /**
   * Search events by location with automatic radius detection
   */
  static async searchEventsByLocation(
    location: string, 
    radiusMiles: number = 25,
    limit: number = 100
  ): Promise<EventWithDistance[]> {
    // Try to determine if it's a zip code or city
    const isZipCode = /^\d{5}(-\d{4})?$/.test(location.trim());
    
    if (isZipCode) {
      return this.getEventsNearZip({
        zipCode: location.trim(),
        radiusMiles,
        limit
      });
    } else {
      // Assume it's a city name
      const [city, state] = location.split(',').map(s => s.trim());
      return this.getEventsNearCity({
        city,
        state: state || undefined,
        radiusMiles,
        limit
      });
    }
  }

  /**
   * Get map configuration (center, zoom, bounds) for a set of events
   */
  static getMapConfigForEvents(events: EventWithDistance[], fallbackCenter?: [number, number]): MapConfig {
    const validEvents = events.filter(event => 
      event.latitude != null && 
      event.longitude != null &&
      !Number.isNaN(Number(event.latitude)) &&
      !Number.isNaN(Number(event.longitude))
    );

    if (validEvents.length === 0) {
      return {
        center: fallbackCenter || [39.8283, -98.5795],
        zoom: 4
      };
    }

    if (validEvents.length === 1) {
      return {
        center: [Number(validEvents[0].latitude), Number(validEvents[0].longitude)],
        zoom: 12
      };
    }

    const coordinates: [number, number][] = validEvents.map(event => [
      Number(event.latitude),
      Number(event.longitude)
    ]);

    const center = calculateCenter(coordinates);
    const bounds = calculateBounds(coordinates, 0.05); // 0.05 degree padding
    const zoom = calculateZoomLevel(bounds);

    return {
      center,
      zoom,
      bounds
    };
  }

  /**
   * Enhanced version that will use RPC functions once they're available
   * This method can be called after the SQL functions are applied to the database
   */
  static async getEventsNearZipWithRPC(params: RadiusSearchParams): Promise<EventWithDistance[]> {
    try {
      const { zipCode, radiusMiles = 25, limit = 100 } = params;
      
      if (!zipCode) {
        throw new Error('Zip code is required');
      }

      // Try to use RPC function if available, fallback to direct query
      try {
        const { data, error } = await (supabase as any).rpc('get_events_near_zip_improved', {
          search_zip: zipCode,
          radius_miles: radiusMiles
        });

        if (!error && data) {
          return (data as any[]).slice(0, limit).map((event: any) => ({
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
            tour_name: event.tour_name,
            created_at: event.created_at,
            updated_at: event.updated_at,
            distance_miles: event.distance_miles
          }));
        }
      } catch (rpcError) {
        // RPC function not available, falling back to direct query
      }

      // Fallback to direct query
      return this.getEventsNearZip(params);
    } catch (error) {
      // Error getting events near zip with RPC
      return [];
    }
  }
}