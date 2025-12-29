import { supabase } from '@/integrations/supabase/client';
import type { PersonalizedEvent } from './personalizedFeedService';

export interface PreferencesV4FeedFilters {
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  includePast?: boolean;
  maxDaysAhead?: number;
  genres?: string[]; // Genre filters (will be applied client-side for now)
  dateRange?: {
    from?: Date;
    to?: Date;
  };
  radiusMiles?: number; // Radius in miles for distance-based filtering
}

export interface PreferencesV4FeedResult {
  events: PersonalizedEvent[];
  hasMore: boolean;
  totalCount?: number;
}

/**
 * Preferences V4 Feed Service
 * Uses the new user_preferences BCNF schema for recommendations
 */
export class PreferencesV4FeedService {
  /**
   * Get personalized event feed v4 using user_preferences table
   */
  static async getFeed(
    userId: string,
    limit: number = 20,
    offset: number = 0,
    filters?: PreferencesV4FeedFilters,
    skipFollowing: boolean = false  // When true, skip following-first logic (for refresh)
  ): Promise<PreferencesV4FeedResult> {
    try {
      console.log('🎯 PreferencesV4Feed: Fetching feed for user:', userId, {
        limit,
        offset,
        filters,
        skipFollowing,
      });

      // Use city name for backend filtering (prioritize city over lat/lng)
      // Only use lat/lng coordinates if no city name is provided
      let cityFilter = filters?.city ?? null;
      
      // If we have lat/lng but no city, reverse geocode to get city name
      // This ensures the backend does the bulk of the location filtering
      if (filters?.latitude && filters?.longitude && !cityFilter) {
        try {
          const { LocationService } = await import('@/services/locationService');
          const cityName = await LocationService.reverseGeocode(
            filters.latitude,
            filters.longitude
          );
          if (cityName) {
            // Extract just the city name (remove state if present)
            cityFilter = cityName.split(',')[0].trim();
            console.log(`📍 Reverse geocoded ${filters.latitude},${filters.longitude} to city: ${cityFilter}`);
          }
        } catch (error) {
          console.error('Error reverse geocoding for feed filter:', error);
        }
      }

      const { data, error } = await supabase.rpc('get_preferences_v4_feed', {
        p_user_id: userId,
        p_limit: limit,
        p_offset: offset,
        p_include_past: filters?.includePast ?? false,
        p_city_filter: cityFilter,
        p_state_filter: filters?.state ?? null,
        p_max_days_ahead: filters?.maxDaysAhead ?? 90,
        p_skip_following: skipFollowing,
        p_radius_miles: filters?.radiusMiles ?? null,
      });

      if (error) {
        console.error('❌ PreferencesV4Feed: Error fetching feed:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.log('📭 PreferencesV4Feed: No events found');
        return {
          events: [],
          hasMore: false,
        };
      }

      // Transform to PersonalizedEvent format
      let events: PersonalizedEvent[] = data.map((row: any) => ({
        id: row.event_id,
        jambase_event_id: row.jambase_event_id,
        title: row.title || row.artist_name || 'Event',
        artist_name: row.artist_name || 'Unknown Artist',
        artist_id: row.artist_id,
        venue_name: row.venue_name || 'Unknown Venue',
        venue_id: row.venue_id,
        event_date: row.event_date,
        doors_time: row.doors_time,
        description: row.description,
        genres: row.genres || [],
        venue_address: row.venue_address,
        venue_city: row.venue_city,
        venue_state: row.venue_state,
        venue_zip: row.venue_zip,
        latitude: row.latitude ? Number(row.latitude) : null,
        longitude: row.longitude ? Number(row.longitude) : null,
        ticket_available: row.ticket_available ?? true,
        price_range: row.price_range,
        ticket_urls: row.ticket_urls || [],
        setlist: row.setlist,
        setlist_enriched: row.setlist_enriched,
        setlist_song_count: row.setlist_song_count,
        setlist_fm_id: row.setlist_fm_id,
        setlist_fm_url: row.setlist_fm_url,
        setlist_source: row.setlist_source,
        setlist_last_updated: row.setlist_last_updated,
        tour_name: row.tour_name,
        poster_image_url: row.event_media_url || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        // V4 specific fields
        relevance_score: row.relevance_score ? Number(row.relevance_score) : undefined,
        user_is_interested: row.user_is_interested ?? false,
        interested_count: row.interested_count ?? 0,
        friends_interested_count: row.friends_interested_count ?? 0,
        // Recommendation reason fields
        recommendation_reason: row.recommendation_reason || undefined,
        recommendation_context: row.recommendation_context || undefined,
      }));

      // Apply client-side genre filtering if specified
      if (filters?.genres && filters.genres.length > 0) {
        events = events.filter(event => {
          const eventGenres = event.genres || [];
          return filters.genres!.some(genre => 
            eventGenres.some((eventGenre: string) => 
              eventGenre.toLowerCase().includes(genre.toLowerCase()) ||
              genre.toLowerCase().includes(eventGenre.toLowerCase())
            )
          );
        });
      }

      // Apply date range filtering if specified
      if (filters?.dateRange) {
        const { from, to } = filters.dateRange;
        if (from || to) {
          events = events.filter(event => {
            if (!event.event_date) return false;
            const eventDate = new Date(event.event_date);
            if (from && eventDate < from) return false;
            if (to) {
              const toDate = new Date(to);
              toDate.setHours(23, 59, 59, 999); // Include the entire end date
              if (eventDate > toDate) return false;
            }
            return true;
          });
        }
      }

      // Apply fine-grained client-side location filtering by lat/long/radius if specified
      // This is used to refine the results from city-based backend filtering
      // Only filter if we have lat/lng and the radius is less than 50 miles (city-based filtering should cover larger areas)
      if (filters?.latitude && filters?.longitude && filters?.radiusMiles && filters.radiusMiles < 50) {
        const { filterEventsByRadius } = await import('@/utils/distanceUtils');
        const beforeCount = events.length;
        events = filterEventsByRadius(
          events,
          filters.latitude,
          filters.longitude,
          filters.radiusMiles
        );
        console.log(`📍 Client-side radius filter: ${beforeCount} -> ${events.length} events (${filters.radiusMiles}mi radius)`);
      }

      // Determine if there are more results
      // Use the filtered count to determine hasMore more accurately
      const hasMore = data.length === limit && events.length > 0;

      console.log(`✅ PreferencesV4Feed: Found ${events.length} events`, {
        hasMore,
        avgScore: events.length > 0
          ? events.reduce((sum, e) => sum + (e.relevance_score || 0), 0) / events.length
          : 0,
      });

      return {
        events,
        hasMore,
      };
    } catch (error) {
      console.error('❌ PreferencesV4Feed: Error in getFeed:', error);
      return {
        events: [],
        hasMore: false,
      };
    }
  }

  /**
   * Get feed with pagination support
   */
  static async getFeedPaginated(
    userId: string,
    page: number = 0,
    pageSize: number = 20,
    filters?: PreferencesV4FeedFilters,
    skipFollowing: boolean = false
  ): Promise<PreferencesV4FeedResult> {
    const offset = page * pageSize;
    return this.getFeed(userId, pageSize, offset, filters, skipFollowing);
  }
}

