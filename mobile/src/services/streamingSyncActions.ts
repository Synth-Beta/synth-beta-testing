import { supabase } from '../integrations/supabase/client';
import { getExpoSiteUrl } from '../utils/siteUrl';
import { clearAutoSyncThrottle } from './streamingAutoSyncService';

export const STREAMING_AUTO_SYNC_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export type StreamingSyncResult = {
  ok: boolean;
  skipped?: 'no-session' | 'no-stored-token' | 'sync-failed' | 'error' | 'not-configured' | 'apple-music-web-only';
  message?: string;
};

function hasPerRangeBucket(
  profileData: Record<string, unknown> | null | undefined,
  field: string
): boolean {
  const byRange = profileData?.[field];
  if (!byRange || typeof byRange !== 'object') return false;
  const record = byRange as Record<string, unknown>;
  return ['short_term', 'medium_term', 'long_term'].some((key) => Array.isArray(record[key]));
}

/** When linked Spotify data should be refreshed (stale, empty, or missing song periods). */
export function shouldRefreshStreamingProfile(params: {
  profileData: Record<string, unknown> | null;
  lastSynced: string | null;
}): boolean {
  if (!params.lastSynced) return true;

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

    const body = await response.json().catch(() => ({}));

    if (response.status === 404 && body.error === 'no_stored_token') {
      return {
        ok: false,
        skipped: 'no-stored-token',
        message: 'Connect Spotify once on the web to enable in-app sync.',
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

  void userId;
  return requestServerSpotifySync();
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
