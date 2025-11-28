import { supabase } from '@/integrations/supabase/client';
import type { JamBaseEvent } from './jambaseEventsService';

/**
 * Row returned by `get_personalized_feed_v1`
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
  price_range: string | null;
  ticket_price_min?: number | string | null;
  ticket_price_max?: number | string | null;
  ticket_available?: boolean | null;
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

const DEFAULT_RADIUS_MILES = 50;
const EARLIEST_DATE = new Date(0).toISOString();

type NormalizedFilters = {
  genres?: string[];
  cleanedCities?: string[];
  originalCities: string[];
  city: string | null;
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
   * Fetch personalized events using the new Supabase RPC.
   * Falls back to a basic query if the RPC fails.
   */
  static async getPersonalizedFeed(
    userId: string,
    limit: number = 50,
    offset: number = 0,
    includePast: boolean = false,
    filters?: PersonalizedFeedFilters
  ): Promise<PersonalizedEvent[]> {
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const normalizedFilters = this.normalizeFilters(filters);

    const payload = {
        p_user_id: userId,
        p_limit: limit,
        p_offset: offset,
      p_city: normalizedFilters.city,
      p_radius_miles: normalizedFilters.radiusMiles,
      p_date_start: includePast
        ? normalizedFilters.dateStartIso ?? EARLIEST_DATE
        : normalizedFilters.dateStartIso ?? new Date().toISOString(),
      p_date_end: normalizedFilters.dateEndIso,
      p_genres: normalizedFilters.genres ?? null,
      p_following_only: normalizedFilters.followingOnly,
      p_days_of_week: normalizedFilters.daysOfWeek ?? null,
    };

    try {
      console.log('📡 Calling get_personalized_feed_v1 with payload:', payload);
      const { data, error } = await supabase.rpc('get_personalized_feed_v1', payload);
      
      if (error) {
        console.error('❌ get_personalized_feed_v1 error:', error);
        return this.getFallbackFeed(userId, limit, offset, includePast, normalizedFilters);
      }

      const rows = (data ?? []) as PersonalizedFeedRow[];
      const filteredRows = this.applyClientSideFilters(rows, normalizedFilters, includePast);
      const events = filteredRows.map((row) => this.mapRowToEvent(row));

      if (filteredRows.length === 0 && offset === 0) {
        console.warn('⚠️ RPC returned no events at offset 0 – falling back to basic feed.');
        return this.getFallbackFeed(userId, limit, offset, includePast, normalizedFilters);
      }

      const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const duration = finishedAt - startedAt;

      console.log('✅ Personalized feed (RPC):', {
        userId,
        count: events.length,
        limit,
        offset,
        loadTimeMs: Math.round(duration),
        filters: normalizedFilters.debugSummary,
      });

      return events;
    } catch (rpcException) {
      console.error('❌ get_personalized_feed_v1 exception:', rpcException);
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
    console.warn('⚠️ Falling back to basic feed query (RPC unavailable).');
      
    try {
      // Build city filter - handle variations like "Washington D.C", "Washington DC", etc.
      const cityFilter = filters.city || filters.cleanedCities?.[0];
      
      let query = supabase
        .from('events')
        .select('*')
        .order('event_date', { ascending: true });
      
      if (!includePast) {
        query = query.gte('event_date', new Date().toISOString());
      }
      
      // Filter by city if provided - handle variations by using ilike
      if (cityFilter) {
        const cityName = cityFilter.trim();
        
        // Create patterns to match common city name variations
        // For "Washington D.C" -> match "Washington", "Washington D.C", "Washington DC", etc.
        const cityPatterns: string[] = [];
        
        // Add the original city name
        cityPatterns.push(cityName);
        
        // Add variation without periods
        cityPatterns.push(cityName.replace(/\./g, ''));
        
        // Add base city name (without DC/D.C suffix) for cities like "Washington D.C"
        const baseCityName = cityName
          .replace(/\s+d\.?c\.?$/i, '')
          .replace(/\s+dc$/i, '')
          .replace(/\s+d\s+c$/i, '')
          .trim();
        if (baseCityName && baseCityName !== cityName) {
          cityPatterns.push(baseCityName);
        }
        
        // Use OR to match any of these patterns
        const orConditions = cityPatterns
          .filter(Boolean)
          .map(pattern => `venue_city.ilike.${pattern}%`)
          .join(',');
        
        if (orConditions) {
          query = query.or(orConditions);
        }
        
        console.log('🔍 Fallback feed: Filtering by city:', { 
          originalCity: cityFilter,
          patterns: cityPatterns,
          orConditions
        });
      }
      
      if (filters.genres?.length) {
          query = query.overlaps('genres', filters.genres);
        }
        
      if (filters.dateStartIso) {
        query = query.gte('event_date', filters.dateStartIso);
      }

      if (filters.dateEndIso) {
        query = query.lte('event_date', filters.dateEndIso);
      }

      // Fetch more events than needed to account for client-side filtering and pagination
      const fetchLimit = Math.max(limit * 3, 100);
      query = query.limit(fetchLimit).range(offset, offset + fetchLimit - 1);

      const { data, error } = await query;
      
      if (error) {
        console.error('❌ Fallback feed query error:', error);
        return [];
      }
      
      console.log(`✅ Fallback feed: Fetched ${data?.length || 0} events from database`);
      
      const rows = (data ?? []).map<PersonalizedFeedRow>((event: any) => ({
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
      console.error('❌ Fallback feed exception:', fallbackException);
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
        .from('relationships')
        .select('related_entity_id')
        .eq('user_id', userId)
        .eq('related_entity_type', 'artist')
        .eq('relationship_type', 'follow');

      if (followError) {
        console.warn('⚠️ Unable to load artist_follows for fallback filter:', followError);
        return { followedUuidSet, followedJambaseSet, followedNameSet };
      }

      const artistIds = (followRows ?? [])
        .map((row: any) => (row.related_entity_id ? String(row.related_entity_id) : null))
        .filter((id): id is string => !!id);

      artistIds.forEach((id) => followedUuidSet.add(id.toLowerCase()));

      if (artistIds.length > 0) {
        const { data: artistRows, error: artistError } = await supabase
          .from('artists')
          .select('id, jambase_artist_id, name')
          .in('id', artistIds);

        if (artistError) {
          console.warn('⚠️ Unable to load artists for fallback filter:', artistError);
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
      console.warn('⚠️ Unexpected error while loading followed artist identifiers:', error);
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
      console.error('❌ Error fetching music profile:', error);
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
      console.error('❌ Error fetching top genres:', error);
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
      console.error('❌ Error fetching top artists:', error);
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
      console.error('❌ Error checking music data:', error);
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
      console.error('❌ Error calculating relevance:', error);
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
  private static normalizeFilters(filters?: PersonalizedFeedFilters): NormalizedFilters {
    const cleanedCities =
      filters?.selectedCities?.map((city) => city.split(',')[0]?.trim()).filter(Boolean) ?? undefined;

    const primaryCity = filters?.city ?? cleanedCities?.[0] ?? null;
      
    const genres = filters?.genres && filters.genres.length > 0 ? filters.genres : undefined;
    const daysOfWeek = filters?.daysOfWeek && filters.daysOfWeek.length > 0 ? filters.daysOfWeek : undefined;
    const followingOnly = filters?.filterByFollowing === 'following';
    const dateStartDate = filters?.dateRange?.from;
    const dateEndDate = filters?.dateRange?.to;

    return {
      genres,
      cleanedCities,
      originalCities: filters?.selectedCities ?? [],
      city: primaryCity,
      radiusMiles: filters?.radiusMiles ?? DEFAULT_RADIUS_MILES,
      dateStartIso: dateStartDate ? dateStartDate.toISOString() : undefined,
      dateEndIso: dateEndDate ? dateEndDate.toISOString() : undefined,
      dateStart: dateStartDate,
      dateEnd: dateEndDate,
      daysOfWeek,
      followingOnly,
      debugSummary: {
        city: primaryCity,
        radius: filters?.radiusMiles ?? DEFAULT_RADIUS_MILES,
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

    const citySource = (filters.cleanedCities && filters.cleanedCities.length > 0)
      ? filters.cleanedCities
      : (filters.originalCities && filters.originalCities.length > 0 ? filters.originalCities : undefined);

    if (citySource && citySource.length > 0) {
      const normalizeCity = (city: string) =>
        city
          .trim()
          .toLowerCase()
          .replace(/\./g, '')
          .replace(/\s+dc$/, '')
          .replace(/\s+d\.c$/, '')
          .replace(/\s+/g, ' ');
      const allowed = new Set(citySource.map((city) => normalizeCity(city)));
      result = result.filter((row) => {
        const city = row.venue_city ? normalizeCity(row.venue_city) : '';
        return allowed.has(city);
      });
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
}

