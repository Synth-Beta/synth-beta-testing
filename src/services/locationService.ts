import { supabase } from '@/integrations/supabase/client';
import { JamBaseEventResponse } from '@/types/eventTypes';

export interface LocationSearchParams {
  latitude: number;
  longitude: number;
  radius: number; // in miles
  limit?: number;
  startDate?: string;
  endDate?: string;
}

export interface CityCoordinates {
  name: string;
  lat: number;
  lng: number;
  state?: string;
  country?: string;
}

export class LocationService {
  // Major cities for quick location search
  private static readonly CITY_COORDINATES: Record<string, CityCoordinates> = {
    'new york': { name: 'New York', lat: 40.7128, lng: -74.0060, state: 'NY' },
    'los angeles': { name: 'Los Angeles', lat: 34.0522, lng: -118.2437, state: 'CA' },
    'chicago': { name: 'Chicago', lat: 41.8781, lng: -87.6298, state: 'IL' },
    'houston': { name: 'Houston', lat: 29.7604, lng: -95.3698, state: 'TX' },
    'phoenix': { name: 'Phoenix', lat: 33.4484, lng: -112.0740, state: 'AZ' },
    'philadelphia': { name: 'Philadelphia', lat: 39.9526, lng: -75.1652, state: 'PA' },
    'san antonio': { name: 'San Antonio', lat: 29.4241, lng: -98.4936, state: 'TX' },
    'san diego': { name: 'San Diego', lat: 32.7157, lng: -117.1611, state: 'CA' },
    'dallas': { name: 'Dallas', lat: 32.7767, lng: -96.7970, state: 'TX' },
    'austin': { name: 'Austin', lat: 30.2672, lng: -97.7431, state: 'TX' },
    'washington dc': { name: 'Washington DC', lat: 38.9072, lng: -77.0369, state: 'DC' },
    'boston': { name: 'Boston', lat: 42.3601, lng: -71.0589, state: 'MA' },
    'denver': { name: 'Denver', lat: 39.7392, lng: -104.9903, state: 'CO' },
    'seattle': { name: 'Seattle', lat: 47.6062, lng: -122.3321, state: 'WA' },
    'san francisco': { name: 'San Francisco', lat: 37.7749, lng: -122.4194, state: 'CA' },
    'miami': { name: 'Miami', lat: 25.7617, lng: -80.1918, state: 'FL' },
    'atlanta': { name: 'Atlanta', lat: 33.7490, lng: -84.3880, state: 'GA' },
    'nashville': { name: 'Nashville', lat: 36.1627, lng: -86.7816, state: 'TN' },
    'portland': { name: 'Portland', lat: 45.5152, lng: -122.6784, state: 'OR' },
    'las vegas': { name: 'Las Vegas', lat: 36.1699, lng: -115.1398, state: 'NV' },
    'detroit': { name: 'Detroit', lat: 42.3314, lng: -83.0458, state: 'MI' },
    'memphis': { name: 'Memphis', lat: 35.1495, lng: -90.0490, state: 'TN' },
    'baltimore': { name: 'Baltimore', lat: 39.2904, lng: -76.6122, state: 'MD' },
    'milwaukee': { name: 'Milwaukee', lat: 43.0389, lng: -87.9065, state: 'WI' },
    'albuquerque': { name: 'Albuquerque', lat: 35.0844, lng: -106.6504, state: 'NM' },
    'tucson': { name: 'Tucson', lat: 32.2226, lng: -110.9747, state: 'AZ' },
    'fresno': { name: 'Fresno', lat: 36.7378, lng: -119.7871, state: 'CA' },
    'sacramento': { name: 'Sacramento', lat: 38.5816, lng: -121.4944, state: 'CA' },
    'kansas city': { name: 'Kansas City', lat: 39.0997, lng: -94.5786, state: 'MO' },
    'mesa': { name: 'Mesa', lat: 33.4152, lng: -111.8315, state: 'AZ' },
    'virginia beach': { name: 'Virginia Beach', lat: 36.8529, lng: -75.9780, state: 'VA' },
    'omaha': { name: 'Omaha', lat: 41.2524, lng: -95.9980, state: 'NE' },
    'colorado springs': { name: 'Colorado Springs', lat: 38.8339, lng: -104.8214, state: 'CO' },
    'raleigh': { name: 'Raleigh', lat: 35.7796, lng: -78.6382, state: 'NC' },
    'long beach': { name: 'Long Beach', lat: 33.7701, lng: -118.1937, state: 'CA' },
  };

  /**
   * Search for a city by name and return coordinates
   */
  static searchCity(cityName: string): CityCoordinates | null {
    const searchKey = cityName.toLowerCase().trim();
    return this.CITY_COORDINATES[searchKey] || null;
  }

  /**
   * Get all available cities
   */
  static getAllCities(): CityCoordinates[] {
    return Object.values(this.CITY_COORDINATES);
  }

