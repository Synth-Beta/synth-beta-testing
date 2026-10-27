import type { SynthSupabaseClient } from './supabaseClientType';
import {
  fetchUserStreamingStatsSnapshot,
  type UserStreamingStatsSnapshot,
} from './streamingStatsCore';
import { streamingRowHasData } from './spotifySyncGuard';

export type StreamingProvider = 'spotify' | 'apple-music' | 'lastfm' | 'spotify-export' | 'unknown';

/** Order used when a user has several sources and no profile URL decides. */
const PROVIDER_PRIORITY: StreamingProvider[] = ['spotify', 'apple-music', 'lastfm', 'spotify-export'];

export const STREAMING_PROVIDER_LABELS: Record<Exclude<StreamingProvider, 'unknown'>, string> = {
  spotify: 'Spotify',
  'apple-music': 'Apple Music',
  lastfm: 'Last.fm',
  'spotify-export': 'Spotify (uploaded data)',
};

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
  if (v.includes('last.fm/user/')) return 'lastfm';
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
    client
      .from('streaming_profiles')
      .select('service_type, a0:profile_data->topArtists->0, t0:profile_data->topTracks->0, me:profile_data->userProfile')
      .eq('user_id', userId),
    fetchUserStreamingStatsSnapshot(client, userId),
  ]);

  const profileUrl = userRow?.music_streaming_profile ?? null;
  const providerFromUrl = detectProviderFromProfileUrl(profileUrl);

  const serviceTypes = new Set(
    ((streamingRows ?? []) as Array<{ service_type?: unknown; a0?: unknown; t0?: unknown; me?: unknown }>)
      .filter(streamingRowHasData)
      .map((r) => String(r.service_type ?? ''))
  );
  // The profile URL wins when a row backs it; otherwise the first source with data (an
  // export user can still carry an old Spotify URL from a failed Spotify connect).
  const rowProvider = PROVIDER_PRIORITY.find((p) => serviceTypes.has(p)) ?? 'unknown';
  const provider: StreamingProvider =
    providerFromUrl !== 'unknown' && serviceTypes.has(providerFromUrl)
      ? providerFromUrl
      : rowProvider !== 'unknown'
        ? rowProvider
        : providerFromUrl;

  const hasStats = hasAnyStatsSnapshot(statsSnapshot);

  const linked = provider !== 'unknown' && (serviceTypes.has(provider) || hasStats);

  return {
    linked,
    provider: linked ? provider : 'unknown',
    profileUrl: linked ? profileUrl : null,
  };
}
