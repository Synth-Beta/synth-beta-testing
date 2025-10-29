/**
 * Personalized Feed Service
 * Uses music preference data to score and rank events
 * Relevance scores are calculated server-side but hidden from users
 */

import { supabase } from '@/integrations/supabase/client';
import type { JamBaseEvent } from './jambaseEventsService';

// Cache for city coordinate lookups to avoid repeated RPC calls
const cityFilterCache = new Map<string, { ids: string[], timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

export interface PersonalizedEvent extends JamBaseEvent {
  relevance_score?: number; // Hidden from UI, used for sorting only
  user_is_interested?: boolean;
  interested_count?: number | bigint; // BIGINT from COUNT(*)
  friends_interested_count?: number | bigint; // BIGINT from COUNT(*)
  // Diversity control fields
  artist_frequency_rank?: number | bigint; // 1 = first event from this artist, 2 = second, etc. (BIGINT from ROW_NUMBER)
  diversity_penalty?: number; // 0 = no penalty, >0 = penalty applied for diversity
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

export class PersonalizedFeedService {
  /**
   * Score a list of events with limited concurrency to avoid overloading RPC
   */
  private static async scoreEventsWithConcurrency(
    userId: string,
    events: any[],
    concurrency: number
  ): Promise<Array<{ event: any; score: number }>> {
    if (events.length === 0) return [];
    const results: Array<{ event: any; score: number }> = new Array(events.length);
    let index = 0;

    const worker = async () => {
      while (true) {
        const current = index++;
        if (current >= events.length) break;
        const event = events[current];
        try {
          const { data: score, error: scoreError } = await supabase.rpc('calculate_event_relevance_score', {
            p_user_id: userId,
            p_event_id: event.id
          });
          if (scoreError) {
            console.warn(`⚠️ Score RPC error for event ${event.id}:`, scoreError);
            results[current] = { event, score: 0 };
            continue;
          }
          results[current] = { event, score: score || 0 };
        } catch (err) {
          console.warn(`⚠️ Score RPC exception for event ${event.id}:`, err);
          results[current] = { event, score: 0 };
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, events.length) }, () => worker());
    await Promise.all(workers);
    return results;
  }
  
  /**
   * Helper: Get event IDs by city using coordinate-based filtering (includes metro areas)
   * Now with caching to avoid repeated RPC calls for the same cities
   */
  private static async getEventIdsByCityCoordinates(
    selectedCities: string[],
    stateCodes?: string[],
    radiusMiles: number = 50
  ): Promise<string[]> {
    try {
      // Create cache key from parameters
      const cacheKey = `${selectedCities.sort().join(',')}_${stateCodes?.sort().join(',') || ''}_${radiusMiles}`;
      
      // Check cache first
      const cached = cityFilterCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log('🎯 Using cached city filter results:', cached.ids.length, 'events');
        return cached.ids;
      }
      
      const { data, error } = await supabase.rpc('get_events_by_city_coordinates', {
        city_names: selectedCities,
        state_codes: stateCodes || null,
        radius_miles: radiusMiles,
        event_limit: 5000 // Get enough IDs to filter from
      });

      if (error) {
        console.error('Error getting events by coordinates:', error);
        // Fallback to empty array - will result in no city-filtered results
        return [];
      }

      const eventIds = (data || []).map((row: any) => row.event_id);
      
      // Cache the results
      cityFilterCache.set(cacheKey, { ids: eventIds, timestamp: Date.now() });
      
      // Clean up old cache entries (keep cache size reasonable)
      if (cityFilterCache.size > 20) {
        const oldestKey = Array.from(cityFilterCache.entries())
          .sort((a, b) => a[1].timestamp - b[1].timestamp)[0]?.[0];
        if (oldestKey) {
          cityFilterCache.delete(oldestKey);
        }
      }
      
      return eventIds;
    } catch (err) {
      console.error('Exception in coordinate-based city filtering:', err);
      return [];
    }
  }
  
  /**
   * Get personalized events feed sorted by hidden relevance score
   * Score ranges from 0-100 based on music preferences
   * 
   * @param filters - Optional filter state. When provided, generates personalized feed from filtered events only
   */
  static async getPersonalizedFeed(
    userId: string,
    limit: number = 50,
    offset: number = 0,
    includePast: boolean = false,
    filters?: {
      genres?: string[];
      selectedCities?: string[];
      dateRange?: { from?: Date; to?: Date };
      daysOfWeek?: number[];
      filterByFollowing?: 'all' | 'following';
    }
  ): Promise<PersonalizedEvent[]> {
    try {
      console.log('🎯 Fetching personalized feed for user:', userId, filters ? 'with filters' : '');
      
      // ALWAYS use the filtered path (even with empty filters) to avoid RPC timeout issues
      // The filtered path is more reliable and performs better than the legacy RPC
      // If filters are empty, we'll just apply minimal filtering (future events only)
      const hasActiveFilters = filters && (
        (filters.genres && filters.genres.length > 0) ||
        (filters.selectedCities && filters.selectedCities.length > 0) ||
        filters.dateRange?.from || filters.dateRange?.to ||
        (filters.daysOfWeek && filters.daysOfWeek.length > 0) ||
        filters.filterByFollowing === 'following'
      );
      
      if (hasActiveFilters || !filters) {
        // Use filtered path: either has active filters, or filters is undefined/empty
        // Passing undefined filters means "all future events" which is safer than RPC
        console.log('🔍 Using filtered personalized feed path (more reliable than RPC)...');
        return this.getFilteredPersonalizedFeed(userId, limit, offset, includePast, filters);
      }
      
      // Legacy RPC path - only use if filters object exists but is empty (shouldn't happen)
      // This path is prone to timeouts, so we prefer filtered path above
      console.warn('⚠️ Using legacy RPC path (may timeout). Consider using filtered path instead.');
      const { data, error } = await supabase.rpc('get_personalized_events_feed' as any, {
        p_user_id: userId,
        p_limit: limit,
        p_offset: offset,
        p_include_past: includePast,
        p_max_per_artist: 1  // Max 1 event per artist for diversity
      });
      
      if (error) {
        console.error('❌ Personalized feed RPC error (timeout likely):', error);
        // Fallback to filtered path if RPC fails
        console.log('🔄 Falling back to filtered path...');
        return this.getFilteredPersonalizedFeed(userId, limit, offset, includePast, filters);
      }
      
      if (!data || !Array.isArray(data)) {
        console.warn('⚠️ No personalized feed data returned');
        return this.getFallbackFeed(userId, limit, offset, includePast, filters);
      }
      
      // The database function already applies OFFSET and LIMIT, so results is already the correct page
      // We should NOT slice again with offset - that would apply pagination twice!
      let results = data;
      
      // Only try to fetch more if we're on the first page (offset=0) and didn't get enough
      if (results.length < limit && offset === 0) {
        console.log(`⚠️ Only got ${results.length} events on first page, fetching more to reach ${limit}...`);
        // Try fetching more with a larger limit
        try {
          const { data: moreData, error: moreError } = await supabase.rpc('get_personalized_events_feed' as any, {
            p_user_id: userId,
            p_limit: limit * 2, // Fetch double to ensure we have enough
            p_offset: 0,
            p_include_past: includePast,
            p_max_per_artist: 1  // Max 1 event per artist for diversity
          });
          
          if (!moreError && moreData && Array.isArray(moreData) && moreData.length > results.length) {
            results = moreData;
            console.log(`✅ Got ${results.length} events from expanded query`);
          }
        } catch (error) {
          console.warn('⚠️ Failed to fetch additional events:', error);
        }
      }
      
      // Filter out past events if includePast is false
      let filteredResults = results;
      if (!includePast) {
        const now = new Date();
        filteredResults = results.filter((event: any) => {
          try {
            const eventDate = new Date(event.event_date);
            return eventDate >= now;
          } catch {
            return true; // Keep if date parsing fails
          }
        });
      }
      
      // Database already applied pagination (OFFSET/LIMIT), so results is already the correct page
      // First deduplicate by event ID (in case database returned duplicates)
      const uniqueResults = this.deduplicateEvents(filteredResults);
      
      // Just ensure we don't exceed the limit (in case database returned more for some reason)
      // IMPORTANT: Also enforce diversity limits - max 1 event per artist
      const paginatedData = this.enforceDiversityLimit(uniqueResults, limit, 1);
      
      // Log diversity information (using all available results for context, not just paginated)
      const artistCounts = paginatedData.reduce((acc: Record<string, number>, event: any) => {
        const artist = event.artist_name;
        acc[artist] = (acc[artist] || 0) + 1;
        return acc;
      }, {});

      const topArtist = Object.entries(artistCounts)
        .sort(([,a], [,b]) => (b as number) - (a as number))[0];
      
      // Debug: Check if we have valid results with scores
      const firstResult = results[0] as any;
      const firstPaginated = paginatedData[0] as any;
      
      // Debug: Check price_range in first few events
      const priceDebug = paginatedData.slice(0, 5).map((e: any) => ({
        title: e.title,
        artist: e.artist_name,
        price_range: e.price_range,
        ticket_price_min: e.ticket_price_min,
        ticket_price_max: e.ticket_price_max,
        price_range_source: e.price_range ? 'DB' : (e.ticket_price_min || e.ticket_price_max ? 'STRUCTURED' : 'NONE')
      }));
      
      console.log('✅ Personalized feed loaded:', {
        count: paginatedData.length,
        dbReturned: results.length, // Number of events returned by DB (already paginated)
        requestedOffset: offset,
        requestedLimit: limit,
        topScore: firstPaginated?.relevance_score ?? firstResult?.relevance_score,
        hasScores: (firstPaginated?.relevance_score !== undefined && firstPaginated?.relevance_score !== null) ||
                   (firstResult?.relevance_score !== undefined && firstResult?.relevance_score !== null),
        topArtist: topArtist ? `${topArtist[0]} (${topArtist[1]} events})` : 'Unknown',
        artistDiversity: Object.keys(artistCounts).length,
        priceDebug: priceDebug,
        scores: paginatedData.slice(0, 5).map(e => ({ 
          artist: (e as any).artist_name, 
          score: (e as any).relevance_score,
          diversity_penalty: (e as any).diversity_penalty || 0,
          artist_rank: (e as any).artist_frequency_rank || 1
        }))
      });
      
      // Warn if database returned empty results (means we've reached the end of available events)
      if (results.length === 0 && offset > 0) {
        console.log(`ℹ️ No more personalized events available at offset ${offset}. User has reached the end of their personalized feed.`);
      }
      
      // Warn if results exist but no scores (personalization might have failed)
      if (results.length > 0 && firstResult && (firstResult.relevance_score === undefined || firstResult.relevance_score === null)) {
        console.warn('⚠️ Personalized feed returned events but no relevance_score. Personalization might have failed.', {
          firstEventTitle: firstResult.title,
          firstEventArtist: firstResult.artist_name
        });
      }
      
      return paginatedData.map((row: any) => ({
        id: row.event_id,
        jambase_event_id: row.event_id,
        title: row.title,
        artist_name: row.artist_name,
        artist_id: row.artist_id || null,
        venue_name: row.venue_name,
        venue_id: row.venue_id || null,
        event_date: row.event_date,
        doors_time: row.doors_time || null,
        description: row.description || null,
        genres: row.genres || [],
        venue_address: row.venue_address || null,
        venue_city: row.venue_city || null,
        venue_state: row.venue_state || null,
        venue_zip: row.venue_zip || null,
        latitude: row.latitude || null,
        longitude: row.longitude || null,
        ticket_available: row.ticket_available || false,
        price_range: row.price_range || null,
        ticket_urls: row.ticket_url ? [row.ticket_url] : (row.ticket_urls || []), // Function returns ticket_url (singular), convert to array
        ticket_url: row.ticket_url || null, // Also include singular for backward compatibility
        ticket_price_min: row.ticket_price_min || null,
        ticket_price_max: row.ticket_price_max || null,
        setlist: row.setlist || null,
        setlist_enriched: row.setlist_enriched || false,
        setlist_song_count: row.setlist_song_count || null,
        setlist_fm_id: row.setlist_fm_id || null,
        setlist_fm_url: row.setlist_fm_url || null,
        setlist_source: row.setlist_source || null,
        setlist_last_updated: row.setlist_last_updated || null,
        tour_name: row.tour_name || null,
        created_at: row.created_at || new Date().toISOString(),
        updated_at: row.updated_at || new Date().toISOString(),
        relevance_score: row.relevance_score, // HIDDEN - only for internal sorting
        user_is_interested: row.user_is_interested,
        interested_count: row.interested_count,
        friends_interested_count: row.friends_interested_count,
        // New diversity fields
        artist_frequency_rank: row.artist_frequency_rank,
        diversity_penalty: row.diversity_penalty,
        // Promotion fields
        is_promoted: row.is_promoted || false,
        promotion_tier: (row.promotion_tier === 'basic' || row.promotion_tier === 'premium' || row.promotion_tier === 'featured') 
          ? row.promotion_tier as 'basic' | 'premium' | 'featured' 
          : null,
        active_promotion_id: row.active_promotion_id || null
      } as PersonalizedEvent));
    } catch (error) {
      console.error('❌ Exception in personalized feed:', error);
      return this.getFallbackFeed(userId, limit, offset, includePast, filters);
    }
  }
  
  /**
   * Get personalized feed from filtered events only
   * First applies filters, then gets personalized scores for filtered events
   */
  private static async getFilteredPersonalizedFeed(
    userId: string,
    limit: number,
    offset: number,
    includePast: boolean,
    filters?: {
      genres?: string[];
      selectedCities?: string[];
      dateRange?: { from?: Date; to?: Date };
      daysOfWeek?: number[];
      filterByFollowing?: 'all' | 'following';
    }
  ): Promise<PersonalizedEvent[]> {
    try {
      // Handle undefined filters - treat as "no filters"
      const effectiveFilters = filters || {
        genres: [],
        selectedCities: [],
        dateRange: undefined,
        daysOfWeek: [],
        filterByFollowing: 'all'
      };
      console.log('🔍 Generating personalized feed with filters:', effectiveFilters);
      // Reduced from 2000 to 800 for faster performance - we only need to score enough candidates
      // to get a good personalized feed. With filters applied, this should be plenty.
      const MAX_CANDIDATES = 800; 
      const SCORE_CONCURRENCY = 16; // max concurrent score RPCs
      
      // Step 1: Query events matching filters
      // Select both id and event_date so we can filter by day of week early
      let query = supabase
        .from('jambase_events')
        .select('id, event_date');
      
      if (!includePast) {
        query = query.gte('event_date', new Date().toISOString());
      }
      
      // Apply genre filters
      if (effectiveFilters.genres && effectiveFilters.genres.length > 0) {
        query = query.overlaps('genres', effectiveFilters.genres);
      }
      
      // Apply city filters using coordinate-based filtering (includes metro areas)
      let cityFilteredEventIds: string[] | null = null;
      if (effectiveFilters.selectedCities && effectiveFilters.selectedCities.length > 0) {
        // Extract state codes if cities are in "City, ST" format
        const stateCodes = effectiveFilters.selectedCities
          .map(city => {
            const parts = city.split(',');
            return parts.length > 1 ? parts[1].trim() : undefined;
          })
          .filter(Boolean) as string[] | undefined;
        
        // Get clean city names (remove state if present)
        let cleanCityNames = effectiveFilters.selectedCities.map(city => {
          const parts = city.split(',');
          return parts[0].trim();
        });
        
        console.log('🗺️ Filtering by cities:', cleanCityNames, 'stateCodes:', stateCodes);
        cityFilteredEventIds = await this.getEventIdsByCityCoordinates(
          cleanCityNames,
          stateCodes?.length > 0 ? stateCodes : undefined,
          50 // 50 mile radius for metro coverage
        );
        
        console.log(`🗺️ Found ${cityFilteredEventIds.length} events in selected cities/metro areas`);
        if (cityFilteredEventIds.length === 0) {
          console.error('❌ CITY FILTER FAILED: No events found for cities:', cleanCityNames);
          console.error('   Attempting alternative city name matching...');
          
          // Try alternative approach: direct query by venue_city column with fuzzy matching
          // This bypasses the RPC and directly filters by city name variations
          console.log('   Trying direct city name matching...');
          
          // Build OR conditions for all city name variations
          const cityConditions: string[] = [];
          for (const city of cleanCityNames) {
            // Try exact match
            cityConditions.push(`venue_city.ilike.${city}`);
            // Try contains match
            cityConditions.push(`venue_city.ilike.%${city}%`);
            // Try without spaces (e.g., "Washington DC" -> "WashingtonDC")
            cityConditions.push(`venue_city.ilike.%${city.replace(/\s+/g, '')}%`);
            // Try with common separators
            cityConditions.push(`venue_city.ilike.%${city.replace(/\s+/g, ' ')}%`);
          }
          
          const { data: directCityEvents, error: directError } = await supabase
            .from('jambase_events')
            .select('id')
            .gte('event_date', new Date().toISOString())
            .or(cityConditions.join(','))
            .limit(5000);
          
          if (!directError && directCityEvents && directCityEvents.length > 0) {
            console.log(`✅ Found ${directCityEvents.length} events using direct city name matching`);
            cityFilteredEventIds = directCityEvents.map((e: any) => e.id);
          } else {
            console.error('❌ Both RPC and direct city matching failed.');
            console.error('   Cities tried:', cleanCityNames);
            console.error('   Error:', directError?.message || 'No events found');
            console.error('   Returning empty to prevent showing wrong events from all over the world.');
            // Return empty array - better than showing wrong events from all over the world
          return [];
          }
        }
        
        // Filter by these event IDs
        query = query.in('id', cityFilteredEventIds);
      }
      
      // Apply date range filters
      // If from and to are the same date (single day selection), filter to events on that specific day
      if (effectiveFilters.dateRange?.from) {
        const fromDate = effectiveFilters.dateRange.from;
        const toDate = effectiveFilters.dateRange.to || fromDate;
        
        // Check if it's a single day selection (from and to are the same day)
        const isSameDay = fromDate.toDateString() === toDate.toDateString();
        
        if (isSameDay) {
          // Single day: filter to events on that specific day only
          // Start of day
          const startOfDay = new Date(fromDate);
          startOfDay.setHours(0, 0, 0, 0);
          // End of day
          const endOfDay = new Date(fromDate);
          endOfDay.setHours(23, 59, 59, 999);
          
          query = query.gte('event_date', startOfDay.toISOString())
                   .lte('event_date', endOfDay.toISOString());
        } else {
          // Date range: filter between from and to dates
          query = query.gte('event_date', fromDate.toISOString());
          if (toDate) {
            query = query.lte('event_date', toDate.toISOString());
          }
        }
      }
      
      // Get filtered event IDs first
      const { data: filteredEventIds, error: filterError } = await query;
      
      if (filterError) {
        console.error('❌ Error filtering events:', filterError);
        return [];
      }
      
      if (!filteredEventIds || filteredEventIds.length === 0) {
        console.log('📭 No events match the filters');
        return [];
      }
      
      // Apply days of week filter early (before fetching full event data) to reduce queries
      let eventIdsWithDates = filteredEventIds.map((e: any) => ({
        id: e.id,
        event_date: e.event_date
      }));
      
      if (effectiveFilters.daysOfWeek && effectiveFilters.daysOfWeek.length > 0) {
        const now = new Date();
        eventIdsWithDates = eventIdsWithDates.filter((e: any) => {
          try {
            const eventDate = new Date(e.event_date);
            // Only filter future events by day of week
            if (eventDate >= now) {
              const dayOfWeek = eventDate.getDay();
              return effectiveFilters.daysOfWeek!.includes(dayOfWeek);
            }
            return true; // Keep past events if includePast is true
          } catch {
            return true; // Keep if date parsing fails
          }
        });
        
        console.log(`📅 Day-of-week filter: ${eventIdsWithDates.length} events remain after filtering by days`);
        
        if (eventIdsWithDates.length === 0) {
          console.log('📭 No events match the day-of-week filter');
          return [];
        }
      }
      
      const eventIds = eventIdsWithDates.map(e => e.id);
      console.log(`📋 Fetching full event data for ${eventIds.length} filtered event IDs...`);
      
      // Step 2: Get full event data for filtered events (batch IN queries to avoid size limits)
      // Supabase has limits on IN clause size (typically ~100-200 items), so batch into chunks
      const BATCH_SIZE = 100;
      const allFilteredEvents: any[] = [];
      
      for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
        const batchIds = eventIds.slice(i, i + BATCH_SIZE);
        
        const { data: batchEvents, error: batchError } = await supabase
          .from('jambase_events')
          .select('*')
          .in('id', batchIds)
          .order('event_date', { ascending: true });
        
        if (batchError) {
          console.error(`❌ Error fetching batch ${i / BATCH_SIZE + 1}:`, batchError);
          // Continue with other batches instead of failing completely
          continue;
        }
        
        if (batchEvents && batchEvents.length > 0) {
          allFilteredEvents.push(...batchEvents);
        }
      }
      
      if (allFilteredEvents.length === 0) {
        console.log('📭 No events retrieved after batching');
        return [];
      }
      
      // Sort all events by date (since we fetched in batches)
      const filteredEvents = allFilteredEvents.sort((a, b) => {
        const dateA = new Date(a.event_date).getTime();
        const dateB = new Date(b.event_date).getTime();
        return dateA - dateB;
      });
      
      console.log(`✅ Successfully fetched ${filteredEvents.length} events from ${Math.ceil(eventIds.length / BATCH_SIZE)} batches`);
      
      // Step 3: Filter out past events completely (days of week already filtered above)
      const now = new Date();
      let futureEvents = filteredEvents.filter((event: any) => {
        try {
          const eventDate = new Date(event.event_date);
          return eventDate >= now;
        } catch {
          return true; // Keep if date parsing fails
        }
      });
      
      if (futureEvents.length === 0) {
        console.log('📭 No future events match the filters');
        return [];
      }
      
      // Days of week filter already applied above before fetching full data
      // Step 4: Get followed artists and venues (needed for filtering or boosts)
      const { ArtistFollowService } = await import('@/services/artistFollowService');
      const { VenueFollowService } = await import('@/services/venueFollowService');
      
      const [followedArtists, followedVenues] = await Promise.all([
        ArtistFollowService.getUserFollowedArtists(userId),
        VenueFollowService.getUserFollowedVenues(userId)
      ]);
      
      const artistFollowSet = new Set(followedArtists.map((a: any) => (a.artist_name || '').toLowerCase().trim()));
      const venueFollowSet = new Set(followedVenues.map((v: any) => 
        `${(v.venue_name || '').toLowerCase().trim()}|${(v.venue_city || '').toLowerCase().trim()}`
      ));
      
      // Apply "filterByFollowing" if set to 'following' - FILTER BEFORE scoring
      // Days of week already filtered above before fetching full data
      let followingFilteredEvents = futureEvents;
      if (effectiveFilters.filterByFollowing === 'following') {
        // Filter to only events from followed artists OR followed venues
        followingFilteredEvents = futureEvents.filter((event: any) => {
          const artistName = (event.artist_name || '').toLowerCase().trim();
          const venueKey = `${(event.venue_name || '').toLowerCase().trim()}|${(event.venue_city || '').toLowerCase().trim()}`;
          return artistFollowSet.has(artistName) || venueFollowSet.has(venueKey);
        });
        
        console.log(`📌 Filtered to ${followingFilteredEvents.length} events from followed artists/venues (from ${futureEvents.length} total)`);
      }
      
      // Step 6: Cheap pre-sort and cap candidates BEFORE scoring to minimize M
      // Heuristics: prefer events with tickets and nearer dates first
      const preSorted = [...followingFilteredEvents].sort((a: any, b: any) => {
        const ta = (a.ticket_available ? 1 : 0) - (b.ticket_available ? 1 : 0);
        if (ta !== 0) return -ta; // ticket_available true first
        const da = new Date(a.event_date).getTime();
        const db = new Date(b.event_date).getTime();
        return da - db; // sooner first
      });
      const cappedCandidates = preSorted.slice(0, Math.min(MAX_CANDIDATES, preSorted.length));

      // Step 7: Calculate base personalized scores for capped candidates (concurrency-limited)
      const baseScoredEvents = await this.scoreEventsWithConcurrency(userId, cappedCandidates, SCORE_CONCURRENCY);
      
      // Step 8: Get user location from selectedCities if available
      // If filters have selectedCities, try to get coordinates for the first city
      let userLocation: { lat: number; lng: number } | null = null;
      
      if (filters?.selectedCities && filters.selectedCities.length > 0) {
        try {
          const { RadiusSearchService } = await import('@/services/radiusSearchService');
          const cityCoords = await RadiusSearchService.getCityCoordinates(filters.selectedCities[0]);
          if (cityCoords) {
            userLocation = cityCoords;
            console.log('✅ Using city coordinates for location boosts:', userLocation);
          }
        } catch (error) {
          console.warn('⚠️ Could not get city coordinates for location boosts:', error);
        }
      }
      
      // artistFollowSet and venueFollowSet already created in Step 5, reuse for boosts
      
      // Get user's friends list once for friends interested count
      const { data: friendships } = await supabase
        .from('friends')
        .select('user1_id, user2_id')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);
      
      const friendIds = friendships && friendships.length > 0
        ? friendships.map(f => f.user1_id === userId ? f.user2_id : f.user1_id)
        : [];
      
      // Step 9: Enhance scores with location, following, and engagement boosts
      const enhancedScoredEvents = await this.enhanceScoresWithBoosts(
        baseScoredEvents,
        userId,
        userLocation,
        artistFollowSet,
        venueFollowSet,
        friendIds
      );
      
      // Step 10: Sort by enhanced relevance score (descending), then by date
      const sortedScoredEvents = enhancedScoredEvents.sort((a, b) => {
        // Primary: enhanced relevance score (higher is better)
        if (Math.abs(b.enhancedScore - a.enhancedScore) > 5) {
          return b.enhancedScore - a.enhancedScore;
        }
        // Secondary: event date (sooner is better for same score)
        const dateA = new Date(a.event.event_date).getTime();
        const dateB = new Date(b.event.event_date).getTime();
        return dateA - dateB;
      });
      
      // Step 11: Apply city/metro clustering - prioritize events from top 2-3 metro areas
      // Use a larger buffer to ensure we have enough diverse events after filtering
      const diversityBuffer = Math.max(limit * 5, 100); // Fetch 5x the limit or at least 100 events
      const cityClustered = this.applyCityClustering(sortedScoredEvents, userLocation, diversityBuffer);
      
      // Step 12: Enforce diversity limits (max 1 event per artist, max 2 per venue per city)
      let diverseFiltered = this.enforceAdvancedDiversity(
        cityClustered.map(item => ({
          ...item.event,
          relevance_score: item.enhancedScore,
          event_id: item.event.id
        })),
        diversityBuffer,
        1, // max 1 per artist
        2  // max 2 per venue per city
      );
      
      // If we don't have enough diverse events, relax venue diversity (keep artist at 1)
      if (diverseFiltered.length < limit && offset === 0) {
        console.log(`⚠️ Only ${diverseFiltered.length} diverse events found, relaxing venue diversity...`);
        diverseFiltered = this.enforceAdvancedDiversity(
          cityClustered.map(item => ({
            ...item.event,
            relevance_score: item.enhancedScore,
            event_id: item.event.id
          })),
          diversityBuffer,
          1, // max 1 per artist (keep strict)
          5  // Increase venue limit to 5 per city
        );
      }
      
      // Step 13: Apply offset and limit to final filtered and scored results
      let paginatedResults = diverseFiltered.slice(offset, offset + limit);
      
      console.log(`✅ Filtered personalized feed: ${paginatedResults.length} events (scored from ${futureEvents.length} filtered events)`);
      
      // Step 13: Fetch additional metadata (user interest, counts, promotion info) for paginated results
      // This data is normally returned by get_personalized_events_feed but we need to fetch it separately
      const enrichedResults = await Promise.all(
        paginatedResults.map(async (row: any) => {
          const eventId = row.id || row.event_id;
          
          // Fetch user interest status
          let userIsInterested = false;
          let interestedCount = 0;
          let friendsInterestedCount = 0;
          
          try {
            if (userId) {
              // Check if user is interested - use correct table: user_jambase_events with jambase_event_id
              const { data: interest } = await supabase
                .from('user_jambase_events')
                .select('id')
                .eq('user_id', userId)
                .eq('jambase_event_id', eventId)
                .maybeSingle();
              userIsInterested = !!interest;
              
              // Get interest count - use correct table and column
              const { count } = await supabase
                .from('user_jambase_events')
                .select('id', { count: 'exact', head: true })
                .eq('jambase_event_id', eventId);
              interestedCount = count || 0;
              
              // Get friends interested count - optimize to avoid 503 timeouts
              try {
                // Only fetch friends if we don't already have them (they're fetched earlier in the flow)
                // For now, skip friends count in enrichment step to avoid duplicate queries
                // Friends count is already used in scoring boosts above
                friendsInterestedCount = 0; // Skip detailed friends count per event to avoid timeouts
                
                // If you need friends count per event, consider:
                // 1. Batch fetching for all events at once
                // 2. Caching friend lists
                // 3. Limiting to first 50 friends
                // 4. Using a database function to aggregate
              } catch (friendsError) {
                // Silent fail - friends count is optional
                friendsInterestedCount = 0;
              }
            }
          } catch (error) {
            console.warn(`⚠️ Error fetching interest data for event ${eventId}:`, error);
          }
          
          // Fetch promotion info if available
          let isPromoted = false;
          let promotionTier: 'basic' | 'premium' | 'featured' | null = null;
          let activePromotionId: string | null = null;
          
          try {
            const now = new Date().toISOString();
            // Promotion is active if: promotion_status = 'active', starts_at <= now, and expires_at >= now
            const { data: promotion, error: promotionError } = await supabase
              .from('event_promotions')
              .select('id, promotion_tier')
              .eq('event_id', eventId)
              .eq('promotion_status', 'active')
              .lte('starts_at', now)  // starts_at <= now (started)
              .gte('expires_at', now)    // expires_at >= now (not ended yet)
              .order('promotion_tier', { ascending: false }) // featured > premium > basic
              .maybeSingle();
            
            if (promotionError) {
              console.warn(`⚠️ Error fetching promotion for event ${eventId}:`, promotionError);
            } else if (promotion) {
              isPromoted = true;
              promotionTier = (promotion.promotion_tier === 'basic' || promotion.promotion_tier === 'premium' || promotion.promotion_tier === 'featured')
                ? promotion.promotion_tier as 'basic' | 'premium' | 'featured'
                : null;
              activePromotionId = promotion.id;
            }
          } catch (error) {
            // Silently fail if promotions table doesn't exist or query fails
            console.warn(`⚠️ Exception fetching promotion data for event ${eventId}:`, error);
          }
      
      // Map to PersonalizedEvent format
          return {
            id: eventId,
            jambase_event_id: row.jambase_event_id || eventId,
        title: row.title,
        artist_name: row.artist_name,
        artist_id: row.artist_id || null,
        venue_name: row.venue_name,
        venue_id: row.venue_id || null,
        event_date: row.event_date,
        doors_time: row.doors_time || null,
        description: row.description || null,
        genres: row.genres || [],
        venue_address: row.venue_address || null,
        venue_city: row.venue_city || null,
        venue_state: row.venue_state || null,
        venue_zip: row.venue_zip || null,
        latitude: row.latitude || null,
        longitude: row.longitude || null,
        ticket_available: row.ticket_available || false,
        price_range: row.price_range || null,
            ticket_urls: Array.isArray(row.ticket_urls) ? row.ticket_urls : (row.ticket_url ? [row.ticket_url] : []),
            ticket_url: row.ticket_url || (Array.isArray(row.ticket_urls) && row.ticket_urls.length > 0 ? row.ticket_urls[0] : null),
            ticket_price_min: row.ticket_price_min || row.price_min || null,
            ticket_price_max: row.ticket_price_max || row.price_max || null,
        setlist: row.setlist || null,
        setlist_enriched: row.setlist_enriched || false,
        setlist_song_count: row.setlist_song_count || null,
        setlist_fm_id: row.setlist_fm_id || null,
        setlist_fm_url: row.setlist_fm_url || null,
        setlist_source: row.setlist_source || null,
        setlist_last_updated: row.setlist_last_updated || null,
        tour_name: row.tour_name || null,
        created_at: row.created_at || new Date().toISOString(),
        updated_at: row.updated_at || new Date().toISOString(),
            relevance_score: row.relevance_score || 0,
            user_is_interested: userIsInterested,
            interested_count: interestedCount,
            friends_interested_count: friendsInterestedCount,
            artist_frequency_rank: 1, // Will be calculated by diversity enforcement
            diversity_penalty: 0,
            is_promoted: isPromoted,
            promotion_tier: promotionTier,
            active_promotion_id: activePromotionId
          } as PersonalizedEvent;
        })
      );
      
      return enrichedResults;
      
    } catch (error) {
      console.error('❌ Exception in filtered personalized feed:', error);
      return this.getFallbackFeed(userId, limit, offset, includePast, filters);
    }
  }
  
  /**
   * Fallback: non-personalized feed if no preference data exists
   */
  private static async getFallbackFeed(
    userId: string,
    limit: number,
    offset: number,
    includePast: boolean,
    filters?: {
      genres?: string[];
      selectedCities?: string[];
      dateRange?: { from?: Date; to?: Date };
      daysOfWeek?: number[];
      filterByFollowing?: 'all' | 'following';
    }
  ): Promise<PersonalizedEvent[]> {
    try {
      console.log('⚠️ Using fallback feed (no personalization)', filters ? 'with filters' : '');
      
      let query = supabase
        .from('jambase_events')
        .select('*');
      
      if (!includePast) {
        query = query.gte('event_date', new Date().toISOString());
      }
      
      // Apply filters if provided
      if (filters) {
        if (filters.genres && filters.genres.length > 0) {
          query = query.overlaps('genres', filters.genres);
        }
        
        if (filters.selectedCities && filters.selectedCities.length > 0) {
          // Extract state codes if cities are in "City, ST" format
          const stateCodes = filters.selectedCities
            .map(city => {
              const parts = city.split(',');
              return parts.length > 1 ? parts[1].trim() : undefined;
            })
            .filter(Boolean) as string[] | undefined;
          
          // Get clean city names (remove state if present)
          const cleanCityNames = filters.selectedCities.map(city => {
            const parts = city.split(',');
            return parts[0].trim();
          });
          
          const cityFilteredEventIds = await this.getEventIdsByCityCoordinates(
            cleanCityNames,
            stateCodes?.length > 0 ? stateCodes : undefined,
            50 // 50 mile radius for metro coverage
          );
          
          if (cityFilteredEventIds.length === 0) {
            console.log('📭 No events found in selected cities/metro areas');
            return [];
          }
          
          query = query.in('id', cityFilteredEventIds);
        }
        
        if (filters.dateRange?.from) {
          query = query.gte('event_date', filters.dateRange.from.toISOString());
        }
        
        if (filters.dateRange?.to) {
          query = query.lte('event_date', filters.dateRange.to.toISOString());
        }
      }
      
      // Apply offset and limit for pagination
      query = query.order('event_date', { ascending: true });
      
      const { data, error } = await query.range(offset, offset + limit - 1);
      
      if (error) {
        console.error('❌ Fallback feed query error:', error);
        throw error;
      }
      
      let events = data || [];
      
      // Apply days of week filter (client-side)
      if (filters?.daysOfWeek && filters.daysOfWeek.length > 0) {
        events = events.filter(event => {
          try {
            const eventDate = new Date(event.event_date);
            const dayOfWeek = eventDate.getDay();
            return filters.daysOfWeek!.includes(dayOfWeek);
          } catch {
            return true;
          }
        });
      }
      
      if (!events || events.length === 0) {
        console.log(`📭 Fallback feed: No events found at offset ${offset} with limit ${limit}`);
        // If we got to offset and no results, try starting from 0
        if (offset > 0 && (!filters || Object.keys(filters).length === 0)) {
          console.log('🔄 Fallback feed: Trying offset 0 instead...');
          const { data: retryData } = await supabase
            .from('jambase_events')
            .select('*')
            .gte('event_date', includePast ? '1970-01-01' : new Date().toISOString())
            .order('event_date', { ascending: true })
            .range(0, limit - 1);
          if (retryData && retryData.length > 0) {
            return retryData.map(event => ({
              ...event,
              relevance_score: 0,
              user_is_interested: false,
              interested_count: 0,
              friends_interested_count: 0,
              // Promotion fields (default values for fallback feed)
              is_promoted: false,
              promotion_tier: null,
              active_promotion_id: null
            }));
          }
        }
        // If still no data, return empty array
        return [];
      }
      
      // Ensure we return at least the requested limit if possible
      let finalEvents = events;
      if (events.length < limit && offset === 0) {
        console.log(`⚠️ Fallback feed: Only got ${events.length} events, fetching more to reach ${limit}...`);
        // Try fetching more events
        const { data: moreData } = await supabase
          .from('jambase_events')
          .select('*')
          .gte('event_date', includePast ? '1970-01-01' : new Date().toISOString())
          .order('event_date', { ascending: true })
          .range(0, limit * 2 - 1); // Fetch more to ensure we have enough
        
        if (moreData && moreData.length > events.length) {
          finalEvents = moreData;
          console.log(`✅ Fallback feed: Got ${finalEvents.length} events from expanded query`);
        }
      }
      
      // Apply days of week filter if needed (this might reduce the count)
      if (filters?.daysOfWeek && filters.daysOfWeek.length > 0) {
        finalEvents = finalEvents.filter(event => {
          try {
            const eventDate = new Date(event.event_date);
            const dayOfWeek = eventDate.getDay();
            return filters.daysOfWeek!.includes(dayOfWeek);
          } catch {
            return true;
          }
        });
      }
      
      // Take only up to limit
      const paginatedEvents = finalEvents.slice(offset, offset + limit);
      
      return paginatedEvents.map(event => ({
        ...event,
        relevance_score: 0,
        user_is_interested: false,
        interested_count: 0,
        friends_interested_count: 0,
        // Promotion fields (default values for fallback feed)
        is_promoted: false,
        promotion_tier: null,
        active_promotion_id: null
      }));
    } catch (error) {
      console.error('❌ Fallback feed error:', error);
      return [];
    }
  }
  
  /**
   * Get user's complete music profile
   */
  static async getUserMusicProfile(userId: string): Promise<UserMusicProfile | null> {
    try {
      const { data, error } = await supabase.rpc('get_user_music_profile_summary', {
        p_user_id: userId
      });
      
      if (error) throw error;
      
      // JSONB return type needs parsing
      if (!data || typeof data !== 'object') {
        return null;
      }
      
      return data as unknown as UserMusicProfile;
    } catch (error) {
      console.error('❌ Error fetching music profile:', error);
      return null;
    }
  }
  
  /**
   * Get user's top genres
   */
  static async getUserTopGenres(
    userId: string, 
    limit: number = 10
  ): Promise<Array<{ genre: string; score: number; interaction_count: number }>> {
    try {
      const { data, error } = await supabase.rpc('get_user_top_genres', {
        p_user_id: userId,
        p_limit: limit
      });
      
      if (error) throw error;
      
      if (!data || !Array.isArray(data)) {
        return [];
      }
      
      return data;
    } catch (error) {
      console.error('❌ Error fetching top genres:', error);
      return [];
    }
  }
  
  /**
   * Get user's top artists with full metadata
   */
  static async getUserTopArtists(
    userId: string,
    limit: number = 20
  ): Promise<Array<{ artist_name: string; artist_id: string; score: number; interaction_count: number; genres: string[] }>> {
    try {
      const { data, error } = await supabase.rpc('get_user_top_artists', {
        p_user_id: userId,
        p_limit: limit
      });
      
      if (error) throw error;
      
      if (!data || !Array.isArray(data)) {
        return [];
      }
      
      return data;
    } catch (error) {
      console.error('❌ Error fetching top artists:', error);
      return [];
    }
  }
  
  /**
   * Check if user has music preference data
   * Used to determine if personalization is available
   */
  static async userHasMusicData(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('music_preference_signals')
        .select('id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      
      return !!data;
    } catch (error) {
      console.error('❌ Error checking music data:', error);
      return false;
    }
  }
  
  /**
   * Get relevance score for single event (for debugging)
   */
  static async getEventRelevanceScore(userId: string, eventId: string): Promise<number> {
    try {
      const { data, error } = await supabase.rpc('calculate_event_relevance_score', {
        p_user_id: userId,
        p_event_id: eventId
      });
      
      if (error) throw error;
      
      return data || 0;
    } catch (error) {
      console.error('❌ Error calculating relevance:', error);
      return 0;
    }
  }
  
  /**
   * Enhance base scores with location, following, and engagement boosts
   */
  private static async enhanceScoresWithBoosts(
    baseScoredEvents: Array<{ event: any; score: number }>,
    userId: string,
    userLocation: { lat: number; lng: number } | null,
    artistFollowSet: Set<string>,
    venueFollowSet: Set<string>,
    friendIds: string[]
  ): Promise<Array<{ event: any; score: number; enhancedScore: number }>> {
    // Batch fetch friends interested counts for ALL events at once (prevents 503 spam)
    const eventIds = baseScoredEvents.map(e => e.event.id);
    const friendsInterestedCounts = new Map<string, number>();
    
    if (friendIds.length > 0 && eventIds.length > 0) {
      try {
        // Limit friend IDs to prevent large query timeouts (check first 50 friends max)
        const limitedFriendIds = friendIds.slice(0, 50);
        
        // Batch eventIds into chunks to avoid IN clause size limits
        const BATCH_SIZE = 100;
        const allFriendsInterestedData: any[] = [];
        
        for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
          const batchEventIds = eventIds.slice(i, i + BATCH_SIZE);
          const { data: batchData, error: batchError } = await supabase
            .from('user_jambase_events')
            .select('jambase_event_id')
            .in('jambase_event_id', batchEventIds)
            .in('user_id', limitedFriendIds);
          if (batchError) {
            // Skip failed batches but continue with others
            console.debug(`Friends batch ${Math.floor(i / BATCH_SIZE) + 1} error (non-critical):`, batchError.message);
            continue;
          }
          if (batchData) allFriendsInterestedData.push(...batchData);
        }
        
        // Count friends interested per event
        allFriendsInterestedData.forEach((row: any) => {
          const eventId = row.jambase_event_id;
          friendsInterestedCounts.set(eventId, (friendsInterestedCounts.get(eventId) || 0) + 1);
        });
      } catch (friendsError) {
        // Silent fail - friends count boost is optional
      }
    }
    
    // Batch fetch general interested counts for all events at once
    const interestedCounts = new Map<string, number>();
    try {
      // Batch eventIds into chunks to avoid IN clause size limits
      const BATCH_SIZE = 100;
      const allInterestedData: any[] = [];
      for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
        const batchEventIds = eventIds.slice(i, i + BATCH_SIZE);
        const { data: batchData } = await supabase
          .from('user_jambase_events')
          .select('jambase_event_id')
          .in('jambase_event_id', batchEventIds);
        if (batchData) allInterestedData.push(...batchData);
      }
      allInterestedData.forEach((row: any) => {
        const eventId = row.jambase_event_id;
        interestedCounts.set(eventId, (interestedCounts.get(eventId) || 0) + 1);
      });
    } catch (e) {
      // Silent fail - continue without interest counts
    }
    
    // Now enhance scores using pre-fetched data (no per-event queries)
    return baseScoredEvents.map(({ event, score }) => {
      let enhancedScore = score || 0;
      
      // Location proximity boost
      if (userLocation && event.latitude && event.longitude) {
        const distanceMiles = this.calculateDistance(
          userLocation.lat,
          userLocation.lng,
          Number(event.latitude),
          Number(event.longitude)
        );
        
        if (distanceMiles <= 25) enhancedScore += 25;
        else if (distanceMiles <= 50) enhancedScore += 15;
        else if (distanceMiles <= 100) enhancedScore += 5;
        else if (distanceMiles > 200) enhancedScore -= 10; // Penalty for very far events
      }
      
      // Following boosts - HEAVY EMPHASIS on followed artists and venues
      const artistName = event.artist_name?.toLowerCase().trim();
      if (artistName && artistFollowSet.has(artistName)) {
        enhancedScore += 75; // Stronger boost for followed artists
      }
      
      const venueKey = `${(event.venue_name || '').toLowerCase().trim()}|${(event.venue_city || '').toLowerCase().trim()}`;
      if (venueFollowSet.has(venueKey)) {
        enhancedScore += 50; // Stronger boost for followed venues
      }
      
      // Recency boost (prefer near-term events)
      const eventDate = new Date(event.event_date);
      const now = new Date();
      const daysUntil = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysUntil >= 0 && daysUntil <= 14) enhancedScore += 20; // Next 2 weeks
      else if (daysUntil <= 30) enhancedScore += 10; // Next month
      else if (daysUntil <= 60) enhancedScore += 5; // Next 2 months
      else if (daysUntil > 180) enhancedScore -= 5; // Penalty for very far future
      
      // Engagement boosts (using pre-fetched data)
      const interestedCount = interestedCounts.get(event.id) || 0;
      if (interestedCount > 0) {
        enhancedScore += Math.min(interestedCount * 2, 20); // +2 per interested, max +20
      }
      
      // Friends interested boost (using pre-fetched data)
      const friendsInterestedCount = friendsInterestedCounts.get(event.id) || 0;
      if (friendsInterestedCount > 0) {
        enhancedScore += Math.min(friendsInterestedCount * 10, 50); // +10 per friend interested, max +50
      }
      
      // Ticket availability boost
      if (event.ticket_available) {
        enhancedScore += 5;
      }
      
      return { event, score, enhancedScore: Math.max(0, enhancedScore) };
    });
  }
  
  /**
   * Calculate distance between two points in miles
   */
  private static calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 3959; // Earth's radius in miles
    const toRad = (deg: number) => deg * (Math.PI / 180);
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  
  /**
   * Apply city/metro clustering - prioritize events from top 2-3 metro areas around user's location
   */
  private static applyCityClustering(
    scoredEvents: Array<{ event: any; score: number; enhancedScore: number }>,
    userLocation: { lat: number; lng: number } | null,
    maxResults: number
  ): Array<{ event: any; score: number; enhancedScore: number }> {
    if (!userLocation || scoredEvents.length === 0) {
      return scoredEvents.slice(0, maxResults);
    }
    
    // Group events by metro area (city + state)
    const metroGroups = new Map<string, Array<{ event: any; score: number; enhancedScore: number }>>();
    
    scoredEvents.forEach(item => {
      const city = item.event.venue_city || '';
      const state = item.event.venue_state || '';
      const metroKey = `${city}|${state}`;
      
      if (!metroGroups.has(metroKey)) {
        metroGroups.set(metroKey, []);
      }
      metroGroups.get(metroKey)!.push(item);
    });
    
    // Calculate average distance from user location for each metro
    const metroStats = Array.from(metroGroups.entries()).map(([key, events]) => {
      const distances = events
        .filter(e => e.event.latitude && e.event.longitude)
        .map(e => this.calculateDistance(
          userLocation.lat,
          userLocation.lng,
          Number(e.event.latitude),
          Number(e.event.longitude)
        ));
      
      const avgDistance = distances.length > 0
        ? distances.reduce((a, b) => a + b, 0) / distances.length
        : Infinity;
      
      // Get best events in this metro (sorted by enhancedScore)
      const sortedEvents = [...events].sort((a, b) => b.enhancedScore - a.enhancedScore);
      
      return {
        metroKey: key,
        avgDistance,
        events: sortedEvents,
        bestScore: sortedEvents[0]?.enhancedScore || 0
      };
    });
    
    // Sort metros by: 1) best score, 2) distance
    metroStats.sort((a, b) => {
      if (Math.abs(b.bestScore - a.bestScore) > 10) {
        return b.bestScore - a.bestScore;
      }
      return a.avgDistance - b.avgDistance;
    });
    
    // Take top metros - expand if we need more diversity (up to 10 metros)
    const numMetros = Math.min(metroStats.length, Math.max(3, Math.ceil(maxResults / 20))); // At least 3, up to 10
    const topMetros = metroStats.slice(0, numMetros);
    const clustered: Array<{ event: any; score: number; enhancedScore: number }> = [];
    
    // Round-robin take best events from each metro for diversity
    const maxPerMetro = Math.ceil(maxResults / numMetros);
    for (let round = 0; round < maxPerMetro && clustered.length < maxResults; round++) {
      for (const metro of topMetros) {
        if (clustered.length >= maxResults) break;
        if (round < metro.events.length) {
          clustered.push(metro.events[round]);
        }
      }
    }
    
    // If we have space, add remaining high-scoring events from other metros
    if (clustered.length < maxResults) {
      const clusteredIds = new Set(clustered.map(e => e.event.id));
      const remaining = scoredEvents
        .filter(e => !clusteredIds.has(e.event.id))
        .sort((a, b) => b.enhancedScore - a.enhancedScore)
        .slice(0, maxResults - clustered.length);
      clustered.push(...remaining);
    }
    
    return clustered;
  }
  
  /**
   * Enforce advanced diversity: max 1 per artist, max 2 per venue per city
   */
  private static enforceAdvancedDiversity(
    events: any[],
    maxTotal: number,
    maxPerArtist: number,
    maxPerVenuePerCity: number
  ): any[] {
    if (events.length === 0) return events;
    
    const artistCounts = new Map<string, number>();
    const venueCityCounts = new Map<string, number>(); // key: "venue_name|city"
    const diverseEvents: any[] = [];
    
    for (const event of events) {
      const artist = (event.artist_name || 'Unknown').toLowerCase().trim();
      const venue = (event.venue_name || '').toLowerCase().trim();
      const city = (event.venue_city || '').toLowerCase().trim();
      const venueCityKey = `${venue}|${city}`;
      
      const artistCount = artistCounts.get(artist) || 0;
      const venueCityCount = venueCityCounts.get(venueCityKey) || 0;
      
      // Skip if we've exceeded limits
      if (artistCount >= maxPerArtist) {
        continue; // Already have max for this artist
      }
      
      if (venueCityCount >= maxPerVenuePerCity) {
        continue; // Already have max for this venue in this city
      }
      
      // Add event
      diverseEvents.push(event);
      artistCounts.set(artist, artistCount + 1);
      venueCityCounts.set(venueCityKey, venueCityCount + 1);
      
      if (diverseEvents.length >= maxTotal) {
        break;
      }
    }
    
    return diverseEvents;
  }
  
  /**
   * Deduplicate events by event ID
   * Ensures we don't return the same event multiple times
   */
  private static deduplicateEvents(events: any[]): any[] {
    const seen = new Set<string>();
    return events.filter(event => {
      const eventId = event.event_id || event.id;
      if (!eventId) return true; // Keep events without IDs
      
      if (seen.has(eventId)) {
        return false; // Duplicate - skip
      }
      seen.add(eventId);
      return true; // First occurrence - keep
    });
  }
  
  /**
   * Enforce diversity limits - ensures max N events per artist
   * This is important when expanding queries to maintain diversity
   * Preserves the original database ordering while filtering excess events per artist
   */
  private static enforceDiversityLimit(
    events: any[], 
    maxTotal: number, 
    maxPerArtist: number
  ): any[] {
    if (events.length === 0) return events;
    
    // Track how many events we've seen per artist (maintaining original order)
    const artistCounts = new Map<string, number>();
    const diverseEvents: any[] = [];
    
    // Process events in their original order (already sorted by database)
    for (const event of events) {
      const artist = event.artist_name || 'Unknown';
      const count = artistCounts.get(artist) || 0;
      
      // Only include if we haven't exceeded maxPerArtist for this artist
      // Also check artist_frequency_rank - if it's <= maxPerArtist, it's definitely allowed
      // If rank is > maxPerArtist, it's a penalty event and we should exclude it
      const rank = event.artist_frequency_rank;
      const isWithinLimit = rank !== undefined && rank !== null 
        ? rank <= maxPerArtist  // Use database ranking if available
        : count < maxPerArtist; // Otherwise use simple counting
      
      if (isWithinLimit) {
        diverseEvents.push(event);
        artistCounts.set(artist, count + 1);
        
        // Stop if we've reached the total limit
        if (diverseEvents.length >= maxTotal) {
          break;
        }
      }
    }
    
    return diverseEvents;
  }
}

