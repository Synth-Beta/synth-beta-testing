import type { SynthSupabaseClient } from './supabaseClientType';
import {
  fetchUserStreamingStatsSnapshot,
  type UserStreamingStatsSnapshot,
} from './streamingStatsCore';

export type StreamingProvider = 'spotify' | 'apple-music' | 'unknown';

export interface StreamingLinkStatus {
  linked: boolean;
  provider: StreamingProvider;
  profileUrl?: string | null;
}

function detectProviderFromProfileUrl(profileUrl: string | null | undefined): StreamingProvider {
  if (!profileUrl) return 'unknown';
  const v = String(profileUrl).trim().toLowerCase();
  if (!v) return 'unknown';

  if (v.includes('spotify.com') || v.includes('open.spotify') || v.startsWith('spotify:')) {
    return 'spotify';
  }
  if (v.includes('music.apple.com') || v.includes('apple.com/music') || v.includes('applemusic')) {
    return 'apple-music';
  }
  return 'unknown';
}

function hasAnyStatsSnapshot(snapshot: UserStreamingStatsSnapshot | null): boolean {
  if (!snapshot) return false;
  const topArtists = Array.isArray(snapshot.top_artists) ? snapshot.top_artists.length : 0;
  const topGenres = Array.isArray(snapshot.top_genres) ? snapshot.top_genres.length : 0;
  const hours =
    typeof snapshot.total_listening_hours === 'number' ? snapshot.total_listening_hours : 0;
  return topArtists > 0 || topGenres > 0 || hours > 0;
}

/**
 * Shared source of truth for "is streaming linked?" across web and mobile.
 * Uses Supabase evidence (profile URL, streaming_profiles rows, cached stats) —
 * not browser-local OAuth tokens.
 */
export async function getStreamingLinkStatus(
  client: SynthSupabaseClient,
  userId: string
): Promise<StreamingLinkStatus> {
  const [{ data: userRow }, { data: streamingRows }, statsSnapshot] = await Promise.all([
    client.from('users').select('music_streaming_profile').eq('user_id', userId).maybeSingle(),
    client.from('streaming_profiles').select('service_type').eq('user_id', userId),
    fetchUserStreamingStatsSnapshot(client, userId),
  ]);

  const profileUrl = userRow?.music_streaming_profile ?? null;
  const providerFromUrl = detectProviderFromProfileUrl(profileUrl);

  const serviceTypes = new Set(
    (streamingRows ?? []).map((r: { service_type?: unknown }) => String(r.service_type ?? ''))
  );
  const hasSpotifyRow = serviceTypes.has('spotify');
  const hasAppleRow = serviceTypes.has('apple-music');

  const provider: StreamingProvider =
    providerFromUrl !== 'unknown'
      ? providerFromUrl
      : hasSpotifyRow
        ? 'spotify'
        : hasAppleRow
          ? 'apple-music'
          : 'unknown';

  const hasStats = hasAnyStatsSnapshot(statsSnapshot);

  const hasProviderRow =
    provider === 'spotify' ? hasSpotifyRow : provider === 'apple-music' ? hasAppleRow : false;

  const linked = provider !== 'unknown' && (hasProviderRow || hasStats);

  return {
    linked,
    provider: linked ? provider : 'unknown',
    profileUrl: linked ? profileUrl : null,
  };
}
