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
  private static readonly JAMBASE_BASE_URL = 'https://www.jambase.com/jb-api/v1';
  private static readonly API_KEY = import.meta.env.VITE_JAMBASE_API_KEY || 'e7ed3a9b-e73a-446e-b7c6-a96d1c53a030';

  /**
   * Search for cities using JamBase cities API
   */
  static async searchCities(params: CitySearchParams): Promise<JamBaseCitiesResponse> {
    try {
      console.log('🔍 Searching cities with params:', params);

      // Build search parameters
      const searchParams = new URLSearchParams();
      
      if (params.geoCityName) searchParams.append('geoCityName', params.geoCityName);
      if (params.geoCountryIso2) searchParams.append('geoCountryIso2', params.geoCountryIso2);
      if (params.geoStateIso) searchParams.append('geoStateIso', params.geoStateIso);
      if (params.geoLatitude !== undefined) searchParams.append('geoLatitude', params.geoLatitude.toString());
      if (params.geoLongitude !== undefined) searchParams.append('geoLongitude', params.geoLongitude.toString());
      if (params.geoRadiusAmount !== undefined) searchParams.append('geoRadiusAmount', params.geoRadiusAmount.toString());
      if (params.geoRadiusUnits) searchParams.append('geoRadiusUnits', params.geoRadiusUnits);
      if (params.cityHasUpcomingEvents !== undefined) searchParams.append('cityHasUpcomingEvents', params.cityHasUpcomingEvents.toString());
      if (params.page) searchParams.append('page', params.page.toString());
      if (params.perPage) searchParams.append('perPage', params.perPage.toString());

      // Add API key
      searchParams.append('apikey', this.API_KEY);

      const finalUrl = `${this.JAMBASE_BASE_URL}/geographies/cities?${searchParams.toString()}`;
      console.log('📡 JamBase cities API URL:', finalUrl);

      const response = await fetch(finalUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'PlusOneEventCrew/1.0'
        }
      });

      console.log('📡 JamBase cities API response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('JamBase cities API error:', response.status, response.statusText, errorText);
        throw new Error(`JamBase cities API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('📊 JamBase cities API response data:', { 
        success: data.success, 
        cityCount: data.cities?.length,
        total: data.total 
      });

      if (!data.success || !data.cities || !Array.isArray(data.cities)) {
        console.warn('Invalid JamBase cities API response format:', data);
        return {
          success: false,
          cities: [],
          total: 0,
          page: 1,
          perPage: 40
        };
      }

      // Transform cities to our format
      const transformedCities: JamBaseCity[] = data.cities.map((city: any) => ({
        id: city.identifier?.replace('jambase:', '') || city.id || `city-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: city.name || 'Unknown City',
        state: city.state?.name || city.state,
        country: city.country?.name || city.country || 'Unknown',
        latitude: city.geo?.latitude || city.latitude || 0,
        longitude: city.geo?.longitude || city.longitude || 0,
        upcoming_events_count: city.upcomingEventsCount || city.upcoming_events_count || 0,
        metro_id: city.metro?.identifier || city.metro_id,
        metro_name: city.metro?.name || city.metro_name
      }));

      return {
        success: true,
        cities: transformedCities,
        total: data.total || transformedCities.length,
        page: data.page || 1,
        perPage: data.perPage || 40
      };

    } catch (error) {
      console.error('❌ JamBase cities search error:', error);
      return {
        success: false,
        cities: [],
        total: 0,
        page: 1,
        perPage: 40
      };
    }
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
