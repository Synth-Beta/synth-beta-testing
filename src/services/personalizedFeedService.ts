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
  interested_count?: number;
  friends_interested_count?: number;
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
   * Get personalized events feed sorted by hidden relevance score
   * Score ranges from 0-100 based on music preferences
   */
  static async getPersonalizedFeed(
    userId: string,
    limit: number = 50,
    offset: number = 0,
    includePast: boolean = false
  ): Promise<PersonalizedEvent[]> {
    try {
      console.log('🎯 Fetching personalized feed for user:', userId);
      
      const { data, error } = await supabase.rpc('get_personalized_events_feed', {
        p_user_id: userId,
        p_limit: limit,
        p_offset: offset,
        p_include_past: includePast
      });
      
      if (error) {
        console.error('❌ Personalized feed error:', error);
        return this.getFallbackFeed(userId, limit, offset, includePast);
      }
      
      if (!data || !Array.isArray(data)) {
        console.warn('⚠️ No personalized feed data returned');
        return this.getFallbackFeed(userId, limit, offset, includePast);
      }
      
      console.log('✅ Personalized feed loaded:', {
        count: data.length,
        topScore: data[0]?.relevance_score,
        hasScores: data[0]?.relevance_score !== undefined
      });
      
      return data.map((row: any) => ({
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
        relevance_score: row.relevance_score, // HIDDEN - only for internal sorting
        user_is_interested: row.user_is_interested,
        interested_count: row.interested_count,
        friends_interested_count: row.friends_interested_count
      } as PersonalizedEvent));
    } catch (error) {
      console.error('❌ Exception in personalized feed:', error);
      return this.getFallbackFeed(userId, limit, offset, includePast);
    }
  }
  
  /**
   * Fallback: non-personalized feed if no preference data exists
   */
  private static async getFallbackFeed(
    userId: string,
    limit: number,
    offset: number,
    includePast: boolean
  ): Promise<PersonalizedEvent[]> {
    try {
      console.log('⚠️ Using fallback feed (no personalization)');
      
      let query = supabase
        .from('jambase_events')
        .select('*');
      
      if (!includePast) {
        query = query.gte('event_date', new Date().toISOString());
      }
      
      const { data, error } = await query
        .order('event_date', { ascending: true })
        .range(offset, offset + limit - 1);
      
      if (error) throw error;
      
      return (data || []).map(event => ({
        ...event,
        relevance_score: 0,
        user_is_interested: false,
        interested_count: 0,
        friends_interested_count: 0
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

