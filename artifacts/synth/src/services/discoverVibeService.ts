import { supabase } from '@/integrations/supabase/client';
import type { JamBaseEvent } from '@/types/eventTypes';

export interface VibeResult {
  events: JamBaseEvent[];
  title: string;
  description: string;
  totalCount: number;
}

export interface VibeFilters {
  dateRange?: {
    from?: Date;
    to?: Date;
  };
  genres?: string[];
  cities?: string[];
  radiusMiles?: number;
  latitude?: number;
  longitude?: number;
}

export type VibeType =
  | 'similar-artists'
  | 'last-5-attended'
  | 'similar-taste-users'
  | 'this-weekend'
  | 'under-25'
  | 'small-venues'
  | 'late-shows'
  | 'up-and-coming'
  | 'less-than-10-reviews'
  | 'highest-rated-month'
  | 'best-venues'
  | 'best-value';

export class DiscoverVibeService {
  /**
   * Apply filters to a base query
   */
  static applyFilters(
    query: any,
    filters?: VibeFilters
  ): any {
    if (!filters) return query;

    // Date range filter
    if (filters.dateRange?.from) {
      query = query.gte('event_date', filters.dateRange.from.toISOString());
    }
    if (filters.dateRange?.to) {
      query = query.lte('event_date', filters.dateRange.to.toISOString());
    }
    if (!filters.dateRange?.from && !filters.dateRange?.to) {
      // Default to upcoming events if no date filter
      query = query.gte('event_date', new Date().toISOString());
    }

    // Genre filter
    if (filters.genres && filters.genres.length > 0) {
      query = query.overlaps('genres', filters.genres);
    }

    // Location filter (city or radius)
    if (filters.cities && filters.cities.length > 0) {
      // Filter by cities
      const cityConditions = filters.cities.map(city => `venue_city.ilike.%${city}%`).join(',');
      query = query.or(cityConditions);
    } else if (filters.latitude && filters.longitude && filters.radiusMiles) {
      // Filter by radius
      const latDelta = filters.radiusMiles / 69;
      const lngDelta = filters.radiusMiles / (69 * Math.cos(filters.latitude * Math.PI / 180));
      
      query = query
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .gte('latitude', filters.latitude - latDelta)
        .lte('latitude', filters.latitude + latDelta)
        .gte('longitude', filters.longitude - lngDelta)
        .lte('longitude', filters.longitude + lngDelta);
    }

    return query;
  }

