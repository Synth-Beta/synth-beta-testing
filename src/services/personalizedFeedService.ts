/**
 * Personalized Feed Service
 * Uses music preference data to score and rank events
 * Relevance scores are calculated server-side but hidden from users
 */

import { supabase } from '@/integrations/supabase/client';
import type { JamBaseEvent } from './jambaseEventsService';

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
   * Helper: Get event IDs by city using coordinate-based filtering (includes metro areas)
   */
  private static async getEventIdsByCityCoordinates(
    selectedCities: string[],
    stateCodes?: string[],
    radiusMiles: number = 50
  ): Promise<string[]> {
    try {
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

      return (data || []).map((row: any) => row.event_id);
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
      
      // If filters are provided, apply them to the query first, then personalize
      // This ensures a fresh personalized feed is generated from only filtered events
      if (filters && (
        (filters.genres && filters.genres.length > 0) ||
        (filters.selectedCities && filters.selectedCities.length > 0) ||
        filters.dateRange?.from || filters.dateRange?.to ||
        (filters.daysOfWeek && filters.daysOfWeek.length > 0) ||
        filters.filterByFollowing === 'following'
      )) {
        console.log('🔍 Filters active, generating personalized feed from filtered events...');
        return this.getFilteredPersonalizedFeed(userId, limit, offset, includePast, filters);
      }
      
      // No filters: use standard personalized feed RPC
      // p_max_per_artist: 3 limits each artist to max 3 events for diversity
      const { data, error } = await supabase.rpc('get_personalized_events_feed' as any, {
        p_user_id: userId,
        p_limit: limit,
        p_offset: offset,
        p_include_past: includePast,
        p_max_per_artist: 3  // Max 3 events per artist for diversity
      });
      
      if (error) {
        console.error('❌ Personalized feed error:', error);
        return this.getFallbackFeed(userId, limit, offset, includePast, filters);
      }
      
      if (!data || !Array.isArray(data)) {
        console.warn('⚠️ No personalized feed data returned');
        return this.getFallbackFeed(userId, limit, offset, includePast, filters);
      }
      
      // Ensure we return at least the requested limit
      let results = data;
      if (results.length < limit && offset === 0) {
        console.log(`⚠️ Only got ${results.length} events, fetching more to reach ${limit}...`);
        // Try fetching more with a larger limit
        try {
          const { data: moreData, error: moreError } = await supabase.rpc('get_personalized_events_feed' as any, {
            p_user_id: userId,
            p_limit: limit * 2, // Fetch double to ensure we have enough
            p_offset: 0,
            p_include_past: includePast,
            p_max_per_artist: 3  // Max 3 events per artist for diversity
          });
          
          if (!moreError && moreData && Array.isArray(moreData) && moreData.length > results.length) {
            results = moreData;
            console.log(`✅ Got ${results.length} events from expanded query`);
          }
        } catch (error) {
          console.warn('⚠️ Failed to fetch additional events:', error);
        }
      }
      
      // Log diversity information
      const artistCounts = results.reduce((acc: Record<string, number>, event: any) => {
        const artist = event.artist_name;
        acc[artist] = (acc[artist] || 0) + 1;
        return acc;
      }, {});

      const topArtist = Object.entries(artistCounts)
        .sort(([,a], [,b]) => (b as number) - (a as number))[0];

      // Take only up to limit to respect pagination
      const paginatedData = results.slice(offset, offset + limit);
      
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
        totalAvailable: results.length,
        topScore: (paginatedData[0] as any)?.relevance_score,
        hasScores: (paginatedData[0] as any)?.relevance_score !== undefined,
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
    filters: {
      genres?: string[];
      selectedCities?: string[];
      dateRange?: { from?: Date; to?: Date };
      daysOfWeek?: number[];
      filterByFollowing?: 'all' | 'following';
    }
  ): Promise<PersonalizedEvent[]> {
    try {
      console.log('🔍 Generating personalized feed with filters:', filters);
      
      // Step 1: Query events matching filters
      let query = supabase
        .from('jambase_events')
        .select('id');
      
      if (!includePast) {
        query = query.gte('event_date', new Date().toISOString());
      }
      
      // Apply genre filters
      if (filters.genres && filters.genres.length > 0) {
        query = query.overlaps('genres', filters.genres);
      }
      
      // Apply city filters using coordinate-based filtering (includes metro areas)
      let cityFilteredEventIds: string[] | null = null;
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
        
        cityFilteredEventIds = await this.getEventIdsByCityCoordinates(
          cleanCityNames,
          stateCodes?.length > 0 ? stateCodes : undefined,
          50 // 50 mile radius for metro coverage
        );
        
        if (cityFilteredEventIds.length === 0) {
          console.log('📭 No events found in selected cities/metro areas');
          return [];
        }
        
        // Filter by these event IDs
        query = query.in('id', cityFilteredEventIds);
      }
      
      // Apply date range filters
      if (filters.dateRange?.from) {
        query = query.gte('event_date', filters.dateRange.from.toISOString());
      }
      if (filters.dateRange?.to) {
        query = query.lte('event_date', filters.dateRange.to.toISOString());
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
      
      const eventIds = filteredEventIds.map(e => e.id);
      
      // Step 2: Get personalized feed, then filter by our event IDs
      // We'll fetch more events than needed, then filter and take the top ones
      const { data, error } = await supabase.rpc('get_personalized_events_feed' as any, {
        p_user_id: userId,
        p_limit: limit * 3, // Get more to account for filtering
        p_offset: 0, // Always start from 0 when filters change
        p_include_past: includePast,
        p_max_per_artist: 3  // Max 3 events per artist for diversity
      });
      
      if (error) {
        console.error('❌ Personalized feed error with filters:', error);
        // Fall back to filtered non-personalized feed
        return this.getFallbackFeed(userId, limit, offset, includePast, filters);
      }
      
      if (!data || !Array.isArray(data)) {
        console.warn('⚠️ No personalized feed data returned');
        return this.getFallbackFeed(userId, limit, offset, includePast, filters);
      }
      
      // Step 3: Filter personalized results to only include filtered event IDs
      let filteredPersonalized = data.filter((event: any) => 
        eventIds.includes(event.event_id)
      );
      
      // Step 4: Apply days of week filter (client-side, can't do in initial query easily)
      if (filters.daysOfWeek && filters.daysOfWeek.length > 0) {
        filteredPersonalized = filteredPersonalized.filter((event: any) => {
          try {
            const eventDate = new Date(event.event_date);
            const dayOfWeek = eventDate.getDay();
            return filters.daysOfWeek!.includes(dayOfWeek);
          } catch {
            return true;
          }
        });
      }
      
      // Step 5: Apply following filter (client-side)
      if (filters.filterByFollowing === 'following') {
        // This will require additional queries to check follow status
        // For now, we'll skip this and let it be handled client-side if needed
        // TODO: Implement following filter at DB level
      }
      
      // Step 6: Apply offset and limit to final filtered results
      let paginatedResults = filteredPersonalized.slice(offset, offset + limit);
      
      // Step 7: If we got fewer than the requested limit, try to fetch more from unfiltered personalized feed
      if (paginatedResults.length < limit && offset === 0) {
        console.log(`⚠️ Only got ${paginatedResults.length} filtered events, fetching more to reach ${limit}...`);
        
        // Fetch additional events from unfiltered personalized feed
        const additionalLimit = limit - paginatedResults.length + 5; // Fetch a few extra
        try {
          const { data: additionalData, error: additionalError } = await supabase.rpc('get_personalized_events_feed' as any, {
            p_user_id: userId,
            p_limit: additionalLimit * 2, // Fetch more to account for possible duplicates
            p_offset: filteredPersonalized.length, // Start after the filtered results
            p_include_past: includePast
          });
          
          if (!additionalError && additionalData && Array.isArray(additionalData)) {
          // Filter out events we already have
          const existingIds = new Set(paginatedResults.map(e => e.id));
          const newEvents = additionalData
            .filter((event: any) => !existingIds.has(event.event_id))
            .slice(0, limit - paginatedResults.length)
            .map((row: any) => ({
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
              ticket_urls: row.ticket_urls || [],
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
              relevance_score: row.relevance_score,
              user_is_interested: row.user_is_interested,
              interested_count: row.interested_count,
              friends_interested_count: row.friends_interested_count,
              artist_frequency_rank: row.artist_frequency_rank,
              diversity_penalty: row.diversity_penalty,
              is_promoted: row.is_promoted || false,
              promotion_tier: (row.promotion_tier === 'basic' || row.promotion_tier === 'premium' || row.promotion_tier === 'featured') 
                ? row.promotion_tier as 'basic' | 'premium' | 'featured' 
                : null,
              active_promotion_id: row.active_promotion_id || null
            } as PersonalizedEvent));
          
            paginatedResults = [...paginatedResults, ...newEvents];
            console.log(`✅ Added ${newEvents.length} additional events, total: ${paginatedResults.length}`);
          }
        } catch (error) {
          console.warn('⚠️ Failed to fetch additional filtered events:', error);
        }
      }
      
      console.log(`✅ Filtered personalized feed: ${paginatedResults.length} events from ${filteredPersonalized.length} total matches`);
      
      // Map to PersonalizedEvent format
      return paginatedResults.map((row: any) => ({
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
        relevance_score: row.relevance_score,
        user_is_interested: row.user_is_interested,
        interested_count: row.interested_count,
        friends_interested_count: row.friends_interested_count,
        artist_frequency_rank: row.artist_frequency_rank,
        diversity_penalty: row.diversity_penalty,
        is_promoted: row.is_promoted || false,
        promotion_tier: (row.promotion_tier === 'basic' || row.promotion_tier === 'premium' || row.promotion_tier === 'featured') 
          ? row.promotion_tier as 'basic' | 'premium' | 'featured' 
          : null,
        active_promotion_id: row.active_promotion_id || null
      } as PersonalizedEvent));
      
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
}

