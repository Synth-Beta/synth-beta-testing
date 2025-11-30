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
   * NOTE: Table user_streaming_stats_summary has been removed - this function now returns null
   */
  static async upsertStats(stats: UserStreamingStatsInsert): Promise<UserStreamingStatsSummary | null> {
    // Table has been removed - return null immediately to avoid 404 errors
    return null;
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
   * NOTE: Table user_streaming_stats_summary has been removed - this function now returns null
   */
  static async getStats(
    userId: string, 
    serviceType: 'spotify' | 'apple-music' = 'spotify',
    timeRange: TimeRange = 'all_time'
  ): Promise<UserStreamingStatsSummary | null> {
    // Table has been removed - return null immediately to avoid 404 errors
    return null;
  }

  /**
   * Get all time ranges for a user's streaming stats
   * NOTE: Table user_streaming_stats_summary has been removed - this function now returns empty array
   */
  static async getAllTimeRanges(
    userId: string,
    serviceType: 'spotify' | 'apple-music' = 'spotify'
  ): Promise<TimeRange[]> {
    // Table has been removed - return empty array immediately to avoid 404 errors
    return [];
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
   * NOTE: Table user_streaming_stats_summary has been removed - this function now returns true
   */
  static async deleteStats(userId: string, serviceType: 'spotify' | 'apple-music'): Promise<boolean> {
    // Table has been removed - return true immediately to avoid 404 errors
    return true;
  }

  /**
   * Get all streaming stats for a user
   * NOTE: Table user_streaming_stats_summary has been removed - this function now returns empty array
   */
  static async getAllStats(userId: string): Promise<UserStreamingStatsSummary[]> {
    // Table has been removed - return empty array immediately to avoid 404 errors
    return [];
  }
}
