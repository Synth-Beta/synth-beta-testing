import { supabase } from '@/integrations/supabase/client';
import { JamBaseEventResponse } from './jambaseEventsService';
import { LocationService, LocationSearchParams } from './locationService';
import { JamBaseCitiesService, JamBaseCity } from './jambaseCitiesService';

export interface LocationEventSearchResult {
  events: JamBaseEventResponse[];
  total: number;
  location: {
    name: string;
    lat: number;
    lng: number;
    radius: number;
  };
  source: 'jambase' | 'database' | 'fallback';
}

export class JamBaseLocationService {
  private static readonly JAMBASE_API_KEY = import.meta.env.VITE_JAMBASE_API_KEY;
  private static readonly BACKEND_BASE_URL = (
    import.meta.env.VITE_BACKEND_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '')
  );
  
  /**
   * Search for events by location using JamBase API and store results in Supabase
   */
  static async searchEventsByLocation(
    location: string | { lat: number; lng: number } | { latitude: number; longitude: number },
    radius: number = 25,
    limit: number = 50
  ): Promise<LocationEventSearchResult> {
    try {
      console.log('🔍 Searching for events by location:', location, 'radius:', radius);
      
      // Determine search coordinates
      let searchCoords: { lat: number; lng: number };
      let locationName: string;
      
      if (typeof location === 'string') {
        // Search by city name
        const cityCoords = LocationService.searchCity(location);
        if (!cityCoords) {
          throw new Error(`City "${location}" not found`);
        }
        searchCoords = { lat: cityCoords.lat, lng: cityCoords.lng };
        locationName = cityCoords.name;
      } else {
        // Use provided coordinates - handle both lat/lng and latitude/longitude formats
        if (location.lat !== undefined && location.lng !== undefined) {
          searchCoords = { lat: location.lat, lng: location.lng };
          locationName = `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
        } else if (location.latitude !== undefined && location.longitude !== undefined) {
          searchCoords = { lat: location.latitude, lng: location.longitude };
          locationName = `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
        } else {
          throw new Error('Invalid location format. Expected {lat, lng} or {latitude, longitude}');
        }
      }
      
      // Try backend API first (which calls JamBase API)
      try {
        console.log('📡 Calling backend API for location-based events...');
        const backendResult = await this.callBackendLocationAPI(location, radius, limit);
        
        if (backendResult.success && backendResult.events.length > 0) {
          console.log(`✅ Found ${backendResult.events.length} events from backend API (${backendResult.source})`);
          
          // Store events in Supabase if they came from JamBase API
          if (backendResult.source === 'jambase') {
            try {
              await this.storeEventsInSupabase(backendResult.events);
              console.log('💾 Events stored in Supabase database');
            } catch (storeError) {
              console.warn('⚠️ Failed to store events in Supabase:', storeError);
              // Continue even if storage fails
            }
          }
          
          return {
            events: backendResult.events,
            total: backendResult.total,
            location: backendResult.location,
            source: backendResult.source
          };
        }
      } catch (apiError) {
        console.warn('⚠️ Backend API failed, trying database fallback:', apiError);
      }
      
      // Fallback to database search
      console.log('🗄️ Searching database for events near location...');
      const dbEvents = await LocationService.searchEventsByLocation({
        latitude: searchCoords.lat,
        longitude: searchCoords.lng,
        radius,
        limit
      });
      
      if (dbEvents.length > 0) {
        console.log(`✅ Found ${dbEvents.length} events from database`);
        return {
          events: dbEvents,
          total: dbEvents.length,
          location: {
            name: locationName,
            lat: searchCoords.lat,
            lng: searchCoords.lng,
            radius
          },
          source: 'database'
        };
      }
      
      // Final fallback - return empty results
      console.log('📭 No events found in API or database');
      return {
        events: [],
        total: 0,
        location: {
          name: locationName,
          lat: searchCoords.lat,
          lng: searchCoords.lng,
          radius
        },
        source: 'fallback'
      };
      
    } catch (error) {
      console.error('❌ Error searching events by location:', error);
      throw new Error(`Failed to search events by location: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Call backend API for location-based event search
   */
  private static async callBackendLocationAPI(
    location: string | { lat: number; lng: number } | { latitude: number; longitude: number },
    radius: number,
    limit: number
  ): Promise<{
    success: boolean;
    events: JamBaseEventResponse[];
    total: number;
    location: { name: string; lat: number; lng: number; radius: number };
    source: 'jambase' | 'database' | 'fallback';
  }> {
    try {
      // Convert location format for backend API
      let apiLocation = location;
      if (typeof location === 'object' && location.latitude !== undefined && location.longitude !== undefined) {
        apiLocation = { lat: location.latitude, lng: location.longitude };
      }
      
      const response = await fetch(`${this.BACKEND_BASE_URL}/api/jambase/location-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          location: apiLocation,
          radius,
          limit
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Backend API error:', response.status, response.statusText, errorText);
        throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Backend API returned unsuccessful response');
      }

      return data;
      
    } catch (error) {
      console.error('❌ Backend API location search error:', error);
      throw error;
    }
  }
  
  /**
   * Store JamBase events in Supabase database
   */
  private static async storeEventsInSupabase(events: JamBaseEventResponse[]): Promise<void> {
    if (!events || events.length === 0) {
      return;
    }
    
    try {
      console.log(`💾 Storing ${events.length} events in Supabase...`);
      
      // Transform events to database format
      const eventsToStore = events.map(event => ({
        jambase_event_id: event.jambase_event_id || event.id,
        title: event.title,
        artist_name: event.artist_name,
        artist_id: event.artist_id,
        venue_name: event.venue_name,
        venue_id: event.venue_id,
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
      }));
      
      // Use individual inserts to avoid ON CONFLICT issues
      for (const event of eventsToStore) {
        try {
          // Check if event already exists
          const { data: existing } = await supabase
            .from('events')
            .select('id')
            .eq('jambase_event_id', event.jambase_event_id)
            .single();
          
          if (!existing) {
            // Insert new event
            const { error: insertError } = await supabase
              .from('events')
              .insert(event);
            
            if (insertError) {
              console.error('❌ Error inserting event:', insertError);
            }
          }
        } catch (error) {
          console.error('❌ Error processing event:', error);
        }
      }
      
      console.log(`✅ Successfully processed ${events.length} events in Supabase`);
      
    } catch (error) {
      console.error('❌ Error in storeEventsInSupabase:', error);
      throw error;
    }
  }
  
  /**
   * Search for events when user's location is detected
   */
  static async searchEventsForUserLocation(
    userCoords: { latitude: number; longitude: number },
    radius: number = 25
  ): Promise<LocationEventSearchResult> {
    return this.searchEventsByLocation(userCoords, radius, 50);
  }
  
  /**
   * Search for events when user enters a location
   */
  static async searchEventsForLocationInput(
    locationInput: string,
    radius: number = 25
  ): Promise<LocationEventSearchResult> {
    return this.searchEventsByLocation(locationInput, radius, 50);
  }

  /**
   * Automatically fetch and store events for a user's location
   * This method is called when the user's location is detected
   */
  static async autoFetchEventsForUserLocation(
    userCoords: { latitude: number; longitude: number },
    radius: number = 25
  ): Promise<LocationEventSearchResult> {
    try {
      console.log('🔄 Auto-fetching events for user location...');
      
      // First try to get fresh events from JamBase API
      const result = await this.searchEventsByLocation(userCoords, radius, 50);
      
      // If we got events from JamBase API, they're already stored in Supabase
      if (result.source === 'jambase' && result.events.length > 0) {
        console.log(`✅ Auto-fetched ${result.events.length} events from JamBase API`);
        return result;
      }
      
      // If we got events from database, that's fine too
      if (result.events.length > 0) {
        console.log(`✅ Found ${result.events.length} existing events in database`);
        return result;
      }
      
      // If no events found, return empty result
      console.log('📭 No events found for user location');
      return result;
      
    } catch (error) {
      console.error('❌ Error auto-fetching events for user location:', error);
      throw error;
    }
  }

  /**
   * Refresh events for a specific location (useful for periodic updates)
   */
  static async refreshEventsForLocation(
    location: string | { lat: number; lng: number } | { latitude: number; longitude: number },
    radius: number = 25
  ): Promise<LocationEventSearchResult> {
    try {
      console.log('🔄 Refreshing events for location...');
      
      // Force a fresh search from JamBase API
      const result = await this.searchEventsByLocation(location, radius, 50);
      
      if (result.events.length > 0) {
        console.log(`✅ Refreshed ${result.events.length} events for location`);
      } else {
        console.log('📭 No events found after refresh');
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Error refreshing events for location:', error);
      throw error;
    }
  }

  /**
   * Search for cities near a location and get events for those cities
   */
  static async searchEventsViaCities(
    location: string | { lat: number; lng: number } | { latitude: number; longitude: number },
    radius: number = 100
  ): Promise<LocationEventSearchResult> {
    try {
      console.log('🏙️ Searching for cities near location...');
      
      let searchCoords: { lat: number; lng: number };
      let locationName: string;
      
      if (typeof location === 'string') {
        // Search by city name
        const cityCoords = LocationService.searchCity(location);
        if (!cityCoords) {
          throw new Error(`City "${location}" not found`);
        }
        searchCoords = { lat: cityCoords.lat, lng: cityCoords.lng };
        locationName = cityCoords.name;
      } else {
        // Use provided coordinates - handle both lat/lng and latitude/longitude formats
        if (location.lat !== undefined && location.lng !== undefined) {
          searchCoords = { lat: location.lat, lng: location.lng };
          locationName = `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
        } else if (location.latitude !== undefined && location.longitude !== undefined) {
          searchCoords = { lat: location.latitude, lng: location.longitude };
          locationName = `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
        } else {
          throw new Error('Invalid location format. Expected {lat, lng} or {latitude, longitude}');
        }
      }

      // Search for cities near the location
      const cities = await JamBaseCitiesService.searchCitiesByCoordinates(
        searchCoords.lat,
        searchCoords.lng,
        radius,
        'mi'
      );

      if (cities.length === 0) {
        console.log('📭 No cities found near location');
        return {
          events: [],
          total: 0,
          location: {
            name: locationName,
            lat: searchCoords.lat,
            lng: searchCoords.lng,
            radius
          },
          source: 'fallback'
        };
      }

      console.log(`✅ Found ${cities.length} cities near location`);

      // Store cities in Supabase
      try {
        await JamBaseCitiesService.storeCitiesInSupabase(cities);
        console.log('💾 Cities stored in Supabase');
      } catch (storeError) {
        console.warn('⚠️ Failed to store cities in Supabase:', storeError);
      }

      // Get events for the top cities (those with most upcoming events)
      const topCities = cities
        .filter(city => city.upcoming_events_count > 0)
        .sort((a, b) => b.upcoming_events_count - a.upcoming_events_count)
        .slice(0, 5); // Get top 5 cities

      if (topCities.length === 0) {
        console.log('📭 No cities with upcoming events found');
        return {
          events: [],
          total: 0,
          location: {
            name: locationName,
            lat: searchCoords.lat,
            lng: searchCoords.lng,
            radius
          },
          source: 'fallback'
        };
      }

      console.log(`🎵 Getting events for top ${topCities.length} cities`);

      // Get events for each city
      let allEvents: JamBaseEventResponse[] = [];
      for (const city of topCities) {
        try {
          const cityEvents = await this.searchEventsByLocation(
            { lat: city.latitude, lng: city.longitude },
            25, // 25 mile radius around each city
            20  // Limit events per city
          );
          
          if (cityEvents.events.length > 0) {
            allEvents = allEvents.concat(cityEvents.events);
            console.log(`✅ Found ${cityEvents.events.length} events in ${city.name}`);
          }
        } catch (cityError) {
          console.warn(`⚠️ Failed to get events for ${city.name}:`, cityError);
        }
      }

      // Remove duplicates based on event ID
      const uniqueEvents = allEvents.filter((event, index, self) => 
        index === self.findIndex(e => e.jambase_event_id === event.jambase_event_id)
      );

      console.log(`✅ Found ${uniqueEvents.length} unique events across ${topCities.length} cities`);

      return {
        events: uniqueEvents,
        total: uniqueEvents.length,
        location: {
          name: locationName,
          lat: searchCoords.lat,
          lng: searchCoords.lng,
          radius
        },
        source: 'jambase'
      };

    } catch (error) {
      console.error('❌ Error searching events via cities:', error);
      throw error;
    }
  }
}
