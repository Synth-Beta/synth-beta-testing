import { supabase } from '@/integrations/supabase/client';

export interface JamBaseCity {
  id: string;
  name: string;
  state?: string;
  country: string;
  latitude: number;
  longitude: number;
  upcoming_events_count: number;
  metro_id?: string;
  metro_name?: string;
}

export interface JamBaseCitiesResponse {
  success: boolean;
  cities: JamBaseCity[];
  total: number;
  page: number;
  perPage: number;
}

export interface CitySearchParams {
  geoCityName?: string;
  geoCountryIso2?: string;
  geoStateIso?: string;
  geoLatitude?: number;
  geoLongitude?: number;
  geoRadiusAmount?: number;
  geoRadiusUnits?: 'mi' | 'km';
  cityHasUpcomingEvents?: boolean;
  page?: number;
  perPage?: number;
}

export class JamBaseCitiesService {
  // JamBase Cities API is disabled due to expired API key. Stubbed to avoid external calls.
  private static readonly JAMBASE_BASE_URL = 'https://www.jambase.com/jb-api/v1';
  private static readonly API_KEY = '';

  /**
   * Search for cities using JamBase cities API
   */
  static async searchCities(params: CitySearchParams): Promise<JamBaseCitiesResponse> {
    console.warn('JamBase Cities API disabled: using stubbed empty response');
    return {
      success: true,
      cities: [],
      total: 0,
      page: 1,
      perPage: params.perPage ?? 40
    };
  }

  /**
   * Search for cities by name
   */
  static async searchCitiesByName(cityName: string, countryCode: string = 'US'): Promise<JamBaseCity[]> {
    const result = await this.searchCities({
      geoCityName: cityName,
      geoCountryIso2: countryCode,
      cityHasUpcomingEvents: true,
      perPage: 20
    });

    return result.cities;
  }

  /**
   * Search for cities by coordinates
   */
  static async searchCitiesByCoordinates(
    latitude: number, 
    longitude: number, 
    radius: number = 100, 
    radiusUnits: 'mi' | 'km' = 'mi'
  ): Promise<JamBaseCity[]> {
    const result = await this.searchCities({
      geoLatitude: latitude,
      geoLongitude: longitude,
      geoRadiusAmount: radius,
      geoRadiusUnits: radiusUnits,
      cityHasUpcomingEvents: true,
      perPage: 50
    });

    return result.cities;
  }

  /**
   * Search for cities by state
   */
  static async searchCitiesByState(stateCode: string, countryCode: string = 'US'): Promise<JamBaseCity[]> {
    const result = await this.searchCities({
      geoStateIso: `${countryCode}-${stateCode}`,
      cityHasUpcomingEvents: true,
      perPage: 100
    });

    return result.cities;
  }

  /**
   * Get top cities with most upcoming events
   */
  static async getTopCities(countryCode: string = 'US', limit: number = 50): Promise<JamBaseCity[]> {
    const result = await this.searchCities({
      geoCountryIso2: countryCode,
      cityHasUpcomingEvents: true,
      perPage: limit
    });

    return result.cities;
  }

  /**
   * Store cities in Supabase database
   */
  static async storeCitiesInSupabase(cities: JamBaseCity[]): Promise<void> {
    if (!cities || cities.length === 0) {
      return;
    }
    
    try {
      console.log(`💾 Storing ${cities.length} cities in Supabase...`);
      
      // Transform cities to database format
      const citiesToStore = cities.map(city => ({
        jambase_city_id: city.id,
        name: city.name,
        state: city.state,
        country: city.country,
        latitude: city.latitude,
        longitude: city.longitude,
        upcoming_events_count: city.upcoming_events_count,
        metro_id: city.metro_id,
        metro_name: city.metro_name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
      
      // Use upsert to avoid duplicates
      const { error } = await supabase
        .from('jambase_cities')
        .upsert(citiesToStore, {
          onConflict: 'jambase_city_id'
        });
      
      if (error) {
        console.error('❌ Error storing cities in Supabase:', error);
        throw error;
      }
      
      console.log(`✅ Successfully stored ${cities.length} cities in Supabase`);
      
    } catch (error) {
      console.error('❌ Error in storeCitiesInSupabase:', error);
      throw error;
    }
  }
}
