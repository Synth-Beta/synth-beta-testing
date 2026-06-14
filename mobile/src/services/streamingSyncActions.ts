import { supabase } from '../integrations/supabase/client';
import { getExpoSiteUrl } from '../utils/siteUrl';
import {
  clearAutoSyncThrottle,
  markAutoSynced,
} from './streamingAutoSyncStorage';
import {
  hasNonEmptyPerRangeData,
  streamingProfileNeedsTrackResync,
} from '@synth/shared';

export const STREAMING_AUTO_SYNC_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export type StreamingSyncResult = {
  ok: boolean;
  skipped?:
    | 'no-session'
    | 'no-stored-token'
    | 'sync-failed'
    | 'partial-sync'
    | 'error'
    | 'not-configured'
    | 'apple-music-web-only';
  message?: string;
};

const TRACKS_RECONNECT_MESSAGE =
  'Your artists synced but songs are missing. Connect on the web, disconnect and reconnect Spotify to grant track permissions (user-top-read), then resync here.';

function parseApiErrorBody(text: string): Record<string, string> {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') out[key] = value;
    }
    return out;
  } catch {
    if (text.trim().startsWith('<')) {
      return { error: 'Server sync returned an HTML error page.' };
    }
    return text ? { error: text.slice(0, 200) } : {};
  }
}

async function fetchSpotifyProfileData(
  userId: string
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from('streaming_profiles')
    .select('profile_data')
    .eq('user_id', userId)
    .eq('service_type', 'spotify')
    .maybeSingle();

  return (data?.profile_data as Record<string, unknown> | null) ?? null;
}

function profileHasTracks(profileData: Record<string, unknown> | null): boolean {
  if (!profileData) return false;
  if (hasNonEmptyPerRangeData(profileData, 'topTracksByTimeRange')) return true;
  const flat = profileData.topTracks;
  return Array.isArray(flat) && flat.length > 0;
}

async function refreshFeedAfterStreamingSync(userId: string): Promise<void> {
  const { error: refreshError } = await supabase.rpc('refresh_user_preferences_v5', {
    p_user_id: userId,
  });
  if (refreshError) {
    console.warn('refresh_user_preferences_v5 after streaming sync:', refreshError.message);
  }

  const { error: cacheError } = await supabase.rpc('invalidate_personalized_feed_cache', {
    p_user_id: userId,
  });
  if (cacheError) {
    console.warn('invalidate_personalized_feed_cache after streaming sync:', cacheError.message);
  }
}

/** Deep link for one-time web connect when no stored refresh token exists. */
export function buildExpoSpotifyConnectUrl(): string {
  const base = `${getExpoSiteUrl()}/streaming-stats`;
  return `${base}?connect=${encodeURIComponent('spotify')}&source=expo&action=resync`;
}

function hasPerRangeBucket(
  profileData: Record<string, unknown> | null | undefined,
  field: string
): boolean {
  const byRange = profileData?.[field];
  if (!byRange || typeof byRange !== 'object') return false;
  const record = byRange as Record<string, unknown>;
  return ['short_term', 'medium_term', 'long_term'].some(
    (key) => Array.isArray(record[key]) && (record[key] as unknown[]).length > 0
  );
}

/** When linked Spotify data should be refreshed (stale, empty, or missing song periods). */
export function shouldRefreshStreamingProfile(params: {
  profileData: Record<string, unknown> | null;
  lastSynced: string | null;
}): boolean {
  if (!params.lastSynced) return true;

  if (streamingProfileNeedsTrackResync(params.profileData)) return true;

  const artistsHaveRanges = hasPerRangeBucket(params.profileData, 'topArtistsByTimeRange');
  const songsHaveRanges = hasPerRangeBucket(params.profileData, 'topTracksByTimeRange');
  if (artistsHaveRanges && !songsHaveRanges) return true;

  const ageMs = Date.now() - new Date(params.lastSynced).getTime();
  return Number.isFinite(ageMs) && ageMs >= STREAMING_AUTO_SYNC_STALE_MS;
}

export async function requestServerSpotifySync(): Promise<StreamingSyncResult> {
  const base = getExpoSiteUrl();
  const { data } = await supabase.auth.getSession();
  const accessToken = data?.session?.access_token;

  if (!accessToken) {
    return { ok: false, skipped: 'no-session', message: 'Not signed in' };
  }

  try {
    const response = await fetch(`${base}/api/spotify/sync-profile`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const text = await response.text();
    const body = parseApiErrorBody(text);

    if (response.status === 404 && body.error === 'no_stored_token') {
      return {
        ok: false,
        skipped: 'no-stored-token',
        message:
          'One-time setup: connect Spotify on the web to save your token, then resync works in the app.',
      };
    }

    if (response.status === 422 && body.error === 'tracks_empty') {
      return {
        ok: false,
        skipped: 'partial-sync',
        message: body.message || TRACKS_RECONNECT_MESSAGE,
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        skipped: 'sync-failed',
        message: body.error || body.message || `Sync failed (${response.status})`,
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      skipped: 'error',
      message: error instanceof Error ? error.message : 'Sync failed',
    };
  }
}

export interface SyncStreamingProfileOptions {
  manual?: boolean;
}

/**
 * In-app Spotify resync (no browser). Apple Music still requires the web OAuth flow.
 */
export async function syncStreamingProfile(
  userId: string,
  serviceType: 'spotify' | 'apple-music',
  options?: SyncStreamingProfileOptions
): Promise<StreamingSyncResult> {
  if (serviceType === 'apple-music') {
    return {
      ok: false,
      skipped: 'apple-music-web-only',
      message: 'Apple Music sync opens in your browser once.',
    };
  }

  if (options?.manual) {
    await clearAutoSyncThrottle(userId);
  }

  const serverResult = await requestServerSpotifySync();

  const profileData = await fetchSpotifyProfileData(userId);
  const tracksOk = profileHasTracks(profileData);

  if (tracksOk) {
    await markAutoSynced(userId);
    await refreshFeedAfterStreamingSync(userId);
    return { ok: true };
  }

  if (serverResult.skipped === 'no-stored-token') {
    return serverResult;
  }

  if (serverResult.skipped === 'partial-sync' || streamingProfileNeedsTrackResync(profileData)) {
    return {
      ok: false,
      skipped: 'partial-sync',
      message: serverResult.message || TRACKS_RECONNECT_MESSAGE,
    };
  }

  if (!serverResult.ok) {
    return serverResult;
  }

  return {
    ok: false,
    skipped: 'partial-sync',
    message: TRACKS_RECONNECT_MESSAGE,
  };
}

export async function disconnectStreamingAccount(userId: string): Promise<void> {
  const { error: userError } = await supabase
    .from('users')
    .update({
      music_streaming_profile: null,
      music_streaming_service: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (userError) throw userError;

  const { error: profileError } = await supabase
    .from('streaming_profiles')
    .delete()
    .eq('user_id', userId);

  if (profileError) throw profileError;
}
