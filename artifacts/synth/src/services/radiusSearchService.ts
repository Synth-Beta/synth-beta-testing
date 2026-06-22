import { supabase } from '@/integrations/supabase/client';
import { JamBaseEventResponse } from '@/types/eventTypes';
import { calculateDistance, filterEventsByRadius, calculateCenter, calculateBounds, calculateZoomLevel } from '@/utils/distanceUtils';
import { normalizeCityName } from '@/utils/cityNormalization';

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
        .from('events')
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
        .from('events')
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
        .from('events')
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
        .from('events')
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
   * First tries city_centers table, then falls back to event-based calculation
   */
  static async getCityCoordinates(city: string, state?: string): Promise<{ lat: number; lng: number } | null> {
    try {
      const normalizedCity = normalizeCityName(city);
      const stateNormalized = state ? state.toLowerCase().trim() : null;
      const searchVariants = buildCitySearchVariants(normalizedCity, stateNormalized);
      const normalizedVariantSet = new Set(searchVariants.map((variant) => normalizeCityName(variant)));

      let query = supabase
        .from('city_centers')
        .select('normalized_name, state, center_latitude, center_longitude, aliases, event_count');

      if (searchVariants.length > 0) {
        const normalizedNameFilters = searchVariants
          .map((variant) => `normalized_name.ilike.%${variant}%`)
          .join(',');
        const aliasFilters = searchVariants
          .map((variant) => `aliases.cs.{${variant}}`)
          .join(',');
        const combined = [normalizedNameFilters, aliasFilters].filter(Boolean).join(',');
        if (combined) {
          query = query.or(combined);
        }
      }

      const { data: cityCenterData, error: cityCenterError } = await query.limit(10);

      if (!cityCenterError && cityCenterData && cityCenterData.length > 0) {
        const scored = cityCenterData
          .map((match) => ({
            match,
            score: scoreCityCenterMatch(match, normalizedVariantSet, stateNormalized),
          }))
          .sort((a, b) => b.score - a.score);

        const bestMatch = scored[0]?.match;
        if (bestMatch && bestMatch.center_latitude && bestMatch.center_longitude) {
          return {
            lat: Number(bestMatch.center_latitude),
            lng: Number(bestMatch.center_longitude),
          };
        }
      }

      // Fallback: Try to get coordinates from events table
      let eventQuery = supabase
        .from('events')
        .select('latitude, longitude, venue_city, venue_state')
        .ilike('venue_city', `%${normalizedCity}%`)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      if (state) {
        eventQuery = eventQuery.ilike('venue_state', `%${state.toLowerCase().trim()}%`);
      }

      const { data: eventData, error: eventError } = await eventQuery.limit(5);

      if (!eventError && eventData && eventData.length > 0) {
        // Calculate average coordinates for better center point
        const validCoords = eventData.filter(d => 
          d.latitude != null && 
          d.longitude != null &&
          !Number.isNaN(Number(d.latitude)) &&
          !Number.isNaN(Number(d.longitude))
        );

        if (validCoords.length > 0) {
          const avgLat = validCoords.reduce((sum, d) => sum + Number(d.latitude), 0) / validCoords.length;
          const avgLng = validCoords.reduce((sum, d) => sum + Number(d.longitude), 0) / validCoords.length;

          return {
            lat: avgLat,
            lng: avgLng
          };
        }
      }
      
      // Final fallback: Try hardcoded coordinates for major cities
      const fallbackCandidates = [...searchVariants, normalizedCity];
      for (const candidate of fallbackCandidates) {
        const fallbackKey = candidate.replace(/\s+/g, ' ').trim();
        if (fallbackKey && this.CITY_COORDINATES[fallbackKey]) {
          return this.CITY_COORDINATES[fallbackKey];
        }
      }
      
      // No coordinates found
      return null;
    } catch (error) {
      console.error('Error getting city coordinates:', error);
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

const CITY_NAME_SUFFIXES = [
  'district of columbia',
  'city',
  'county',
  'borough',
  'metro area',
  'metropolitan area',
  'municipality',
  'township',
  'parish',
];

function buildCitySearchVariants(normalizedCity: string, state?: string | null): string[] {
  const variants = new Set<string>();
  const cleaned = normalizedCity.replace(/\s+/g, ' ').trim();
  if (cleaned) {
    variants.add(cleaned);
  }

  const stateNormalized = state ? state.toLowerCase().trim() : null;
  if (stateNormalized) {
    variants.add(stateNormalized);
    if (cleaned.endsWith(stateNormalized)) {
      variants.add(cleaned.slice(0, -stateNormalized.length).trim());
    }
  }

  CITY_NAME_SUFFIXES.forEach((suffix) => {
    if (cleaned.endsWith(` ${suffix}`)) {
      variants.add(cleaned.slice(0, -suffix.length).trim());
    }
  });

  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length > 1) {
    variants.add(parts.slice(0, parts.length - 1).join(' '));
    variants.add(parts.slice(0, Math.min(parts.length, 2)).join(' '));
    variants.add(parts[0]);
  }

  if (!variants.has('washington') && cleaned.includes('washington')) {
    variants.add('washington');
    variants.add('washington dc');
  }

  return Array.from(variants)
    .map((variant) => variant.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function scoreCityCenterMatch(
  match: any,
  normalizedVariants: Set<string>,
  stateNormalized?: string | null
): number {
  let score = 0;
  const normalizedName = normalizeCityName(match.normalized_name || '');
  if (normalizedVariants.has(normalizedName)) {
    score += 50;
  }

  if (Array.isArray(match.aliases)) {
    const normalizedAliases = match.aliases.map((alias: string) => normalizeCityName(alias));
    if (normalizedAliases.some((alias) => normalizedVariants.has(alias))) {
      score += 40;
    }
  }

  const matchState = match.state ? match.state.toLowerCase().trim() : null;
  if (
    stateNormalized &&
    matchState &&
    (matchState === stateNormalized || matchState === stateNormalized.replace(/\s+/g, ''))
  ) {
    score += 20;
  }

  if (typeof match.event_count === 'number') {
    score += Math.min(match.event_count, 500);
  }

  return score;
}