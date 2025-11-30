/**
 * City Service
 * Handles fetching available cities from the city_centers table
 */

import { supabase } from '@/integrations/supabase/client';

export interface CityData {
  name: string;
  normalized_name?: string;
  state?: string;
  center_latitude?: number;
  center_longitude?: number;
  event_count?: number;
  aliases?: string[];
}

export class CityService {
  /**
   * Get available cities from city_centers table
   * @param minEventCount Minimum number of events for city to be included
   * @param limit Maximum number of cities to return
   * @returns Array of city names or city data
   */
  static async getAvailableCities(
    minEventCount: number = 1,
    limit: number = 1000
  ): Promise<CityData[] | string[]> {
    try {
      // Query city_centers table - if it fails, fall back to events table
      const { data, error } = await supabase
        .from('city_centers')
        .select('*')
        .limit(limit);

      if (error) {
        console.warn('⚠️ city_centers table not available or has different structure, using events table:', error.message);
        // Fallback to events table if city_centers doesn't exist or has wrong structure
        return await this.getCitiesFromEvents(minEventCount, limit);
      }

      if (!data || data.length === 0) {
        return await this.getCitiesFromEvents(minEventCount, limit);
      }

      // Return city data - handle different possible column names
      // The table might have different column names, so we check what's available
      return data.map((city: any) => {
        // Try different possible column names (city_name, name, normalized_name)
        const cityName = city.city_name || city.name || city.normalized_name || '';
        return {
          name: cityName,
          city_name: cityName,
          normalized_name: cityName,
          state: city.state || null,
          center_latitude: city.center_latitude ? Number(city.center_latitude) : (city.latitude ? Number(city.latitude) : undefined),
          center_longitude: city.center_longitude ? Number(city.center_longitude) : (city.longitude ? Number(city.longitude) : undefined),
          event_count: city.event_count || city.upcoming_events_count || 0,
          aliases: []
        };
      });
    } catch (error) {
      console.error('Error in getAvailableCities:', error);
      return [];
    }
  }

  /**
   * Fallback method: Get cities from events table if city_centers doesn't exist
   */
  private static async getCitiesFromEvents(
    minEventCount: number = 1,
    limit: number = 1000
  ): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('venue_city, venue_state')
        .not('venue_city', 'is', null)
        .gte('event_date', new Date().toISOString());

      if (error) {
        console.error('Error fetching cities from events:', error);
        return [];
      }

      // Group by city and state
      const cityMap = new Map<string, number>();
      (data || []).forEach((event: any) => {
        const cityKey = event.venue_city 
          ? `${event.venue_city}${event.venue_state ? `, ${event.venue_state}` : ''}`
          : null;
        if (cityKey) {
          cityMap.set(cityKey, (cityMap.get(cityKey) || 0) + 1);
        }
      });

      // Filter by min event count and sort
      const cities = Array.from(cityMap.entries())
        .filter(([_, count]) => count >= minEventCount)
        .sort(([_, a], [__, b]) => b - a)
        .slice(0, limit)
        .map(([city, _]) => city);

      return cities;
    } catch (error) {
      console.error('Error in getCitiesFromEvents:', error);
      return [];
    }
  }
}
