import { supabase } from '@/integrations/supabase/client';
import { LocationService, LocationSearchParams } from './locationService';
import { spotifyService } from './spotifyService';
import { UserStreamingStatsService, UserTopArtist } from './userStreamingStatsService';
import { SpotifyArtist, SpotifyTimeRange } from '@/types/spotify';

export interface SimpleRecommendedEvent {
  id: string;
  jambase_event_id?: string;
  title: string;
  artist_name: string;
  artist_id?: string;
  venue_name: string;
  venue_id?: string;
  event_date: string;
  doors_time?: string;
  description?: string;
  genres?: string[];
  venue_address?: string;
  venue_city: string;
  venue_state: string;
  venue_zip?: string;
  latitude?: number;
  longitude?: number;
  ticket_available?: boolean;
  price_range?: string;
  ticket_urls?: string[];
  setlist?: any[];
  tour_name?: string;
  created_at: string;
  updated_at: string;
  recommendationScore: number;
  recommendationReason: string;
  matchedArtist?: string;
  distance?: number;
}

export interface SimpleRecommendationParams {
  userId: string;
  userLocation?: { latitude: number; longitude: number };
  radius?: number; // in miles
  limit?: number;
  maxDaysAhead?: number; // maximum days in the future to look for events
}

export interface SimpleRecommendationResult {
  events: SimpleRecommendedEvent[];
  totalFound: number;
  hasLocationData: boolean;
  fallbackUsed: boolean;
  recommendationSource: 'location_based' | 'top_artists_fallback';
  error?: string;
}

export class SimpleEventRecommendationService {
  