  /**
   * Search for events within a geographic radius
   */
  static async searchEventsByLocation(params: LocationSearchParams): Promise<JamBaseEventResponse[]> {
    try {
      const { latitude, longitude, radius, limit = 50, startDate, endDate } = params;
      
      // Convert radius from miles to degrees (approximate)
      // 1 degree latitude ≈ 69 miles
      // 1 degree longitude ≈ 69 miles * cos(latitude)
      const latDelta = radius / 69;
      const lngDelta = radius / (69 * Math.cos(latitude * Math.PI / 180));
      
      const minLat = latitude - latDelta;
      const maxLat = latitude + latDelta;
      const minLng = longitude - lngDelta;
      const maxLng = longitude + lngDelta;

      let query = supabase
        .from('events')
        .select('*')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .gte('latitude', minLat)
        .lte('latitude', maxLat)
        .gte('longitude', minLng)
        .lte('longitude', maxLng)
        .gte('event_date', new Date().toISOString()); // Only upcoming events

      // Apply date filters if provided
      if (startDate) {
        query = query.gte('event_date', startDate);
      }
      if (endDate) {
        query = query.lte('event_date', endDate);
      }

      // Default to upcoming events if no date filters
      if (!startDate && !endDate) {
        query = query.gte('event_date', new Date().toISOString());
      }

      const { data: events, error } = await query
        .order('event_date', { ascending: true })
        .limit(limit);

      if (error) throw error;

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
        latitude: event.latitude ? Number(event.latitude) : undefined,
        longitude: event.longitude ? Number(event.longitude) : undefined,
        ticket_available: event.ticket_available,
        price_range: event.price_range,
        ticket_urls: event.ticket_urls,
        setlist: event.setlist,
        tour_name: event.tour_name,
        created_at: event.created_at,
        updated_at: event.updated_at
      }));

      // Calculate actual distances and filter by exact radius
      const eventsWithDistance = transformedEvents
        .map(event => ({
          ...event,
          distance: LocationService.calculateDistance(
            latitude,
            longitude,
            event.latitude || 0,
            event.longitude || 0
          )
        }))
        .filter(event => event.distance <= radius)
        .sort((a, b) => a.distance - b.distance);

      return eventsWithDistance;
    } catch (error) {
      console.error('Error searching events by location:', error);
      throw new Error(`Failed to search events by location: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate distance between two points using Haversine formula
   */
  static calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 3959; // Earth's radius in miles
    const toRad = (deg: number) => deg * (Math.PI / 180);
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convert degrees to radians
   */
  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Get user's current location (requires browser permission)
   */
  static async getCurrentLocation(): Promise<{ latitude: number; longitude: number }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (error) => {
          reject(new Error(`Failed to get location: ${error.message}`));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minutes
        }
      );
    });
  }

  /**
   * Reverse geocode coordinates to get city name
   * Uses OpenStreetMap Nominatim API (free, no API key required)
   */
  static async reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
    try {
      // First, try to find the nearest city from our known cities list
      let nearestCity: { name: string; distance: number } | null = null;
      const cities = Object.values(this.CITY_COORDINATES);
      
      for (const city of cities) {
        const distance = LocationService.calculateDistance(latitude, longitude, city.lat, city.lng);
        if (!nearestCity || distance < nearestCity.distance) {
          nearestCity = {
            name: city.state ? `${city.name}, ${city.state}` : city.name,
            distance
          };
        }
      }

      // If we found a city within 25 miles, use it
      if (nearestCity && nearestCity.distance <= 25) {
        return nearestCity.name;
      }

      // Otherwise, try OpenStreetMap Nominatim API
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'Synth-App/1.0' // Required by Nominatim
          }
        }
      );

      if (!response.ok) {
        console.warn('Reverse geocoding API failed, using nearest city fallback');
        return nearestCity?.name || null;
      }

      const data = await response.json();
      
      if (data && data.address) {
        const city = data.address.city || data.address.town || data.address.village || data.address.municipality;
        const state = data.address.state;
        
        if (city) {
          return state ? `${city}, ${state}` : city;
        }
      }

      // Fallback to nearest city if API doesn't return city
      return nearestCity?.name || null;
    } catch (error) {
      console.error('Error in reverse geocoding:', error);
      // Try to return nearest known city as fallback
      let nearestCity: { name: string; distance: number } | null = null;
      const cities = Object.values(this.CITY_COORDINATES);
      
      for (const city of cities) {
        const distance = LocationService.calculateDistance(latitude, longitude, city.lat, city.lng);
        if (!nearestCity || distance < nearestCity.distance) {
          nearestCity = {
            name: city.state ? `${city.name}, ${city.state}` : city.name,
            distance
          };
        }
      }
      
      return nearestCity?.name || null;
    }
  }

  /**
   * Search for events near a city
   */
  static async searchEventsByCity(cityName: string, radius: number = 25, limit: number = 50): Promise<{
    events: JamBaseEventResponse[];
    city: CityCoordinates | null;
  }> {
    const city = this.searchCity(cityName);
    if (!city) {
      return { events: [], city: null };
    }

    const events = await this.searchEventsByLocation({
      latitude: city.lat,
      longitude: city.lng,
      radius,
      limit
    });

    return { events, city };
  }
}
