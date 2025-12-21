import { supabase } from '@/integrations/supabase/client';
import { normalizeCityName } from '@/utils/cityNormalization';
import type { JamBaseEvent } from './jambaseEventsService';
import { cacheService, CacheTTL } from './cacheService';
import { logger } from '@/utils/logger';

/**
 * Row returned by the Supabase personalized feed RPC.
 * Keep this in sync with the Supabase function definition.
 */
type PersonalizedFeedRow = {
  event_id: string;
  title: string | null;
  artist_name: string | null;
  artist_id?: string | null;
  artist_uuid?: string | null;
  venue_name: string | null;
  venue_id?: string | null;
  venue_uuid?: string | null;
  venue_city: string | null;
  venue_state?: string | null;
  venue_address?: string | null;
  venue_zip?: string | null;
  event_date: string;
  doors_time?: string | null;
  description?: string | null;
  genres: string[] | null;
  latitude: number | string | null;
  longitude: number | string | null;
  ticket_urls: string[] | null;
  ticket_available?: boolean | null;
  price_range: string | null;
  ticket_price_min?: number | string | null;
  ticket_price_max?: number | string | null;
  relevance_score: number | null;
  friend_interest_count: number | null;
  total_interest_count: number | null;
  is_promoted: boolean | null;
  promotion_tier: string | null;
  distance_miles: number | string | null;
  poster_image_url: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export interface PersonalizedEvent extends JamBaseEvent {
  relevance_score?: number;
  user_is_interested?: boolean;
  interested_count?: number;
  friends_interested_count?: number;
  distance_miles?: number | null;
  poster_image_url?: string | null;
}

export interface UserMusicProfile {
  user_id: string;
  top_genres: Array<{ genre: string; score: number; count: number }>;
  top_artists: Array<{ artist: string; score: number; count: number }>;
  total_artist_interactions: number;
  total_song_interactions: number;
  total_genre_interactions: number;
  artists_followed: number;
  events_interested: number;
  reviews_written: number;
  has_streaming_data: boolean;
}

export interface PersonalizedFeedFilters {
  genres?: string[];
  selectedCities?: string[];
  dateRange?: { from?: Date; to?: Date };
  daysOfWeek?: number[];
  filterByFollowing?: 'all' | 'following';
  radiusMiles?: number;
  city?: string;
}

// V3 Feed Types
export type FeedItemType = 'event' | 'review' | 'friend_suggestion' | 'group_chat';

export interface FeedItem {
  id: string;
  type: FeedItemType;
  score: number;
  payload: Record<string, any>;
  context: {
    because?: string[];
    author?: string;
    event?: string;
    [key: string]: any;
  };
  created_at: string;
}

export interface UnifiedFeedResponse {
  items: FeedItem[];
  has_more: boolean;
}

const DEFAULT_RADIUS_MILES = 50;
const EARLIEST_DATE = new Date(0).toISOString();

type NormalizedFilters = {
  genres?: string[];
  cleanedCities?: string[];
  originalCities: string[];
  city: string | null;
  cityCoordinates?: { lat: number; lng: number } | null; // City center coordinates for radius filtering
  radiusMiles: number;
  dateStartIso?: string;
  dateEndIso?: string;
  dateStart?: Date;
  dateEnd?: Date;
  daysOfWeek?: number[];
  followingOnly: boolean;
  debugSummary: {
    city: string | null;
    radius: number;
    genres: number;
    citiesSelected: number;
    daysOfWeek: number;
    followingOnly: boolean;
  };
};

export class PersonalizedFeedService {
  /**
   * Fetch unified personalized feed v3 (events, reviews, friend suggestions, group chats)
   * Uses the new unified feed structure with multiple content types
   */
  static async getPersonalizedFeedV3(
    userId: string,
    limit: number = 50,
    offset: number = 0,
    filters?: PersonalizedFeedFilters
  ): Promise<UnifiedFeedResponse> {
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const normalizedFilters = await this.normalizeFilters(filters);

    const rpcPayload = {
      p_user_id: userId,
      p_limit: limit,
      p_offset: offset,
      p_city_lat: normalizedFilters.cityCoordinates?.lat ?? null,
      p_city_lng: normalizedFilters.cityCoordinates?.lng ?? null,
      p_radius_miles: normalizedFilters.radiusMiles,
    };

    try {
      console.log('📡 Calling get_personalized_feed_v3 with payload:', rpcPayload);
      const { data, error } = await supabase.rpc('get_personalized_feed_v3', rpcPayload);
      
      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST204' || error.code === 'PGRST116' || error.message?.includes('does not exist')) {
          console.warn('⚠️ get_personalized_feed_v3 RPC function not found');
          throw error;
        }
        console.error('❌ get_personalized_feed_v3 error:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          error,
        });
        throw error;
      }

      const items: FeedItem[] = (data ?? []).map((row: any) => ({
        id: String(row.id),
        type: row.type as FeedItemType,
        score: Number(row.score) || 0,
        payload: row.payload || {},
        context: row.context || {},
        created_at: row.created_at || new Date().toISOString(),
      }));

      const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const duration = finishedAt - startedAt;

      console.log('✅ Unified feed v3 (RPC):', {
        userId,
        itemCount: items.length,
        types: items.reduce((acc, item) => {
          acc[item.type] = (acc[item.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        loadTimeMs: Math.round(duration),
      });

      return {
        items,
        has_more: items.length === limit, // Simple heuristic - could be improved
      };
    } catch (rpcException) {
      console.error('❌ get_personalized_feed_v3 exception:', rpcException);
      throw rpcException;
    }
  }

  /**
   * Fetch personalized events using the new Supabase RPC.
   * Falls back to a basic query if the RPC fails.
   * This is the v2 method - kept for backwards compatibility.
   */
  static async getPersonalizedFeed(
    userId: string,
    limit: number = 50,
    offset: number = 0,
    includePast: boolean = false,
    filters?: PersonalizedFeedFilters
  ): Promise<PersonalizedEvent[]> {
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const normalizedFilters = await this.normalizeFilters(filters);

    // Create cache key based on all parameters (only cache first page)
    const shouldCache = offset === 0 && !includePast;
    const cacheKey = shouldCache 
      ? `personalized_feed_${userId}_${limit}_${normalizedFilters.cityCoordinates?.lat}_${normalizedFilters.cityCoordinates?.lng}_${normalizedFilters.genres?.join(',')}_${normalizedFilters.followingOnly}`
      : null;

      // Check cache first (only for first page)
      if (shouldCache && cacheKey) {
        const cached = cacheService.get<PersonalizedEvent[]>(cacheKey);
        if (cached) {
          logger.log('✅ Personalized feed (cached):', { count: cached.length, userId });
          return cached;
        }
      }

    const rpcPayload = {
        p_user_id: userId,
        p_limit: limit,
        p_offset: offset,
      p_include_past: includePast,
      p_city_lat: normalizedFilters.cityCoordinates?.lat ?? null,
      p_city_lng: normalizedFilters.cityCoordinates?.lng ?? null,
      p_radius_miles: normalizedFilters.radiusMiles,
      p_genres: normalizedFilters.genres ?? null,
      p_following_only: normalizedFilters.followingOnly,
    };

    try {
      const { data, error } = await supabase.rpc('get_personalized_feed_v2', rpcPayload);
      
      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST204' || error.code === 'PGRST116' || error.message?.includes('does not exist')) {
          logger.warn('⚠️ get_personalized_feed_v2 RPC function not found, using fallback feed');
          return this.getFallbackFeed(userId, limit, offset, includePast, normalizedFilters);
        }
        logger.error('❌ get_personalized_feed_v2 error:', error);
        return this.getFallbackFeed(userId, limit, offset, includePast, normalizedFilters);
      }

      const rows = (data ?? []).map((row: any) => this.mapRpcRowToFeedRow(row));
      
      logger.debug('📊 RPC response before client-side filtering:', {
        rawDataCount: data?.length ?? 0,
        mappedRowsCount: rows.length,
        sampleRow: rows[0] ? {
          title: rows[0].title,
          venue_city: rows[0].venue_city,
          event_date: rows[0].event_date,
        } : null,
        filters: normalizedFilters.debugSummary,
      });
      
      const filteredRows = this.applyClientSideFilters(rows, normalizedFilters, includePast);
      
      logger.debug('📊 After client-side filtering:', {
        filteredCount: filteredRows.length,
        removedCount: rows.length - filteredRows.length,
      });
      
      const events = filteredRows.map((row) => this.mapRowToEvent(row));

      if (filteredRows.length === 0 && offset === 0) {
        logger.warn('⚠️ RPC returned no events at offset 0 – falling back to basic feed.', {
          rawDataCount: data?.length ?? 0,
          mappedRowsCount: rows.length,
          filteredCount: filteredRows.length,
        });
        return this.getFallbackFeed(userId, limit, offset, includePast, normalizedFilters);
      }

      const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const duration = finishedAt - startedAt;

      // Cache the result (only for first page)
      if (shouldCache && cacheKey) {
        cacheService.set(cacheKey, events, CacheTTL.REVIEWS); // Use 3 min TTL (same as reviews)
      }

      logger.log('✅ Personalized feed (RPC):', {
        userId,
        count: events.length,
        limit,
        offset,
        loadTimeMs: Math.round(duration),
        cached: shouldCache && !!cacheKey,
      });

      return events;
    } catch (rpcException) {
      logger.error('❌ get_personalized_feed_v2 exception:', rpcException);
      return this.getFallbackFeed(userId, limit, offset, includePast, normalizedFilters);
    }
  }
  
  /**
   * Fallback: minimal non-personalized feed if the RPC fails.
   */
  private static async getFallbackFeed(
    userId: string,
    limit: number,
    offset: number,
    includePast: boolean,
    filters: NormalizedFilters
  ): Promise<PersonalizedEvent[]> {
    logger.warn('⚠️ Falling back to basic feed query (RPC unavailable).');
      
    try {
      let query = supabase
        .from('events')
        .select('*')
        .order('event_date', { ascending: true })
        .range(offset, offset + limit - 1);
      
      if (!includePast) {
        query = query.gte('event_date', new Date().toISOString());
      }
      
      if (filters.genres?.length) {
          query = query.overlaps('genres', filters.genres);
        }
      
      // Add city filtering to fallback feed
      if (filters.cleanedCities && filters.cleanedCities.length > 0) {
        // Filter by city names - try multiple variations for Washington DC, etc.
        const cityFilters: string[] = [];
        filters.cleanedCities.forEach((city) => {
          cityFilters.push(`venue_city.ilike.%${city}%`);
          // Handle Washington DC variations
          if (city.includes('washington') || city.includes('district')) {
            cityFilters.push(`venue_city.ilike.%Washington%`);
            cityFilters.push(`venue_city.ilike.%DC%`);
            cityFilters.push(`venue_city.ilike.%D.C%`);
          }
        });
        if (cityFilters.length > 0) {
          query = query.or(cityFilters.join(','));
        }
      } else if (filters.originalCities && filters.originalCities.length > 0) {
        // Fallback to original city names if cleaned cities aren't available
        const cityFilters: string[] = [];
        filters.originalCities.forEach((city) => {
          const cleanCity = city.split(',')[0]?.trim();
          if (cleanCity) {
            cityFilters.push(`venue_city.ilike.%${cleanCity}%`);
          }
        });
        if (cityFilters.length > 0) {
          query = query.or(cityFilters.join(','));
        }
      }
        
      if (filters.dateStartIso) {
        query = query.gte('event_date', filters.dateStartIso);
      }

      if (filters.dateEndIso) {
        query = query.lte('event_date', filters.dateEndIso);
      }

      const { data, error } = await query;
      
      if (error) {
        logger.error('❌ Fallback feed query error:', error);
        return [];
      }
      
      let rows = (data ?? []).map<PersonalizedFeedRow>((event: any) => ({
        event_id: event.id,
        title: event.title,
        artist_name: event.artist_name,
        artist_id: event.artist_id,
        artist_uuid: event.artist_uuid ?? null,
        venue_name: event.venue_name,
        venue_id: event.venue_id,
        venue_city: event.venue_city,
        venue_state: event.venue_state,
        venue_address: event.venue_address,
        venue_zip: event.venue_zip,
        event_date: event.event_date,
        doors_time: event.doors_time,
        description: event.description,
        genres: event.genres,
        latitude: event.latitude,
        longitude: event.longitude,
        ticket_urls: event.ticket_urls,
        ticket_available: event.ticket_available,
        price_range: event.price_range,
        ticket_price_min: event.ticket_price_min ?? event.price_min,
        ticket_price_max: event.ticket_price_max ?? event.price_max,
              relevance_score: 0,
        friend_interest_count: 0,
        total_interest_count: 0,
        is_promoted: event.is_promoted ?? false,
        promotion_tier: event.promotion_tier ?? null,
        distance_miles: null,
        poster_image_url: event.poster_image_url ?? null,
        created_at: event.created_at,
        updated_at: event.updated_at,
      }));

      if (filters.cityCoordinates?.lat !== undefined && filters.cityCoordinates?.lng !== undefined) {
        const { lat, lng } = filters.cityCoordinates;
        const radiusMiles = filters.radiusMiles ?? DEFAULT_RADIUS_MILES;

        rows = rows
          .map((row) => {
            if (row.latitude == null || row.longitude == null) {
              return row;
            }

            const distance = this.calculateDistanceMiles(
              typeof row.latitude === 'string' ? Number(row.latitude) : row.latitude,
              typeof row.longitude === 'string' ? Number(row.longitude) : row.longitude,
              lat,
              lng
            );

            return {
              ...row,
              distance_miles: Number.isFinite(distance) ? distance : row.distance_miles ?? null,
            };
          })
          .filter((row) => {
            if (row.distance_miles == null) return true;
            const distanceValue =
              typeof row.distance_miles === 'string' ? Number(row.distance_miles) : row.distance_miles;
            return Number.isFinite(distanceValue) ? distanceValue <= radiusMiles : true;
          });
      }

      let filteredRows = this.applyClientSideFilters(rows, filters, includePast);

      if (filters.followingOnly) {
        const { followedUuidSet, followedJambaseSet, followedNameSet } = await this.getFollowedArtistIdentifiers(userId);

        if (followedUuidSet.size === 0 && followedJambaseSet.size === 0 && followedNameSet.size === 0) {
          return [];
      }
      
        filteredRows = filteredRows.filter((row) => {
          const eventArtistUuid = row.artist_uuid ? String(row.artist_uuid).toLowerCase() : null;
          const eventArtistId = row.artist_id ? String(row.artist_id).toLowerCase() : null;
          const eventArtistName = row.artist_name ? row.artist_name.toLowerCase().trim() : null;

          if (eventArtistUuid && followedUuidSet.has(eventArtistUuid)) return true;
          if (eventArtistId && followedJambaseSet.has(eventArtistId)) return true;
          if (eventArtistName && followedNameSet.has(eventArtistName)) return true;

          return false;
        });
      }

      return filteredRows.map((row) => this.mapRowToEvent(row));
    } catch (fallbackException) {
      logger.error('❌ Fallback feed exception:', fallbackException);
        return [];
      }
  }
  
  private static async getFollowedArtistIdentifiers(userId: string): Promise<{
    followedUuidSet: Set<string>;
    followedJambaseSet: Set<string>;
    followedNameSet: Set<string>;
  }> {
    const followedUuidSet = new Set<string>();
    const followedJambaseSet = new Set<string>();
    const followedNameSet = new Set<string>();

    try {
      const { data: followRows, error: followError } = await supabase
        .from('artist_follows')
        .select('artist_id')
        .eq('user_id', userId);

      if (followError) {
        logger.warn('⚠️ Unable to load artist_follows for fallback filter:', followError);
        return { followedUuidSet, followedJambaseSet, followedNameSet };
      }

      const artistIds = (followRows ?? [])
        .map((row: any) => (row.artist_id ? String(row.artist_id) : null))
        .filter((id): id is string => !!id);

      artistIds.forEach((id) => followedUuidSet.add(id.toLowerCase()));

      if (artistIds.length > 0) {
        const { data: artistRows, error: artistError } = await supabase
          .from('artists')
          .select('id, jambase_artist_id, name')
          .in('id', artistIds);

        if (artistError) {
          logger.warn('⚠️ Unable to load artists for fallback filter:', artistError);
        } else {
          for (const artist of artistRows ?? []) {
            if (artist.jambase_artist_id) {
              followedJambaseSet.add(String(artist.jambase_artist_id).toLowerCase());
            }
            if (artist.name) {
              followedNameSet.add(String(artist.name).toLowerCase().trim());
            }
          }
        }
      }
    } catch (error) {
      logger.warn('⚠️ Unexpected error while loading followed artist identifiers:', error);
    }

    return { followedUuidSet, followedJambaseSet, followedNameSet };
  }

  /**
   * Additional services used elsewhere in the app.
   */
  static async getUserMusicProfile(userId: string): Promise<UserMusicProfile | null> {
    try {
      const { data, error } = await supabase.rpc('get_user_music_profile_summary', {
        p_user_id: userId,
      });
      
      if (error) throw error;
      if (!data || typeof data !== 'object') return null;
      
      return data as unknown as UserMusicProfile;
    } catch (error) {
      logger.error('❌ Error fetching music profile:', error);
      return null;
    }
  }
  
  static async getUserTopGenres(
    userId: string, 
    limit: number = 10
  ): Promise<Array<{ genre: string; score: number; interaction_count: number }>> {
    try {
      const { data, error } = await supabase.rpc('get_user_top_genres', {
        p_user_id: userId,
        p_limit: limit,
      });
      
      if (error) throw error;
      if (!Array.isArray(data)) return [];
      
      return data;
    } catch (error) {
      logger.error('❌ Error fetching top genres:', error);
      return [];
    }
  }
  
  static async getUserTopArtists(
    userId: string,
    limit: number = 20
  ): Promise<Array<{ artist_name: string; artist_id: string; score: number; interaction_count: number; genres: string[] }>> {
    try {
      const { data, error } = await supabase.rpc('get_user_top_artists', {
        p_user_id: userId,
        p_limit: limit,
      });
      
      if (error) throw error;
      if (!Array.isArray(data)) return [];
      
      return data;
    } catch (error) {
      logger.error('❌ Error fetching top artists:', error);
      return [];
    }
  }
  
  static async userHasMusicData(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('music_preference_signals')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) throw error;
      const signals = data?.music_preference_signals || [];
      return Array.isArray(signals) && signals.length > 0;
    } catch (error) {
      logger.error('❌ Error checking music data:', error);
      return false;
    }
  }
  
  static async getEventRelevanceScore(userId: string, eventId: string): Promise<number> {
    try {
      const { data, error } = await supabase.rpc('calculate_event_relevance_score', {
        p_user_id: userId,
        p_event_id: eventId,
      });
      
      if (error) throw error;
      return data || 0;
    } catch (error) {
      logger.error('❌ Error calculating relevance:', error);
      return 0;
    }
  }
  
  /**
   * Map the RPC row (or fallback row) to a PersonalizedEvent.
   */
  private static mapRowToEvent(row: PersonalizedFeedRow): PersonalizedEvent {
    const nowIso = new Date().toISOString();

    const latitude = row.latitude !== null && row.latitude !== undefined ? Number(row.latitude) : null;
    const longitude = row.longitude !== null && row.longitude !== undefined ? Number(row.longitude) : null;
    const distanceMiles =
      row.distance_miles !== null && row.distance_miles !== undefined ? Number(row.distance_miles) : null;

    const ticketUrls = Array.isArray(row.ticket_urls) ? row.ticket_urls : [];

    return {
      id: row.event_id,
      jambase_event_id: row.event_id,
      title: row.title ?? 'Untitled Event',
      artist_name: row.artist_name ?? 'Unknown Artist',
      artist_id: row.artist_id ?? null,
      venue_name: row.venue_name ?? 'Unknown Venue',
      venue_id: row.venue_id ?? null,
      venue_city: row.venue_city ?? null,
      venue_state: row.venue_state ?? null,
      venue_address: row.venue_address ?? null,
      venue_zip: row.venue_zip ?? null,
      event_date: row.event_date,
      doors_time: row.doors_time ?? null,
      description: row.description ?? null,
      genres: row.genres ?? [],
      latitude,
      longitude,
      ticket_urls: ticketUrls,
      ticket_available: row.ticket_available ?? ticketUrls.length > 0,
      price_range: row.price_range ?? null,
      ticket_price_min: row.ticket_price_min !== undefined && row.ticket_price_min !== null
        ? Number(row.ticket_price_min)
        : null,
      ticket_price_max: row.ticket_price_max !== undefined && row.ticket_price_max !== null
        ? Number(row.ticket_price_max)
        : null,
      ticket_url: ticketUrls.length > 0 ? ticketUrls[0] : null,
      setlist: null,
      setlist_enriched: false,
      setlist_song_count: null,
      setlist_fm_id: null,
      setlist_fm_url: null,
      setlist_source: null,
      setlist_last_updated: null,
      tour_name: null,
      created_at: row.created_at ?? nowIso,
      updated_at: row.updated_at ?? nowIso,
      relevance_score: row.relevance_score ?? 0,
      user_is_interested: undefined,
      interested_count: row.total_interest_count ?? 0,
      friends_interested_count: row.friend_interest_count ?? 0,
      artist_frequency_rank: undefined,
      diversity_penalty: undefined,
      is_promoted: row.is_promoted ?? false,
      promotion_tier:
        row.promotion_tier === 'basic' || row.promotion_tier === 'premium' || row.promotion_tier === 'featured'
          ? (row.promotion_tier as 'basic' | 'premium' | 'featured')
          : null,
      active_promotion_id: null,
      distance_miles: distanceMiles,
      poster_image_url: row.poster_image_url ?? null,
    } as PersonalizedEvent;
  }

  /**
   * Normalize front-end filters to the parameters expected by the RPC.
   */
  private static async normalizeFilters(filters?: PersonalizedFeedFilters): Promise<NormalizedFilters> {
    const cleanedCities =
      filters?.selectedCities
        ?.map((city) => city.split(',')[0]?.trim())
        .filter(Boolean)
        .map((city) => normalizeCityName(city || '')) ?? undefined;

    const baseCity = filters?.city ?? cleanedCities?.[0] ?? null;
    const normalizedCity = baseCity ? normalizeCityName(baseCity) : null;
      
    const genres = filters?.genres && filters.genres.length > 0 ? filters.genres : undefined;
    const daysOfWeek = filters?.daysOfWeek && filters.daysOfWeek.length > 0 ? filters.daysOfWeek : undefined;
    const followingOnly = filters?.filterByFollowing === 'following';
    const dateStartDate = filters?.dateRange?.from;
    const dateEndDate = filters?.dateRange?.to;
    const radiusMiles = filters?.radiusMiles ?? DEFAULT_RADIUS_MILES;

    // Look up city coordinates if city is specified
    let cityCoordinates: { lat: number; lng: number } | null = null;
    if (baseCity) {
      try {
        const { RadiusSearchService } = await import('@/services/radiusSearchService');
        cityCoordinates = await RadiusSearchService.getCityCoordinates(baseCity);
        if (cityCoordinates) {
          logger.log(`📍 Found coordinates for "${baseCity}":`, cityCoordinates);
        } else {
          logger.warn(`⚠️ No coordinates found for city: "${baseCity}"`);
        }
      } catch (error) {
        logger.error('Error looking up city coordinates:', error);
      }
    }

    return {
      genres,
      cleanedCities,
      originalCities: filters?.selectedCities ?? [],
      city: normalizedCity,
      cityCoordinates,
      radiusMiles,
      dateStartIso: dateStartDate ? dateStartDate.toISOString() : undefined,
      dateEndIso: dateEndDate ? dateEndDate.toISOString() : undefined,
      dateStart: dateStartDate,
      dateEnd: dateEndDate,
      daysOfWeek,
      followingOnly,
      debugSummary: {
        city: normalizedCity,
        radius: radiusMiles,
        genres: genres?.length ?? 0,
        citiesSelected: cleanedCities?.length ?? 0,
        daysOfWeek: daysOfWeek?.length ?? 0,
        followingOnly,
      },
    };
  }

  /**
   * Apply any client-side filters that the RPC does not handle (e.g., multiple cities, days-of-week).
   */
  private static applyClientSideFilters(
    rows: PersonalizedFeedRow[],
    filters: NormalizedFilters,
    includePast: boolean
  ): PersonalizedFeedRow[] {
    let result = rows;

    if (!includePast) {
      const now = Date.now();
      result = result.filter((row) => {
        const eventTime = Date.parse(row.event_date);
        return Number.isNaN(eventTime) ? true : eventTime >= now;
      });
    }

    // Skip city name filtering if coordinates were used (RPC already filtered by location)
    // Only apply city name filter if no coordinates were provided
    if (!filters.cityCoordinates) {
    const citySource = (filters.cleanedCities && filters.cleanedCities.length > 0)
      ? filters.cleanedCities
      : (filters.originalCities && filters.originalCities.length > 0 ? filters.originalCities : undefined);

    if (citySource && citySource.length > 0) {
      const normalizeCity = (city: string) =>
        normalizeCityName(city || '').replace(/\s+/g, ' ').trim();
      const allowed = new Set(citySource.map(normalizeCity));
      result = result.filter((row) => {
        const city = row.venue_city ? normalizeCity(row.venue_city) : '';
        return allowed.has(city);
      });
      }
    }

    if (filters.genres && filters.genres.length > 0) {
      const genreSet = new Set(filters.genres.map((genre) => genre.toLowerCase()));
      result = result.filter((row) => {
        if (!row.genres || row.genres.length === 0) return false;
        return row.genres.some((genre) => genreSet.has(genre.toLowerCase()));
      });
    }

    if (filters.dateStart || filters.dateEnd) {
      const startTime = filters.dateStart ? filters.dateStart.getTime() : null;
      const endTime = filters.dateEnd ? filters.dateEnd.getTime() : null;
      result = result.filter((row) => {
        const eventTime = Date.parse(row.event_date);
        if (Number.isNaN(eventTime)) return true;
        if (startTime !== null && eventTime < startTime) return false;
        if (endTime !== null && eventTime > endTime) return false;
        return true;
      });
    }

    if (filters.daysOfWeek?.length) {
      const days = new Set(filters.daysOfWeek);
      result = result.filter((row) => {
        const date = new Date(row.event_date);
        return Number.isNaN(date.getTime()) ? true : days.has(date.getDay());
      });
    }

    return result;
  }

  private static calculateDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 3959; // Earth's radius in miles
    const toRadians = (degrees: number) => degrees * (Math.PI / 180);
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private static mapRpcRowToFeedRow(row: any): PersonalizedFeedRow {
    const ticketUrls = Array.isArray(row.ticket_urls)
      ? row.ticket_urls
      : row.ticket_url
      ? [row.ticket_url]
      : [];

    return {
      event_id: String(row.event_id ?? row.id ?? ''),
      title: row.title ?? null,
      artist_name: row.artist_name ?? null,
      artist_id: row.artist_id ?? null,
      artist_uuid: row.artist_uuid ?? null,
      venue_name: row.venue_name ?? null,
      venue_id: row.venue_id ?? null,
      venue_uuid: row.venue_uuid ?? null,
      venue_city: row.venue_city ?? null,
      venue_state: row.venue_state ?? null,
      venue_address: row.venue_address ?? null,
      venue_zip: row.venue_zip ?? null,
      event_date: row.event_date,
      doors_time: row.doors_time ?? null,
      description: row.description ?? null,
      genres: Array.isArray(row.genres) ? row.genres : [],
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      ticket_urls: ticketUrls,
      ticket_available:
        row.ticket_available ??
        (ticketUrls.length > 0 ? true : row.ticket_available ?? null),
      price_range: row.price_range ?? null,
      ticket_price_min: row.ticket_price_min ?? null,
      ticket_price_max: row.ticket_price_max ?? null,
      relevance_score: row.relevance_score ?? null,
      friend_interest_count: row.friend_interest_count ?? row.friends_interested_count ?? null,
      total_interest_count: row.total_interest_count ?? row.interested_count ?? null,
      is_promoted: row.is_promoted ?? null,
      promotion_tier: row.promotion_tier ?? null,
      distance_miles: row.distance_miles ?? null,
      poster_image_url: row.poster_image_url ?? null,
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null,
    };
  }
}