  /**
   * Get personalized event recommendations based on user's streaming stats
   */
  static async getRecommendedEvents(params: SimpleRecommendationParams): Promise<SimpleRecommendationResult> {
    const {
      userId,
      userLocation,
      radius = 50,
      limit = 10,
      maxDaysAhead = 90
    } = params;

    console.log('🎯 Getting event recommendations for user:', userId);

    try {
      // First, try to get user's top artists from the database
      console.log('🎵 Fetching user\'s top artists from database...');
      const topArtists = await UserStreamingStatsService.getTopArtistsForRecommendations(userId, 'spotify', 10);

      if (topArtists.length === 0) {
        console.log('📭 No top artists found in database, trying to sync from Spotify...');
        
        // Try to sync data from Spotify if user is authenticated
        if (spotifyService.isAuthenticated()) {
          console.log('🔄 Syncing Spotify data to database...');
          try {
            const [topArtistsResponse, topTracksResponse] = await Promise.all([
              spotifyService.getTopArtists('short_term', 20),
              spotifyService.getTopTracks('short_term', 50)
            ]);

            // Sync to database
            const syncedStats = await UserStreamingStatsService.syncSpotifyData(
              userId,
              topArtistsResponse.items,
              topTracksResponse.items
            );

            if (syncedStats) {
              console.log('✅ Successfully synced Spotify data to database');
              // Try again to get top artists
              const newTopArtists = await UserStreamingStatsService.getTopArtistsForRecommendations(userId, 'spotify', 10);
              if (newTopArtists.length > 0) {
                return await this.getRecommendationsWithArtists(userId, newTopArtists, userLocation, radius, limit, maxDaysAhead);
              }
            }
          } catch (syncError) {
            console.error('❌ Error syncing Spotify data:', syncError);
          }
        }

        return {
          events: [],
          totalFound: 0,
          hasLocationData: !!userLocation,
          fallbackUsed: true,
          recommendationSource: 'top_artists_fallback',
          error: 'No streaming data available. Please connect your Spotify account and sync your data.'
        };
      }

      console.log(`🎵 Found ${topArtists.length} top artists from database`);

      return await this.getRecommendationsWithArtists(userId, topArtists, userLocation, radius, limit, maxDaysAhead);

    } catch (error) {
      console.error('❌ Error getting recommendations:', error);
      
      return {
        events: [],
        totalFound: 0,
        hasLocationData: !!userLocation,
        fallbackUsed: true,
        recommendationSource: 'top_artists_fallback',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Get recommendations using the provided top artists
   */
  private static async getRecommendationsWithArtists(
    userId: string,
    topArtists: UserTopArtist[],
    userLocation: { latitude: number; longitude: number } | undefined,
    radius: number,
    limit: number,
    maxDaysAhead: number
  ): Promise<SimpleRecommendationResult> {
    // First, try location-based recommendations
    if (userLocation) {
      console.log('📍 Attempting location-based recommendations...');
      const locationResult = await this.getLocationBasedRecommendations({
        topArtists,
        userLocation,
        radius,
        limit,
        maxDaysAhead
      });

      if (locationResult.events.length > 0) {
        console.log(`✅ Found ${locationResult.events.length} location-based recommendations`);
        return locationResult;
      }

      console.log('⚠️ No location-based recommendations found, trying fallback...');
    }

    // Fallback: Get top 3 artists' upcoming shows
    console.log('🎵 Using fallback: top 3 artists upcoming shows');
    const fallbackResult = await this.getTopArtistsFallbackRecommendations({
      topArtists: topArtists.slice(0, 3),
      limit,
      maxDaysAhead
    });

    console.log(`✅ Found ${fallbackResult.events.length} fallback recommendations`);
    return fallbackResult;
  }

  /**
   * Get location-based recommendations using user's Spotify top artists
   */
  private static async getLocationBasedRecommendations(params: {
    topArtists: SpotifyArtist[];
    userLocation: { latitude: number; longitude: number };
    radius: number;
    limit: number;
    maxDaysAhead: number;
  }): Promise<SimpleRecommendationResult> {
    const { topArtists, userLocation, radius, limit, maxDaysAhead } = params;

    try {
      // Get events near user's location
      const locationParams: LocationSearchParams = {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        radius,
        limit: limit * 3, // Get more events to filter by artists
        endDate: new Date(Date.now() + maxDaysAhead * 24 * 60 * 60 * 1000).toISOString()
      };

      const nearbyEvents = await LocationService.searchEventsByLocation(locationParams);
      console.log(`📍 Found ${nearbyEvents.length} events near user location`);

      // Filter events by user's top artists and calculate recommendation scores
      const recommendedEvents = this.scoreAndFilterEvents(nearbyEvents, topArtists, limit);

      return {
        events: recommendedEvents,
        totalFound: recommendedEvents.length,
        hasLocationData: true,
        fallbackUsed: false,
        recommendationSource: 'location_based'
      };

    } catch (error) {
      console.error('❌ Error in location-based recommendations:', error);
      throw error;
    }
  }

  /**
   * Fallback: Get recommendations based on top artists' upcoming shows
   */
  private static async getTopArtistsFallbackRecommendations(params: {
    topArtists: SpotifyArtist[];
    limit: number;
    maxDaysAhead: number;
  }): Promise<SimpleRecommendationResult> {
    const { topArtists, limit, maxDaysAhead } = params;

    try {
      console.log(`🎵 Using top ${topArtists.length} artists for fallback recommendations`);

      const allEvents: SimpleRecommendedEvent[] = [];
      const endDate = new Date(Date.now() + maxDaysAhead * 24 * 60 * 60 * 1000).toISOString();

      // Search for events for each top artist
      for (const artist of topArtists) {
        try {
          console.log(`🔍 Searching events for artist: ${artist.name}`);
          
          // Search for events by artist name from database
          const { data: artistEventsData } = await supabase
            .from('events')
            .select('*')
            .ilike('artist_name', `%${artist.name}%`)
            .gte('event_date', new Date().toISOString())
            .order('event_date', { ascending: true })
            .limit(10);
          const artistEvents = artistEventsData || [];
          
          // Filter to upcoming events only
          const upcomingEvents = artistEvents.filter(event => {
            const eventDate = new Date(event.event_date);
            const now = new Date();
            const maxDate = new Date(endDate);
            return eventDate >= now && eventDate <= maxDate;
          });

          console.log(`✅ Found ${upcomingEvents.length} upcoming events for ${artist.name}`);

          // Transform to recommended events with scores
          const recommendedArtistEvents: SimpleRecommendedEvent[] = upcomingEvents.map(event => ({
            ...event,
            recommendationScore: this.calculateArtistMatchScore(artist, event),
            recommendationReason: `Based on your Spotify listening - you love ${artist.name}`,
            matchedArtist: artist.name,
            distance: undefined // No distance for fallback
          }));

          allEvents.push(...recommendedArtistEvents);

        } catch (artistError) {
          console.error(`❌ Error searching events for artist ${artist.name}:`, artistError);
          // Continue with other artists
        }
      }

      // Sort by recommendation score and limit results
      const sortedEvents = allEvents
        .sort((a, b) => b.recommendationScore - a.recommendationScore)
        .slice(0, limit);

      return {
        events: sortedEvents,
        totalFound: sortedEvents.length,
        hasLocationData: false,
        fallbackUsed: true,
        recommendationSource: 'top_artists_fallback'
      };

    } catch (error) {
      console.error('❌ Error in fallback recommendations:', error);
      throw error;
    }
  }

  /**
   * Score and filter events based on user's top artists
   */
  private static scoreAndFilterEvents(
    events: any[],
    topArtists: SpotifyArtist[],
    limit: number
  ): SimpleRecommendedEvent[] {
    const artistNames = topArtists.map(artist => artist.name.toLowerCase());
    
    const scoredEvents = events
      .map(event => {
        const eventArtist = event.artist_name?.toLowerCase() || '';
        
        // Find matching artist in user's top artists
        const matchingArtist = topArtists.find(artist => 
          artist.name.toLowerCase() === eventArtist ||
          eventArtist.includes(artist.name.toLowerCase()) ||
          artist.name.toLowerCase().includes(eventArtist)
        );

        if (!matchingArtist) {
          return null; // Skip events that don't match user's top artists
        }

        // Calculate recommendation score
        const baseScore = matchingArtist.popularity || 50;
        const timeBonus = this.calculateTimeBonus(event.event_date);
        const distancePenalty = event.distance ? Math.max(0, 10 - (event.distance / 5)) : 10;
        
        const recommendationScore = baseScore + timeBonus + distancePenalty;

        return {
          ...event,
          recommendationScore,
          recommendationReason: `Based on your Spotify listening - you love ${matchingArtist.name}`,
          matchedArtist: matchingArtist.name,
          distance: event.distance
        } as SimpleRecommendedEvent;
      })
      .filter(event => event !== null)
      .sort((a, b) => b!.recommendationScore - a!.recommendationScore)
      .slice(0, limit);

    return scoredEvents as SimpleRecommendedEvent[];
  }

  /**
   * Calculate score bonus based on how soon the event is
   */
  private static calculateTimeBonus(eventDate: string): number {
    const eventTime = new Date(eventDate).getTime();
    const now = new Date().getTime();
    const daysUntilEvent = (eventTime - now) / (1000 * 60 * 60 * 24);

    // Prefer events in the next 30 days
    if (daysUntilEvent <= 7) return 20;
    if (daysUntilEvent <= 14) return 15;
    if (daysUntilEvent <= 30) return 10;
    if (daysUntilEvent <= 60) return 5;
    return 0;
  }

  /**
   * Calculate match score for artist-based recommendations
   */
  private static calculateArtistMatchScore(artist: SpotifyArtist, event: any): number {
    const baseScore = artist.popularity || 50;
    const timeBonus = this.calculateTimeBonus(event.event_date);
    
    // Bonus for exact artist name match
    const exactMatch = artist.name.toLowerCase() === event.artist_name?.toLowerCase();
    const matchBonus = exactMatch ? 15 : 5;

    return baseScore + timeBonus + matchBonus;
  }

  /**
   * Get recommendation explanation for a specific event
   */
  static getRecommendationExplanation(event: SimpleRecommendedEvent): string {
    if (event.recommendationReason) {
      return event.recommendationReason;
    }

    if (event.matchedArtist) {
      return `Recommended because you listen to ${event.matchedArtist}`;
    }

    if (event.distance) {
      return `Recommended event near you (${Math.round(event.distance)} miles away)`;
    }

    return 'Recommended for you';
  }

  /**
   * Check if user has Spotify data available for recommendations
   */
  static async hasSpotifyData(): Promise<boolean> {
    try {
      return spotifyService.isAuthenticated();
    } catch (error) {
      console.error('Error checking Spotify data:', error);
      return false;
    }
  }

  /**
   * Get user's top artists for display purposes
   */
  static async getUserTopArtists(limit: number = 5): Promise<SpotifyArtist[]> {
    try {
      if (!spotifyService.isAuthenticated()) {
        return [];
      }
      
      const response = await spotifyService.getTopArtists('short_term', limit);
      return response.items;
    } catch (error) {
      console.error('Error getting user top artists:', error);
      return [];
    }
  }

  /**
   * Get recommendation cache key for a user
   */
  static getRecommendationCacheKey(userLocation?: { latitude: number; longitude: number }): string {
    const locationKey = userLocation 
      ? `${Math.round(userLocation.latitude * 100)}_${Math.round(userLocation.longitude * 100)}`
      : 'no_location';
    
    return `simple_recommendations_${locationKey}`;
  }

  /**
   * Cache recommendations for a short period (5 minutes)
   */
  static cacheRecommendations(key: string, recommendations: SimpleRecommendationResult): void {
    try {
      const cacheData = {
        data: recommendations,
        timestamp: Date.now(),
        expiresIn: 5 * 60 * 1000 // 5 minutes
      };
      localStorage.setItem(key, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Error caching recommendations:', error);
    }
  }

  /**
   * Get cached recommendations if still valid
   */
  static getCachedRecommendations(key: string): SimpleRecommendationResult | null {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const cacheData = JSON.parse(cached);
      const now = Date.now();

      if (now - cacheData.timestamp > cacheData.expiresIn) {
        localStorage.removeItem(key);
        return null;
      }

      return cacheData.data;
    } catch (error) {
      console.error('Error getting cached recommendations:', error);
      return null;
    }
  }
}
