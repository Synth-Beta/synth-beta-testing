import { supabase } from '../integrations/supabase/client';
import { SpotifyArtist } from '../types/spotify';

export interface UserStreamingStatsSummary {
  id: string;
  user_id: string;
  service_type: 'spotify' | 'apple-music';
  top_artists: Array<{
    name: string;
    popularity: number;
    id?: string;
  }>;
  top_genres: Array<{
    genre: string;
    count: number;
  }>;
  total_tracks: number;
  unique_artists: number;
  total_listening_hours: number;
  last_updated: string;
  created_at: string;
}

export interface UserStreamingStatsInsert {
  user_id: string;
  service_type: 'spotify' | 'apple-music';
  top_artists: Array<{
    name: string;
    popularity: number;
    id?: string;
  }>;
  top_genres: Array<{
    genre: string;
    count: number;
  }>;
  total_tracks: number;
  unique_artists: number;
  total_listening_hours: number;
}

export interface UserTopArtist {
  artist_name: string;
  popularity_score: number;
  service_type: string;
}

export class UserStreamingStatsService {
  /**
   * Upsert user streaming stats summary
   */
  static async upsertStats(stats: UserStreamingStatsInsert): Promise<UserStreamingStatsSummary | null> {
    try {
      // Check if stats already exist
      const { data: existingStats } = await supabase
        .from('user_streaming_stats_summary')
        .select('id')
        .eq('user_id', stats.user_id)
        .eq('service_type', stats.service_type)
        .single();
      
      let data;
      if (existingStats) {
        // Update existing stats
        const { data: updatedData, error } = await supabase
          .from('user_streaming_stats_summary')
          .update(stats)
          .eq('id', existingStats.id)
          .select()
          .single();
        
        if (error) {
          console.error('Error updating user streaming stats:', error);
          return null;
        }
        data = updatedData;
      } else {
        // Insert new stats
        const { data: insertedData, error } = await supabase
          .from('user_streaming_stats_summary')
          .insert(stats)
          .select()
          .single();
        
        if (error) {
          console.error('Error inserting user streaming stats:', error);
          return null;
        }
        data = insertedData;
      }

      return data;
    } catch (error) {
      console.error('Error in upsertStats:', error);
      return null;
    }
  }

  /**
   * Get user streaming stats summary
   */
  static async getStats(userId: string, serviceType: 'spotify' | 'apple-music' = 'spotify'): Promise<UserStreamingStatsSummary | null> {
    try {
      const { data, error } = await supabase
        .from('user_streaming_stats_summary')
        .select('*')
        .eq('user_id', userId)
        .eq('service_type', serviceType)
        .single();

      if (error) {
        console.error('Error fetching user streaming stats:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in getStats:', error);
      return null;
    }
  }

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

  /**
   * Check if user has streaming stats data
   */
  static async hasStreamingStats(userId: string, serviceType: 'spotify' | 'apple-music' = 'spotify'): Promise<boolean> {
    try {
      const stats = await this.getStats(userId, serviceType);
      return stats !== null && stats.top_artists.length > 0;
    } catch (error) {
      console.error('Error checking streaming stats:', error);
      return false;
    }
  }

  /**
   * Process Spotify data and create summary
   */
  static processSpotifyData(
    userId: string,
    topArtists: SpotifyArtist[],
    topTracks: any[]
  ): UserStreamingStatsInsert {
    // Process top artists
    const processedArtists = topArtists.map(artist => ({
      name: artist.name,
      popularity: artist.popularity || 0,
      id: artist.id
    }));

    // Extract and count genres
    const genreCount: Record<string, number> = {};
    topArtists.forEach(artist => {
      artist.genres?.forEach(genre => {
        genreCount[genre] = (genreCount[genre] || 0) + 1;
      });
    });

    const processedGenres = Object.entries(genreCount)
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20); // Top 20 genres

    // Calculate listening hours (rough estimate)
    const totalTracks = topTracks.length;
    const avgTrackDuration = 3.5; // minutes
    const totalListeningHours = (totalTracks * avgTrackDuration) / 60;

    return {
      user_id: userId,
      service_type: 'spotify',
      top_artists: processedArtists,
      top_genres: processedGenres,
      total_tracks: totalTracks,
      unique_artists: processedArtists.length,
      total_listening_hours: Math.round(totalListeningHours * 100) / 100
    };
  }

  /**
   * Sync Spotify data to user streaming stats
   */
  static async syncSpotifyData(
    userId: string,
    topArtists: SpotifyArtist[],
    topTracks: any[]
  ): Promise<UserStreamingStatsSummary | null> {
    try {
      const processedData = this.processSpotifyData(userId, topArtists, topTracks);
      return await this.upsertStats(processedData);
    } catch (error) {
      console.error('Error syncing Spotify data:', error);
      return null;
    }
  }

  /**
   * Delete user streaming stats
   */
  static async deleteStats(userId: string, serviceType: 'spotify' | 'apple-music'): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_streaming_stats_summary')
        .delete()
        .eq('user_id', userId)
        .eq('service_type', serviceType);

      if (error) {
        console.error('Error deleting user streaming stats:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in deleteStats:', error);
      return false;
    }
  }

  /**
   * Get all streaming stats for a user
   */
  static async getAllStats(userId: string): Promise<UserStreamingStatsSummary[]> {
    try {
      const { data, error } = await supabase
        .from('user_streaming_stats_summary')
        .select('*')
        .eq('user_id', userId)
        .order('service_type', { ascending: true });

      if (error) {
        console.error('Error fetching all user streaming stats:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getAllStats:', error);
      return [];
    }
  }
}