  /**
   * Get events similar to artists user loves
   */
  static async getSimilarArtists(userId: string, limit: number = 20, filters?: VibeFilters): Promise<VibeResult> {
    try {
      console.log('🎵 [VIBE] getSimilarArtists - Starting');
      // Get user's top artists from recent reviews (last 90 days for accuracy)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      console.log(`🎵 [VIBE] getSimilarArtists - Using recency filter: last 90 days (since ${ninetyDaysAgo.toISOString()})`);
      
      const { data: userArtists } = await supabase
        .from('reviews')
        .select('events:event_id(artist_name)')
        .eq('user_id', userId)
        .eq('is_draft', false)
        .not('events.artist_name', 'is', null)
        .gte('created_at', ninetyDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(50);

      console.log(`🎵 [VIBE] getSimilarArtists - Fetched ${userArtists?.length || 0} reviews from last 90 days`);

      const artistNames = new Set(
        (userArtists || [])
          .map((r: any) => r.events?.artist_name)
          .filter(Boolean)
      );

      console.log(`🎵 [VIBE] getSimilarArtists - Found ${artistNames.size} unique artists from reviews`);

      if (artistNames.size === 0) {
        console.log('🎵 [VIBE] getSimilarArtists - No artists found, returning empty');
        return {
          events: [],
          title: 'Similar to Artists You Love',
          description: 'We need more data about your music taste to show similar artists.',
          totalCount: 0,
        };
      }

      // Get events by artists the user has seen live
      let query = supabase
        .from('events')
        .select('*')
        .in('artist_name', Array.from(artistNames));
      
      query = DiscoverVibeService.applyFilters(query, filters);
      
      const { data: events } = await query
        .order('event_date', { ascending: true })
        .limit(limit);

      console.log(`🎵 [VIBE] getSimilarArtists - Found ${events?.length || 0} events, returning results`);

      return {
        events: (events || []) as JamBaseEvent[],
        title: 'Similar to Artists You Love',
        description: `Events by artists you've seen live`,
        totalCount: events?.length || 0,
      };
    } catch (error) {
      console.error('Error getting similar artists:', error);
      return {
        events: [],
        title: 'Similar to Artists You Love',
        description: 'Unable to load similar artists.',
        totalCount: 0,
      };
    }
  }

  /**
   * Get events similar to last 5 attended
   */
  static async getLast5Attended(userId: string, limit: number = 20, filters?: VibeFilters): Promise<VibeResult> {
    try {
      console.log('🎵 [VIBE] getLast5Attended - Starting');
      // Get last 5 events user attended
      const { data: recentEvents } = await supabase
        .from('reviews')
        .select('events:event_id(artist_name, genres, venue_name)')
        .eq('user_id', userId)
        .eq('is_draft', false)
        .eq('was_there', true)
        .order('created_at', { ascending: false })
        .limit(5);

      console.log(`🎵 [VIBE] getLast5Attended - Fetched ${recentEvents?.length || 0} recent attended events`);

      if (!recentEvents || recentEvents.length === 0) {
        return {
          events: [],
          title: 'Based on Your Last 5 Shows',
          description: 'Attend and review events to get personalized recommendations.',
          totalCount: 0,
        };
      }

      // Extract genres from recent events
      const genres = new Set<string>();
      recentEvents.forEach((r: any) => {
        if (r.events?.genres) {
          (r.events.genres as string[]).forEach((g: string) => genres.add(g));
        }
      });

      // Get upcoming events with similar genres
      let query = supabase
        .from('events')
        .select('*')
        .overlaps('genres', Array.from(genres));
      
      query = DiscoverVibeService.applyFilters(query, filters);
      
      const { data: events } = await query
        .order('event_date', { ascending: true })
        .limit(limit);

      return {
        events: (events || []) as JamBaseEvent[],
        title: 'Based on Your Last 5 Shows',
        description: `Events similar to shows you've recently attended`,
        totalCount: events?.length || 0,
      };
    } catch (error) {
      console.error('Error getting last 5 attended:', error);
      return {
        events: [],
        title: 'Based on Your Last 5 Shows',
        description: 'Unable to load recommendations.',
        totalCount: 0,
      };
    }
  }

  /**
   * Get events highly rated by users with similar taste
   */
  static async getSimilarTasteUsers(userId: string, limit: number = 20, filters?: VibeFilters): Promise<VibeResult> {
    try {
      console.log('🎵 [VIBE] getSimilarTasteUsers - Starting');
      // Use recent reviews (last 90 days) for accuracy and query speed
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      console.log(`🎵 [VIBE] getSimilarTasteUsers - Using recency filter: last 90 days (since ${ninetyDaysAgo.toISOString()})`);
      
      // Get user's top genres from recent reviews
      const { data: userReviews } = await supabase
        .from('reviews')
        .select('events:event_id(genres)')
        .eq('user_id', userId)
        .eq('is_draft', false)
        .not('events.genres', 'is', null)
        .gte('created_at', ninetyDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(50);

      console.log(`🎵 [VIBE] getSimilarTasteUsers - Fetched ${userReviews?.length || 0} user reviews from last 90 days`);

      const userGenres = new Set<string>();
      (userReviews || []).forEach((r: any) => {
        if (r.events?.genres) {
          (r.events.genres as string[]).forEach((g: string) => userGenres.add(g));
        }
      });

      console.log(`🎵 [VIBE] getSimilarTasteUsers - Found ${userGenres.size} unique genres from user reviews`);

      if (userGenres.size === 0) {
        console.log('🎵 [VIBE] getSimilarTasteUsers - No genres found, returning empty');
        return {
          events: [],
          title: 'Highly Rated by Similar Tastes',
          description: 'We need more data about your music taste.',
          totalCount: 0,
        };
      }

      // Get events with high ratings and similar genres from recent reviews
      const { data: highRatedReviews } = await supabase
        .from('reviews')
        .select('event_id')
        .gte('rating', 4)
        .eq('is_draft', false)
        .gte('created_at', ninetyDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      console.log(`🎵 [VIBE] getSimilarTasteUsers - Fetched ${highRatedReviews?.length || 0} high-rated reviews (4+) from last 90 days`);

      if (!highRatedReviews || highRatedReviews.length === 0) {
        console.log('🎵 [VIBE] getSimilarTasteUsers - No high-rated reviews found, returning empty');
        return {
          events: [],
          title: 'Highly Rated by Similar Tastes',
          description: 'No highly rated events found',
          totalCount: 0,
        };
      }

      const highRatedEventIds = [...new Set(highRatedReviews.map(r => r.event_id))];
      console.log(`🎵 [VIBE] getSimilarTasteUsers - Found ${highRatedEventIds.length} unique high-rated events`);

      // Then get events with similar genres
      let query = supabase
        .from('events')
        .select('*')
        .in('id', highRatedEventIds)
        .overlaps('genres', Array.from(userGenres));
      
      query = DiscoverVibeService.applyFilters(query, filters);
      
      const { data: events } = await query
        .order('event_date', { ascending: true })
        .limit(limit);

      console.log(`🎵 [VIBE] getSimilarTasteUsers - Found ${events?.length || 0} events matching genres`);

      // Deduplicate and format
      const eventMap = new Map<string, JamBaseEvent>();
      (events || []).forEach((e: any) => {
        if (!eventMap.has(e.id)) {
          eventMap.set(e.id, e);
        }
      });

      console.log(`🎵 [VIBE] getSimilarTasteUsers - Returning ${eventMap.size} deduplicated events`);
      return {
        events: Array.from(eventMap.values()),
        title: 'Highly Rated by Similar Tastes',
        description: `Events rated 4+ stars by users who like similar genres`,
        totalCount: eventMap.size,
      };
    } catch (error) {
      console.error('Error getting similar taste users:', error);
      return {
        events: [],
        title: 'Highly Rated by Similar Tastes',
        description: 'Unable to load recommendations.',
        totalCount: 0,
      };
    }
  }

  /**
   * Get events this weekend
   */
  static async getThisWeekend(limit: number = 20, filters?: VibeFilters): Promise<VibeResult> {
    try {
      const now = new Date();
      const saturday = new Date(now);
      saturday.setDate(now.getDate() + ((6 - now.getDay()) % 7));
      saturday.setHours(0, 0, 0, 0);
      
      const sunday = new Date(saturday);
      sunday.setDate(saturday.getDate() + 1);
      sunday.setHours(23, 59, 59, 999);

      let query = supabase
        .from('events')
        .select('*')
        .gte('event_date', saturday.toISOString())
        .lte('event_date', sunday.toISOString());
      
      // Apply additional filters (but override date range for "this weekend")
      const weekendFilters = filters ? { ...filters, dateRange: { from: saturday, to: sunday } } : filters;
      query = DiscoverVibeService.applyFilters(query, weekendFilters);
      
      const { data: events } = await query
        .order('event_date', { ascending: true })
        .limit(limit);

      return {
        events: (events || []) as JamBaseEvent[],
        title: 'This Weekend',
        description: `Events happening ${saturday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        totalCount: events?.length || 0,
      };
    } catch (error) {
      console.error('Error getting weekend events:', error);
      return {
        events: [],
        title: 'This Weekend',
        description: 'Unable to load weekend events.',
        totalCount: 0,
      };
    }
  }

  /**
   * Get events under $25
   */
  static async getUnder25(limit: number = 20, filters?: VibeFilters): Promise<VibeResult> {
    try {
      let query = supabase
        .from('events')
        .select('*')
        .or('price_min.lte.25,price_max.lte.25');
      
      query = DiscoverVibeService.applyFilters(query, filters);
      
      const { data: events } = await query
        .order('event_date', { ascending: true })
        .limit(limit);

      return {
        events: (events || []) as JamBaseEvent[],
        title: 'Under $25',
        description: 'Affordable shows under $25',
        totalCount: events?.length || 0,
      };
    } catch (error) {
      console.error('Error getting under $25 events:', error);
      return {
        events: [],
        title: 'Under $25',
        description: 'Unable to load affordable events.',
        totalCount: 0,
      };
    }
  }

  /**
   * Get events at small venues
   * Uses venues.maximum_attendee_capacity to filter for small venues (< 500 capacity)
   */
  static async getSmallVenues(limit: number = 20, filters?: VibeFilters): Promise<VibeResult> {
    try {
      // First, get small venue IDs from venues table (capacity < 500)
      // venue_jambase_id in events references venues.id (the UUID primary key)
      const { data: smallVenues } = await supabase
        .from('venues')
        .select('id')
        .not('maximum_attendee_capacity', 'is', null)
        .lt('maximum_attendee_capacity', 500)
        .limit(100);

      if (!smallVenues || smallVenues.length === 0) {
        return {
          events: [],
          title: 'Small Venues',
          description: 'Intimate shows at smaller venues',
          totalCount: 0,
        };
      }

      const smallVenueIds = smallVenues.map(v => v.id);

      // Now get events at these small venues
      // venue_jambase_id is the FK that references venues.id
      let query = supabase
        .from('events')
        .select('*')
        .in('venue_jambase_id', smallVenueIds);
      
      query = DiscoverVibeService.applyFilters(query, filters);
      
      const { data: events } = await query
        .order('event_date', { ascending: true })
        .limit(limit);

      return {
        events: (events || []) as JamBaseEvent[],
        title: 'Small Venues',
        description: 'Intimate shows at smaller venues (< 500 capacity)',
        totalCount: events?.length || 0,
      };
    } catch (error) {
      console.error('Error getting small venues:', error);
      return {
        events: [],
        title: 'Small Venues',
        description: 'Unable to load small venue events.',
        totalCount: 0,
      };
    }
  }

  /**
   * Get late shows (after 10 PM)
   * Filters by doors_time hour >= 22 using EXTRACT in the database
   */
  static async getLateShows(limit: number = 20, filters?: VibeFilters): Promise<VibeResult> {
    try {
      console.log('🎵 [VIBE] getLateShows - Starting');
      // Use raw SQL to filter by hour of doors_time
      // Supabase PostgREST doesn't have direct hour extraction, so we'll use a time range filter
      // Filter for doors_time >= 22:00 (10 PM) by using time component
      const today = new Date();
      const tenPM = new Date(today);
      tenPM.setHours(22, 0, 0, 0);
      
      let query = supabase
        .from('events')
        .select('*')
        .not('doors_time', 'is', null);
      
      // Note: Supabase PostgREST doesn't support EXTRACT directly in filters
      // We filter by fetching events and filtering in JS, but we can at least ensure doors_time exists
      query = DiscoverVibeService.applyFilters(query, filters);
      
      const { data: events } = await query
        .order('event_date', { ascending: true })
        .limit(limit * 3);

      console.log(`🎵 [VIBE] getLateShows - Fetched ${events?.length || 0} events with doors_time`);

      // Filter to events with doors time hour >= 22 (10 PM)
      // This requires JS filtering since PostgREST doesn't support EXTRACT(HOUR FROM doors_time)
      const lateEvents = (events || []).filter((e: any) => {
        if (!e.doors_time) return false;
        const doorsDate = new Date(e.doors_time);
        const isLate = doorsDate.getHours() >= 22; // 10 PM
        if (isLate) {
          console.log(`🎵 [VIBE] getLateShows - Found late show: ${e.title} at ${doorsDate.toLocaleTimeString()}`);
        }
        return isLate;
      }).slice(0, limit);

      console.log(`🎵 [VIBE] getLateShows - Filtered to ${lateEvents.length} late shows (doors_time >= 22:00)`);

      return {
        events: lateEvents as JamBaseEvent[],
        title: 'Late Shows',
        description: 'Shows starting after 10 PM',
        totalCount: lateEvents.length,
      };
    } catch (error) {
      console.error('Error getting late shows:', error);
      return {
        events: [],
        title: 'Late Shows',
        description: 'Unable to load late shows.',
        totalCount: 0,
      };
    }
  }

  /**
   * Get up-and-coming artists (artists with <10 reviews)
   */
  static async getUpAndComing(limit: number = 20, filters?: VibeFilters): Promise<VibeResult> {
    try {
      console.log('🎵 [VIBE] getUpAndComing - Starting');
      // Get artists with fewer reviews from recent reviews (last 180 days)
      const oneHundredEightyDaysAgo = new Date();
      oneHundredEightyDaysAgo.setDate(oneHundredEightyDaysAgo.getDate() - 180);
      console.log(`🎵 [VIBE] getUpAndComing - Using recency filter: last 180 days (since ${oneHundredEightyDaysAgo.toISOString()})`);
      
      const { data: artistReviews } = await supabase
        .from('reviews')
        .select('events:event_id(artist_name)')
        .eq('is_draft', false)
        .not('events.artist_name', 'is', null)
        .gte('created_at', oneHundredEightyDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(2000);

      console.log(`🎵 [VIBE] getUpAndComing - Fetched ${artistReviews?.length || 0} reviews from last 180 days`);

      const artistReviewCounts = new Map<string, number>();
      (artistReviews || []).forEach((r: any) => {
        const artistName = r.events?.artist_name;
        if (artistName) {
          artistReviewCounts.set(artistName, (artistReviewCounts.get(artistName) || 0) + 1);
        }
      });

      console.log(`🎵 [VIBE] getUpAndComing - Found ${artistReviewCounts.size} unique artists with reviews`);

      const upAndComingArtists = Array.from(artistReviewCounts.entries())
        .filter(([_, count]) => count < 10)
        .map(([name]) => name);

      console.log(`🎵 [VIBE] getUpAndComing - Found ${upAndComingArtists.length} artists with <10 reviews`);

      if (upAndComingArtists.length === 0) {
        return {
          events: [],
          title: 'Up-and-Coming Artists',
          description: 'Artists with fewer than 10 reviews',
          totalCount: 0,
        };
      }

      let query = supabase
        .from('events')
        .select('*')
        .in('artist_name', upAndComingArtists.slice(0, 50));
      
      query = DiscoverVibeService.applyFilters(query, filters);
      
      const { data: events } = await query
        .order('event_date', { ascending: true })
        .limit(limit);

      console.log(`🎵 [VIBE] getUpAndComing - Found ${events?.length || 0} events for up-and-coming artists`);
      return {
        events: (events || []) as JamBaseEvent[],
        title: 'Up-and-Coming Artists',
        description: 'Artists with fewer than 10 reviews - discover them early',
        totalCount: events?.length || 0,
      };
    } catch (error) {
      console.error('Error getting up-and-coming artists:', error);
      return {
        events: [],
        title: 'Up-and-Coming Artists',
        description: 'Unable to load up-and-coming artists.',
        totalCount: 0,
      };
    }
  }

  /**
   * Get events with less than 10 reviews
   */
  static async getLessThan10Reviews(limit: number = 20, filters?: VibeFilters): Promise<VibeResult> {
    try {
      console.log('🎵 [VIBE] getLessThan10Reviews - Starting');
      // Get review counts per event from recent reviews (last 180 days)
      const oneHundredEightyDaysAgo = new Date();
      oneHundredEightyDaysAgo.setDate(oneHundredEightyDaysAgo.getDate() - 180);
      console.log(`🎵 [VIBE] getLessThan10Reviews - Using recency filter: last 180 days (since ${oneHundredEightyDaysAgo.toISOString()})`);
      
      const { data: reviewCounts } = await supabase
        .from('reviews')
        .select('event_id')
        .eq('is_draft', false)
        .gte('created_at', oneHundredEightyDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(2000);

      console.log(`🎵 [VIBE] getLessThan10Reviews - Fetched ${reviewCounts?.length || 0} reviews from last 180 days`);

      const eventReviewCounts = new Map<string, number>();
      (reviewCounts || []).forEach((r: any) => {
        eventReviewCounts.set(r.event_id, (eventReviewCounts.get(r.event_id) || 0) + 1);
      });

      console.log(`🎵 [VIBE] getLessThan10Reviews - Found ${eventReviewCounts.size} unique events with reviews`);

      // Get events with less than 10 reviews
      let query = supabase
        .from('events')
        .select('*');
      
      query = DiscoverVibeService.applyFilters(query, filters);
      
      const { data: events } = await query
        .order('event_date', { ascending: true })
        .limit(limit * 2);

      const filteredEvents = (events || []).filter((e: any) => {
        const reviewCount = eventReviewCounts.get(e.id) || 0;
        return reviewCount < 10;
      }).slice(0, limit);

      console.log(`🎵 [VIBE] getLessThan10Reviews - Filtered to ${filteredEvents.length} events with <10 reviews`);
      return {
        events: filteredEvents as JamBaseEvent[],
        title: 'Events with <10 Reviews',
        description: 'Be among the first to review these shows',
        totalCount: filteredEvents.length,
      };
    } catch (error) {
      console.error('Error getting events with <10 reviews:', error);
      return {
        events: [],
        title: 'Events with <10 Reviews',
        description: 'Unable to load events.',
        totalCount: 0,
      };
    }
  }


  /**
   * Get highest-rated events this month
   */
  static async getHighestRatedMonth(limit: number = 20, filters?: VibeFilters): Promise<VibeResult> {
    try {
      console.log('🎵 [VIBE] getHighestRatedMonth - Starting');
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      console.log(`🎵 [VIBE] getHighestRatedMonth - Filtering reviews from ${startOfMonth.toISOString()} to ${endOfMonth.toISOString()}`);

      // Get event IDs with high ratings this month
      const { data: highRatedReviews } = await supabase
        .from('reviews')
        .select('event_id')
        .gte('rating', 4.5)
        .eq('is_draft', false)
        .gte('created_at', startOfMonth.toISOString())
        .lte('created_at', endOfMonth.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      console.log(`🎵 [VIBE] getHighestRatedMonth - Fetched ${highRatedReviews?.length || 0} reviews with rating >= 4.5 this month`);

      if (!highRatedReviews || highRatedReviews.length === 0) {
        return {
          events: [],
          title: 'Highest-Rated This Month',
          description: 'No highly rated events this month',
          totalCount: 0,
        };
      }

      const highRatedEventIds = [...new Set(highRatedReviews.map(r => r.event_id))];
      console.log(`🎵 [VIBE] getHighestRatedMonth - Found ${highRatedEventIds.length} unique events with rating >= 4.5 this month`);

      let query = supabase
        .from('events')
        .select('*')
        .gte('event_date', startOfMonth.toISOString())
        .lte('event_date', endOfMonth.toISOString())
        .in('id', highRatedEventIds);
      
      // Apply additional filters (but preserve month range)
      const monthFilters = filters ? {
        ...filters,
        dateRange: {
          from: filters.dateRange?.from && filters.dateRange.from > startOfMonth ? filters.dateRange.from : startOfMonth,
          to: filters.dateRange?.to && filters.dateRange.to < endOfMonth ? filters.dateRange.to : endOfMonth,
        },
      } : { dateRange: { from: startOfMonth, to: endOfMonth } };
      
      query = DiscoverVibeService.applyFilters(query, monthFilters);
      
      const { data: events } = await query
        .order('event_date', { ascending: true })
        .limit(limit);

      console.log(`🎵 [VIBE] getHighestRatedMonth - Found ${events?.length || 0} events matching filters`);

      // Deduplicate
      const eventMap = new Map<string, JamBaseEvent>();
      (events || []).forEach((e: any) => {
        if (!eventMap.has(e.id)) {
          eventMap.set(e.id, e);
        }
      });

      console.log(`🎵 [VIBE] getHighestRatedMonth - Returning ${eventMap.size} deduplicated events`);
      return {
        events: Array.from(eventMap.values()),
        title: 'Highest-Rated This Month',
        description: 'Events rated 4.5+ stars this month',
        totalCount: eventMap.size,
      };
    } catch (error) {
      console.error('Error getting highest-rated month:', error);
      return {
        events: [],
        title: 'Highest-Rated This Month',
        description: 'Unable to load highest-rated events.',
        totalCount: 0,
      };
    }
  }

  /**
   * Get best venues (by venue reviews)
   */
  static async getBestVenues(limit: number = 20, filters?: VibeFilters): Promise<VibeResult> {
    try {
      console.log('🎵 [VIBE] getBestVenues - Starting');
      // Get venues with high ratings from recent reviews (last 180 days)
      // Use venue_rating_new column (or venue_rating if decimal)
      const oneHundredEightyDaysAgo = new Date();
      oneHundredEightyDaysAgo.setDate(oneHundredEightyDaysAgo.getDate() - 180);
      console.log(`🎵 [VIBE] getBestVenues - Using recency filter: last 180 days (since ${oneHundredEightyDaysAgo.toISOString()})`);
      
      const { data: venueReviews } = await supabase
        .from('reviews')
        .select('event_id, venue_rating_new, venue_rating')
        .eq('is_draft', false)
        .gte('created_at', oneHundredEightyDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(1000);

      console.log(`🎵 [VIBE] getBestVenues - Fetched ${venueReviews?.length || 0} reviews from last 180 days`);

      if (!venueReviews || venueReviews.length === 0) {
        return {
          events: [],
          title: 'Best Venues',
          description: 'No highly rated venues found',
          totalCount: 0,
        };
      }

      // Filter reviews with ratings >= 4 (prefer venue_rating_new if available, fallback to venue_rating)
      const highRatedReviews = venueReviews.filter((r: any) => {
        const rating = r.venue_rating_new || r.venue_rating;
        return rating && rating >= 4;
      });

      console.log(`🎵 [VIBE] getBestVenues - Found ${highRatedReviews.length} reviews with rating >= 4`);

      if (highRatedReviews.length === 0) {
        console.log('🎵 [VIBE] getBestVenues - No high-rated reviews found, returning empty');
        return {
          events: [],
          title: 'Best Venues',
          description: 'No highly rated venues found',
          totalCount: 0,
        };
      }

      // Get event details to find venue IDs
      const eventIds = [...new Set(highRatedReviews.map((r: any) => r.event_id))];
      console.log(`🎵 [VIBE] getBestVenues - Found ${eventIds.length} unique events with high venue ratings`);
      
      const { data: eventsData } = await supabase
        .from('events')
        .select('id, venue_jambase_id, venue_name')
        .in('id', eventIds);

      console.log(`🎵 [VIBE] getBestVenues - Fetched ${eventsData?.length || 0} event details`);

      const venueRatings = new Map<string, { name: string; avgRating: number; count: number }>();
      const eventsMap = new Map((eventsData || []).map((e: any) => [e.id, e]));
      
      highRatedReviews.forEach((r: any) => {
        const event = eventsMap.get(r.event_id);
        if (!event) return;
        
        const venueId = event.venue_jambase_id;
        const venueName = event.venue_name;
        const rating = r.venue_rating_new || r.venue_rating;
        
        if (venueId && venueName && rating) {
          const existing = venueRatings.get(venueId) || { name: venueName, avgRating: 0, count: 0 };
          existing.avgRating = (existing.avgRating * existing.count + rating) / (existing.count + 1);
          existing.count += 1;
          venueRatings.set(venueId, existing);
        }
      });

      const topVenueIds = Array.from(venueRatings.entries())
        .sort(([_, a], [__, b]) => b.avgRating - a.avgRating)
        .slice(0, 20)
        .map(([id]) => id);

      if (topVenueIds.length === 0) {
        return {
          events: [],
          title: 'Best Venues',
          description: 'No highly rated venues found',
          totalCount: 0,
        };
      }

      let query = supabase
        .from('events')
        .select('*')
        .in('venue_jambase_id', topVenueIds);
      
      query = DiscoverVibeService.applyFilters(query, filters);
      
      const { data: events } = await query
        .order('event_date', { ascending: true })
        .limit(limit);

      console.log(`🎵 [VIBE] getBestVenues - Found ${events?.length || 0} events at best venues`);
      return {
        events: (events || []) as JamBaseEvent[],
        title: 'Best Venues',
        description: 'Events at venues rated 4+ stars',
        totalCount: events?.length || 0,
      };
    } catch (error) {
      console.error('Error getting best venues:', error);
      return {
        events: [],
        title: 'Best Venues',
        description: 'Unable to load best venue events.',
        totalCount: 0,
      };
    }
  }

  /**
   * Get best value-for-price events
   */
  static async getBestValue(limit: number = 20, filters?: VibeFilters): Promise<VibeResult> {
    try {
      console.log('🎵 [VIBE] getBestValue - Starting');
      // Get event IDs with high value ratings from recent reviews (last 90 days)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      console.log(`🎵 [VIBE] getBestValue - Using recency filter: last 90 days (since ${ninetyDaysAgo.toISOString()})`);
      
      const { data: highValueReviews } = await supabase
        .from('reviews')
        .select('event_id')
        .gte('value_rating', 4)
        .eq('is_draft', false)
        .not('value_rating', 'is', null)
        .gte('created_at', ninetyDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      console.log(`🎵 [VIBE] getBestValue - Fetched ${highValueReviews?.length || 0} reviews with value_rating >= 4 from last 90 days`);

      if (!highValueReviews || highValueReviews.length === 0) {
        console.log('🎵 [VIBE] getBestValue - No high-value reviews found, returning empty');
        return {
          events: [],
          title: 'Best Value',
          description: 'No high value events found',
          totalCount: 0,
        };
      }

      const highValueEventIds = [...new Set(highValueReviews.map(r => r.event_id))];
      console.log(`🎵 [VIBE] getBestValue - Found ${highValueEventIds.length} unique events with high value ratings`);

      let query = supabase
        .from('events')
        .select('*')
        .in('id', highValueEventIds);
      
      query = DiscoverVibeService.applyFilters(query, filters);
      
      const { data: events } = await query
        .order('event_date', { ascending: true })
        .limit(limit);

      console.log(`🎵 [VIBE] getBestValue - Found ${events?.length || 0} events matching filters`);

      // Deduplicate
      const eventMap = new Map<string, JamBaseEvent>();
      (events || []).forEach((e: any) => {
        if (!eventMap.has(e.id)) {
          eventMap.set(e.id, e);
        }
      });

      console.log(`🎵 [VIBE] getBestValue - Returning ${eventMap.size} deduplicated events`);
      return {
        events: Array.from(eventMap.values()),
        title: 'Best Value',
        description: 'Events rated highly for value-for-price',
        totalCount: eventMap.size,
      };
    } catch (error) {
      console.error('Error getting best value:', error);
      return {
        events: [],
        title: 'Best Value',
        description: 'Unable to load best value events.',
        totalCount: 0,
      };
    }
  }

  /**
   * Execute a vibe query
   */
  static async executeVibe(vibeType: VibeType, userId: string, limit: number = 20, filters?: VibeFilters): Promise<VibeResult> {
    console.log(`🎵 [VIBE] executeVibe - Executing vibe: ${vibeType} for user: ${userId}, limit: ${limit}`);
    if (filters) {
      console.log(`🎵 [VIBE] executeVibe - Filters:`, JSON.stringify(filters, null, 2));
    }
    switch (vibeType) {
      case 'similar-artists':
        return this.getSimilarArtists(userId, limit, filters);
      case 'last-5-attended':
        return this.getLast5Attended(userId, limit, filters);
      case 'similar-taste-users':
        return this.getSimilarTasteUsers(userId, limit, filters);
      case 'this-weekend':
        return this.getThisWeekend(limit, filters);
      case 'under-25':
        return this.getUnder25(limit, filters);
      case 'small-venues':
        return this.getSmallVenues(limit, filters);
      case 'late-shows':
        return this.getLateShows(limit, filters);
      case 'up-and-coming':
        return this.getUpAndComing(limit, filters);
      case 'less-than-10-reviews':
        return this.getLessThan10Reviews(limit, filters);
      case 'highest-rated-month':
        return this.getHighestRatedMonth(limit, filters);
      case 'best-venues':
        return this.getBestVenues(limit, filters);
      case 'best-value':
        return this.getBestValue(limit, filters);
      default:
        return {
          events: [],
          title: 'Unknown Vibe',
          description: 'Unknown vibe type',
          totalCount: 0,
        };
    }
  }
}

