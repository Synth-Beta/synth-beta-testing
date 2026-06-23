import { supabase } from '../integrations/supabase/client';
import { SpotifyArtist } from '../types/spotify';

export type TimeRange = 'last_day' | 'last_week' | 'last_month' | 'last_3_months' | 'last_6_months' | 'last_year' | 'last_3_years' | 'last_5_years' | 'all_time';

export interface UserStreamingStatsSummary {
  id: string;
  user_id: string;
  service_type: 'spotify' | 'apple-music';
  time_range?: TimeRange;
  top_artists: Array<{
    name: string;
    popularity: number;
    id?: string;
  }>;
  top_genres: Array<{
    genre: string;
    count: number;
  }>;
  top_tracks?: Array<{
    name: string;
    artist: string;
    popularity: number;
    id?: string;
    duration_ms?: number;
  }>;
  top_albums?: Array<{
    name: string;
    artist: string;
    id?: string;
  }>;
  recently_played?: Array<{
    name: string;
    artist: string;
    played_at: string;
    id?: string;
  }>;
  total_tracks: number;
  unique_artists: number;
  total_listening_hours: number;
  total_albums?: number;
  avg_track_popularity?: number;
  avg_artist_popularity?: number;
  most_played_artist?: string;
  most_played_track?: string;
  last_updated: string;
  created_at: string;
}

export interface UserStreamingStatsInsert {
  user_id: string;
  service_type: 'spotify' | 'apple-music';
  time_range?: TimeRange;
  top_artists: Array<{
    name: string;
    popularity: number;
    id?: string;
  }>;
  top_genres: Array<{
    genre: string;
    count: number;
  }>;
  top_tracks?: Array<{
    name: string;
    artist: string;
    popularity: number;
    id?: string;
    duration_ms?: number;
  }>;
  top_albums?: Array<{
    name: string;
    artist: string;
    id?: string;
  }>;
  recently_played?: Array<{
    name: string;
    artist: string;
    played_at: string;
    id?: string;
  }>;
  total_tracks: number;
  unique_artists: number;
  total_listening_hours: number;
  total_albums?: number;
  avg_track_popularity?: number;
  avg_artist_popularity?: number;
  most_played_artist?: string;
  most_played_track?: string;
}

export interface UserTopArtist {
  artist_name: string;
  popularity_score: number;
  service_type: string;
}

export class UserStreamingStatsService {

  /**
   * Get user's top artists for recommendations
   */
  static async getTopArtistsForRecommendations(
    userId: string, 
    serviceType: 'spotify' | 'apple-music' = 'spotify',
    limit: number = 10
  ): Promise<UserTopArtist[]> {
    try {
      const { data, error } = await supabase
        .rpc('get_user_top_artists_for_recommendations', {
          user_uuid: userId,
          service: serviceType,
          limit_count: limit
        });

      if (error) {
        console.error('Error fetching top artists for recommendations:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getTopArtistsForRecommendations:', error);
      return [];
    }
  }

}
