/**
 * Reads a user's streaming stats from the tables that are ACTUALLY populated:
 *   - streaming_profiles → raw top artists + listening hours
 *   - user_preferences  → canonicalized top genres (populated by DB triggers after sync)
 *
 * The old `user_streaming_stats` table was dropped; this replaces that read.
 */
import type { SynthSupabaseClient } from './supabaseClientType';

export interface UserStreamingStatsSnapshot {
  top_artists: Array<{ name: string; popularity: number }>;
  top_genres: Array<{ genre: string; count: number }>;
  total_listening_hours: number;
}

const EMPTY: UserStreamingStatsSnapshot = {
  top_artists: [],
  top_genres: [],
  total_listening_hours: 0,
};

/** Estimate listening hours from a topTracks array (each track has duration_ms). */
function estimateHours(topTracks: any[]): number {
  if (!Array.isArray(topTracks) || topTracks.length === 0) return 0;
  const avgMs =
    topTracks.reduce((acc, t) => acc + (Number(t?.duration_ms) || 0), 0) /
    topTracks.length;
  // Assume ~20 full plays per top-track rank on average — rough but consistent
  const totalMs = avgMs * topTracks.length * 20;
  return Math.round(totalMs / 3_600_000);
}

/** Pull artists out of profile_data in order: medium_term → short_term → flat list */
function extractTopArtists(
  profileData: any,
  limit = 25
): Array<{ name: string; popularity: number }> {
  if (!profileData || typeof profileData !== 'object') return [];

  const byRange = profileData.topArtistsByTimeRange;
  const list: any[] =
    byRange?.medium_term ??
    byRange?.short_term ??
    byRange?.long_term ??
    profileData.topArtists ??
    [];

  return list
    .slice(0, limit)
    .map((a: any) => ({
      name: String(a?.name || a?.attributes?.name || '').trim(),
      popularity: Number(a?.popularity ?? 0),
    }))
    .filter((a) => a.name);
}

/** Convert user_preferences.genre_preference_scores to [{genre, count}] */
function scorestoGenreList(
  scores: Record<string, number> | null | undefined,
  topGenres: string[] | null | undefined,
  limit = 20
): Array<{ genre: string; count: number }> {
  if (scores && typeof scores === 'object' && Object.keys(scores).length > 0) {
    return Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([genre, score]) => ({ genre, count: Math.round(score) }));
  }
  if (Array.isArray(topGenres) && topGenres.length > 0) {
    return topGenres
      .slice(0, limit)
      .map((genre, i) => ({ genre, count: limit - i }));
  }
  return [];
}

export async function fetchUserStreamingStatsSnapshot(
  client: SynthSupabaseClient,
  userId: string
): Promise<UserStreamingStatsSnapshot | null> {
  try {
    // Read both sources in parallel
    const [profileRes, prefsRes] = await Promise.all([
      client
        .from('streaming_profiles')
        .select('profile_data, service_type')
        .eq('user_id', userId)
        .order('last_updated', { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from('user_preferences')
        .select('genre_preference_scores, top_genres')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    const profileData = profileRes.data?.profile_data ?? null;
    const prefs = prefsRes.data ?? null;

    const topArtists = extractTopArtists(profileData, 25);
    const topGenres = scorestoGenreList(
      prefs?.genre_preference_scores as Record<string, number> | null,
      prefs?.top_genres as string[] | null
    );
    const totalListeningHours = estimateHours(
      profileData?.topTracks ?? profileData?.topArtistsByTimeRange?.medium_term ?? []
    );

    // If we have nothing at all, return EMPTY so the UI shows "syncing" state
    if (topArtists.length === 0 && topGenres.length === 0 && totalListeningHours === 0) {
      return { ...EMPTY };
    }

    return { top_artists: topArtists, top_genres: topGenres, total_listening_hours: totalListeningHours };
  } catch (error) {
    console.error('[synth-shared] fetchUserStreamingStatsSnapshot:', error);
    return null;
  }
}
