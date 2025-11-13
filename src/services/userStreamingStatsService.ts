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
   * Upsert user streaming stats summary
   */
  static async upsertStats(stats: UserStreamingStatsInsert): Promise<UserStreamingStatsSummary | null> {
    try {
      // Check if stats already exist
      const { data: existingStats, error: checkError } = await supabase
        .from('user_streaming_stats_summary')
        .select('id')
        .eq('user_id', stats.user_id)
        .eq('service_type', stats.service_type)
        .single();
      
      // Handle table not found error
      if (checkError && checkError.code === 'PGRST205') {
        console.warn('Table user_streaming_stats_summary does not exist. Please run the migration.');
        return null;
      }
      
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
          if (error.code === 'PGRST205') {
            console.warn('Table user_streaming_stats_summary does not exist. Please run the migration.');
            return null;
          }
          console.error('Error updating user streaming stats:', error);
          return null;
        }
        data = updatedData;
      } else {
        // Insert new stats (PGRST116 means no rows found, which is expected)
        const { data: insertedData, error } = await supabase
          .from('user_streaming_stats_summary')
          .insert(stats)
          .select()
          .single();
        
        if (error) {
          if (error.code === 'PGRST205') {
            console.warn('Table user_streaming_stats_summary does not exist. Please run the migration.');
            return null;
          }
          console.error('Error inserting user streaming stats:', error);
          return null;
        }
        data = insertedData;
      }

      return data;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'PGRST205') {
        return null;
      }
      console.error('Error in upsertStats:', error);
      return null;
    }
  }

  /**
   * Get date threshold for a time range
   */
  private static getDateThreshold(timeRange: TimeRange): Date | null {
    const now = new Date();
    switch (timeRange) {
      case 'last_day':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case 'last_week':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'last_month':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case 'last_3_months':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      case 'last_6_months':
        return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      case 'last_year':
        return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      case 'last_3_years':
        return new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000);
      case 'last_5_years':
        return new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000);
      case 'all_time':
        return null; // No filtering
      default:
        return null;
    }
  }

  /**
   * Filter stats by date range using recently_played timestamps
   */
  private static filterStatsByDateRange(
    stats: UserStreamingStatsSummary,
    timeRange: TimeRange
  ): UserStreamingStatsSummary {
    const threshold = this.getDateThreshold(timeRange);
    if (!threshold) {
      return stats; // No filtering needed for all_time
    }

    // Start with top_tracks from API if available (they're already ranked and filtered by API time range)
    // Then filter by recently_played timestamps to get tracks in the specific sub-range
    let filteredTracks: any[] = [];
    
    if (stats.top_tracks && stats.top_tracks.length > 0) {
      // Use top_tracks as base (they're already ranked by API)
      filteredTracks = stats.top_tracks.map(track => ({ ...track }));
    }

    // Filter recently played tracks by date to get play counts for the specific time range
    const filteredRecentlyPlayed = (stats.recently_played || []).filter((item: any) => {
      if (!item.played_at) return false;
      try {
        const playedAt = new Date(item.played_at);
        return playedAt >= threshold;
      } catch {
        return false;
      }
    });

    // Build maps of tracks and artists that appear in the filtered time range
    const trackPlayCounts = new Map<string, number>();
    const artistPlayCounts = new Map<string, number>();
    const trackMap = new Map<string, any>();

    // Count plays for tracks and artists in the filtered time range from recently_played
    filteredRecentlyPlayed.forEach((item: any) => {
      const trackId = item.id || item.track?.id;
      const trackName = item.name || item.track?.name;
      const artistName = item.artist || item.track?.artists?.[0]?.name;
      
      if (trackId || trackName) {
        const key = trackId || trackName;
        trackPlayCounts.set(key, (trackPlayCounts.get(key) || 0) + 1);
        
        if (!trackMap.has(key)) {
          trackMap.set(key, {
            id: trackId,
            name: trackName,
            artist: artistName,
            popularity: item.popularity || item.track?.popularity || 0,
            duration_ms: item.duration_ms || item.track?.duration_ms
          });
        }
      }
      
      if (artistName) {
        artistPlayCounts.set(artistName, (artistPlayCounts.get(artistName) || 0) + 1);
      }
    });

    // Merge top_tracks with recently_played data
    // Prioritize tracks that appear in both, ranked by play count from recently_played
    const mergedTracks = new Map<string, any>();
    
    // First, add all tracks from recently_played (they have actual play counts)
    trackMap.forEach((track, key) => {
      mergedTracks.set(key, {
        ...track,
        playCount: trackPlayCounts.get(key) || 0
      });
    });
    
    // Then add top_tracks that aren't in recently_played (they're API-ranked)
    filteredTracks.forEach((track, index) => {
      const key = track.id || track.name;
      if (key && !mergedTracks.has(key)) {
        mergedTracks.set(key, {
          ...track,
          playCount: Math.max(1, 50 - index) // Give API tracks a base score
        });
      } else if (key && mergedTracks.has(key)) {
        // Track exists in both - keep the higher play count
        const existing = mergedTracks.get(key);
        existing.playCount = Math.max(existing.playCount || 0, Math.max(1, 50 - index));
      }
    });

    // Sort by play count and return top 50
    filteredTracks = Array.from(mergedTracks.values())
      .sort((a, b) => {
        // Sort by play count first, then by popularity
        if (b.playCount !== a.playCount) {
          return b.playCount - a.playCount;
        }
        return (b.popularity || 0) - (a.popularity || 0);
      })
      .slice(0, 50)
      .map(({ playCount, ...track }) => track); // Remove playCount from output

    // Filter top artists - prioritize those that appear in filtered recently played
    // But also include top artists from the original list (they're already ranked)
    const filteredArtists = stats.top_artists
      .map(artist => ({
        ...artist,
        playCount: artistPlayCounts.get(artist.name) || 0
      }))
      .sort((a, b) => {
        // Sort by play count first, then by original popularity
        if (b.playCount !== a.playCount) {
          return b.playCount - a.playCount;
        }
        return (b.popularity || 0) - (a.popularity || 0);
      })
      .slice(0, 50);

    // Filter genres - count how many filtered artists belong to each genre
    const genreCounts = new Map<string, number>();
    filteredArtists.forEach(artist => {
      // Note: We don't have genre info in the filtered artists, so we'll use the original genre counts
      // but this is a limitation - ideally we'd have genre info per artist
    });

    // Use original genres but adjust counts based on filtered artists
    const filteredGenres = stats.top_genres.map(genre => ({
      ...genre,
      // Keep original count as approximation
    }));

    // Recalculate stats based on filtered data
    const uniqueArtists = new Set(filteredArtists.map((a: any) => a.id || a.name)).size;
    const totalTracks = filteredTracks.length;

    return {
      ...stats,
      top_artists: filteredArtists.map(({ playCount, ...artist }) => artist), // Remove playCount from output
      top_tracks: filteredTracks, // Already has playCount removed
      recently_played: filteredRecentlyPlayed,
      top_genres: filteredGenres,
      unique_artists: uniqueArtists,
      total_tracks: totalTracks
    };
  }

  /**
   * Get user streaming stats summary for a specific time range
   * For ranges not directly from API (day, week, 3yr), filters data from all_time
   */
  static async getStats(
    userId: string, 
    serviceType: 'spotify' | 'apple-music' = 'spotify',
    timeRange: TimeRange = 'all_time'
  ): Promise<UserStreamingStatsSummary | null> {
    try {
      // Map time ranges to API-supported ranges
      // Spotify API supports: short_term (last month), medium_term (last 6 months), long_term (all time)
      const apiRangeMap: Record<TimeRange, 'last_month' | 'last_6_months' | 'all_time'> = {
        'last_day': 'last_month', // Use last_month data, filter client-side
        'last_week': 'last_month',
        'last_month': 'last_month',
        'last_3_months': 'last_6_months',
        'last_6_months': 'last_6_months',
        'last_year': 'all_time',
        'last_3_years': 'all_time',
        'last_5_years': 'all_time',
        'all_time': 'all_time'
      };

      const apiRange = apiRangeMap[timeRange];
      
      // Try to get stats for the API range first
      const { data, error } = await supabase
        .from('user_streaming_stats_summary')
        .select('*')
        .eq('user_id', userId)
        .eq('service_type', serviceType)
        .eq('time_range', apiRange)
        .single();

      if (error) {
        // PGRST205 means table doesn't exist - handle gracefully
        if (error.code === 'PGRST205') {
          console.warn('Table user_streaming_stats_summary does not exist. Please run the migration.');
          return null;
        }
        // PGRST116 means no rows found - try all_time as fallback
        if (error.code === 'PGRST116') {
          // Try all_time as fallback
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('user_streaming_stats_summary')
            .select('*')
            .eq('user_id', userId)
            .eq('service_type', serviceType)
            .eq('time_range', 'all_time')
            .single();

          if (fallbackError || !fallbackData) {
            return null;
          }

          // Filter the all_time data for the requested range
          if (timeRange !== 'all_time') {
            return this.filterStatsByDateRange(fallbackData, timeRange);
          }
          return fallbackData;
        }
        // Only log other errors
        console.error('Error fetching user streaming stats:', error);
        return null;
      }

      if (!data) return null;

      // Always apply filtering if the requested range is different from the API range
      // This handles cases like:
      // - last_day/week (sub-ranges of last_month)
      // - last_year/3yr/5yr (sub-ranges of all_time)
      // - last_3_months (sub-range of last_6_months)
      if (timeRange !== apiRange) {
        return this.filterStatsByDateRange(data, timeRange);
      }

      // For exact matches (e.g., last_month -> last_month, all_time -> all_time), return as-is
      return data;
    } catch (error) {
      // Silently handle table not found errors
      if (error && typeof error === 'object' && 'code' in error && error.code === 'PGRST205') {
        return null;
      }
      console.error('Error in getStats:', error);
      return null;
    }
  }

  /**
   * Get all time ranges for a user's streaming stats
   */
  static async getAllTimeRanges(
    userId: string,
    serviceType: 'spotify' | 'apple-music' = 'spotify'
  ): Promise<TimeRange[]> {
    try {
      const { data, error } = await supabase
        .from('user_streaming_stats_summary')
        .select('time_range')
        .eq('user_id', userId)
        .eq('service_type', serviceType)
        .not('time_range', 'is', null);

      if (error) {
        if (error.code === 'PGRST205') {
          return [];
        }
        console.error('Error fetching time ranges:', error);
        return [];
      }

      return (data?.map(d => d.time_range).filter(Boolean) as TimeRange[]) || [];
    } catch (error) {
      return [];
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
   * Process Spotify data and create comprehensive summary
   */
  static processSpotifyData(
    userId: string,
    topArtists: SpotifyArtist[],
    topTracks: any[],
    recentlyPlayed?: any[],
    timeRange: TimeRange = 'all_time'
  ): UserStreamingStatsInsert {
    // Process top artists with full data
    const processedArtists = topArtists.map(artist => ({
      name: artist.name,
      popularity: artist.popularity || 0,
      id: artist.id
    }));

    // Process top tracks with full data
    const processedTracks = topTracks.map(track => ({
      name: track.name,
      artist: track.artists?.[0]?.name || 'Unknown Artist',
      popularity: track.popularity || 0,
      id: track.id,
      duration_ms: track.duration_ms
    }));

    // Extract albums from tracks
    const albumMap = new Map<string, { name: string; artist: string; id: string }>();
    topTracks.forEach(track => {
      if (track.album && !albumMap.has(track.album.id)) {
        albumMap.set(track.album.id, {
          name: track.album.name,
          artist: track.artists?.[0]?.name || 'Unknown Artist',
          id: track.album.id
        });
      }
    });
    const processedAlbums = Array.from(albumMap.values());

    // Process recently played
    const processedRecentlyPlayed = recentlyPlayed?.map(item => ({
      name: item.track?.name || item.name || 'Unknown Track',
      artist: item.track?.artists?.[0]?.name || item.artist || 'Unknown Artist',
      played_at: item.played_at || item.playedAt || new Date().toISOString(),
      id: item.track?.id || item.id
    })) || [];

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
      .slice(0, 50); // Top 50 genres

    // Calculate comprehensive stats
    const totalTracks = topTracks.length;
    const uniqueArtists = new Set(topArtists.map(a => a.id)).size;
    
    // Calculate listening hours from track durations
    const totalDurationMs = topTracks.reduce((sum, track) => sum + (track.duration_ms || 0), 0);
    const totalListeningHours = totalDurationMs / (1000 * 60 * 60);

    // Calculate average popularity
    const avgTrackPopularity = topTracks.length > 0
      ? topTracks.reduce((sum, t) => sum + (t.popularity || 0), 0) / topTracks.length
      : 0;
    const avgArtistPopularity = topArtists.length > 0
      ? topArtists.reduce((sum, a) => sum + (a.popularity || 0), 0) / topArtists.length
      : 0;

    // Find most played artist and track
    const artistPlayCounts: Record<string, number> = {};
    topTracks.forEach(track => {
      track.artists?.forEach(artist => {
        artistPlayCounts[artist.id] = (artistPlayCounts[artist.id] || 0) + 1;
      });
    });
    const mostPlayedArtistId = Object.entries(artistPlayCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    const mostPlayedArtist = topArtists.find(a => a.id === mostPlayedArtistId)?.name;

    const trackPlayCounts: Record<string, number> = {};
    topTracks.forEach(track => {
      trackPlayCounts[track.id] = (trackPlayCounts[track.id] || 0) + 1;
    });
    const mostPlayedTrackId = Object.entries(trackPlayCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    const mostPlayedTrack = topTracks.find(t => t.id === mostPlayedTrackId)?.name;

    return {
      user_id: userId,
      service_type: 'spotify',
      time_range: timeRange,
      top_artists: processedArtists,
      top_genres: processedGenres,
      top_tracks: processedTracks,
      top_albums: processedAlbums,
      recently_played: processedRecentlyPlayed,
      total_tracks: totalTracks,
      unique_artists: uniqueArtists,
      total_listening_hours: Math.round(totalListeningHours * 100) / 100,
      total_albums: processedAlbums.length,
      avg_track_popularity: Math.round(avgTrackPopularity * 100) / 100,
      avg_artist_popularity: Math.round(avgArtistPopularity * 100) / 100,
      most_played_artist: mostPlayedArtist,
      most_played_track: mostPlayedTrack
    };
  }

  /**
   * Sync Spotify data to user streaming stats for a specific time range
   */
  static async syncSpotifyData(
    userId: string,
    topArtists: SpotifyArtist[],
    topTracks: any[],
    recentlyPlayed?: any[],
    timeRange: TimeRange = 'all_time'
  ): Promise<UserStreamingStatsSummary | null> {
    try {
      const processedData = this.processSpotifyData(userId, topArtists, topTracks, recentlyPlayed, timeRange);
      return await this.upsertStats(processedData);
    } catch (error) {
      console.error('Error syncing Spotify data:', error);
      return null;
    }
  }

  /**
   * Sync comprehensive Spotify data for all time ranges
   */
  static async syncComprehensiveSpotifyData(
    userId: string,
    dataByTimeRange: {
      short_term: { artists: SpotifyArtist[]; tracks: any[]; recentlyPlayed?: any[] };
      medium_term: { artists: SpotifyArtist[]; tracks: any[]; recentlyPlayed?: any[] };
      long_term: { artists: SpotifyArtist[]; tracks: any[]; recentlyPlayed?: any[] };
    }
  ): Promise<UserStreamingStatsSummary[]> {
    const results: UserStreamingStatsSummary[] = [];
    
    // Map Spotify time ranges to our time ranges
    // short_term (last month) -> last_month
    // medium_term (last 6 months) -> last_6_months  
    // long_term (all time) -> all_time
    const timeRangeMap: Record<string, { spotify: 'short_term' | 'medium_term' | 'long_term'; our: TimeRange }> = {
      last_month: { spotify: 'short_term', our: 'last_month' },
      last_6_months: { spotify: 'medium_term', our: 'last_6_months' },
      all_time: { spotify: 'long_term', our: 'all_time' }
    };

    // Sync each time range
    for (const [ourRange, { spotify }] of Object.entries(timeRangeMap)) {
      const data = dataByTimeRange[spotify];
      if (data) {
        const result = await this.syncSpotifyData(
          userId,
          data.artists,
          data.tracks,
          data.recentlyPlayed,
          ourRange as TimeRange
        );
        if (result) results.push(result);
      }
    }

    return results;
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
