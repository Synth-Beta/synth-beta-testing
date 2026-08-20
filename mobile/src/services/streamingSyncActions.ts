import { supabase } from '../integrations/supabase/client';
import { getExpoSiteUrl } from '../utils/siteUrl';
import {
  clearAutoSyncThrottle,
  markAutoSynced,
  shouldSkipServerSpotifySync,
  markNoServerSpotifyToken,
  clearNoServerSpotifyTokenCache,
} from './streamingAutoSyncStorage';
import {
  hasNonEmptyPerRangeData,
  streamingProfileNeedsTrackResync,
  countPerRangeItems,
} from '@synth/shared';
import { authenticateSpotifyInApp } from './spotifyAuthService';

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
  usedServer?: boolean;
  counts?: { artists: number; tracks: number };
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

function parseApiSuccessBody(
  text: string
): { counts?: { artists: number; tracks: number } } {
  try {
    const parsed = JSON.parse(text) as {
      counts?: { artists?: number; tracks?: number };
    };
    if (!parsed?.counts) return {};
    const artists = Number(parsed.counts.artists);
    const tracks = Number(parsed.counts.tracks);
    if (!Number.isFinite(artists) || !Number.isFinite(tracks)) return {};
    return { counts: { artists, tracks } };
  } catch {
    return {};
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

/** Matches Streaming Stats UI: per-range tracks required when artists have per-range data. */
function profileSyncComplete(profileData: Record<string, unknown> | null): boolean {
  if (!profileData) return false;
  if (streamingProfileNeedsTrackResync(profileData)) return false;
  return profileHasTracks(profileData);
}

function getProfileSyncCounts(
  profileData: Record<string, unknown> | null
): { artists: number; tracks: number } {
  if (!profileData) return { artists: 0, tracks: 0 };
  const artistsFromRange = countPerRangeItems(profileData, 'topArtistsByTimeRange');
  const tracksFromRange = countPerRangeItems(profileData, 'topTracksByTimeRange');
  const flatArtists = Array.isArray(profileData.topArtists) ? profileData.topArtists.length : 0;
  const flatTracks = Array.isArray(profileData.topTracks) ? profileData.topTracks.length : 0;
  return {
    artists: artistsFromRange > 0 ? artistsFromRange : flatArtists,
    tracks: tracksFromRange > 0 ? tracksFromRange : flatTracks,
  };
}

function logSyncResult(detail: Record<string, unknown>): void {
  console.info('[streaming-sync]', detail);
}

export function formatStreamingSyncCountLine(
  counts?: { artists: number; tracks: number }
): string | null {
  if (!counts) return null;
  return `${counts.artists} artist${counts.artists === 1 ? '' : 's'}, ${counts.tracks} song${counts.tracks === 1 ? '' : 's'} in your profile.`;
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

/**
 * Appends the current Supabase session to a join.getsynth.app URL as a hash fragment
 * (never sent to the server, unlike query params — matches the #access_token= convention
 * DeepLinkHandlerInner already reads in src/App.tsx). Without this, WebBrowser.openBrowserAsync
 * opens a completely fresh browser context with no Synth login, so the web page's own auth
 * check never resolves a user and the page spins on "Loading your stats..." forever.
 */
export async function withSessionHash(url: string): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token || !session?.refresh_token) return url;
  const hash = `access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}`;
  return `${url}#${hash}`;
}

/** Deep link for one-time web connect when no stored refresh token exists. */
export async function buildExpoSpotifyConnectUrl(): Promise<string> {
  const base = `${getExpoSiteUrl()}/streaming-stats`;
  return withSessionHash(`${base}?connect=${encodeURIComponent('spotify')}&source=expo&action=resync`);
}

/** Web OAuth with forced consent — re-grant track permissions after partial sync. */
export async function buildExpoSpotifyReconnectUrl(): Promise<string> {
  const base = `${getExpoSiteUrl()}/streaming-stats`;
  return withSessionHash(`${base}?connect=${encodeURIComponent('spotify')}&source=expo&reconnect=1`);
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
    const successBody = parseApiSuccessBody(text);

    if (response.status === 404 && body.error === 'no_stored_token') {
      return {
        ok: false,
        skipped: 'no-stored-token',
        message:
          'One-time setup: connect Spotify on the web to save your token, then resync works in the app.',
        usedServer: true,
      };
    }

    if (response.status === 422 && body.error === 'tracks_empty') {
      return {
        ok: false,
        skipped: 'partial-sync',
        message: body.message || TRACKS_RECONNECT_MESSAGE,
        usedServer: true,
        counts: successBody.counts,
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        skipped: 'sync-failed',
        message: body.error || body.message || `Sync failed (${response.status})`,
        usedServer: true,
      };
    }

    return { ok: true, usedServer: true, counts: successBody.counts };
  } catch (error) {
    return {
      ok: false,
      skipped: 'error',
      message: error instanceof Error ? error.message : 'Sync failed',
      usedServer: true,
    };
  }
}

export interface SyncStreamingProfileOptions {
  manual?: boolean;
}

/**
 * In-app Spotify resync. Tries the server sync first; if no stored token exists and this is a
 * manual resync, runs in-app Spotify OAuth to acquire + persist a refresh token, then retries
 * the server sync. This avoids ever opening a Safari tab just to sync.
 *
 * Apple Music still requires the web OAuth flow.
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

  const isManual = options?.manual ?? false;
  if (isManual) {
    await clearAutoSyncThrottle(userId);
    await clearNoServerSpotifyTokenCache(userId);
  }

  let profileData = await fetchSpotifyProfileData(userId);
  let complete = profileSyncComplete(profileData);
  let serverResult: StreamingSyncResult = { ok: false };
  let syncRan = false;

  const shouldCallServer =
    isManual || !complete ? isManual || !(await shouldSkipServerSpotifySync(userId)) : false;

  if (shouldCallServer) {
    serverResult = await requestServerSpotifySync();
    syncRan = serverResult.ok;

    // If the server says no stored token and this is a manual resync, try in-app OAuth to
    // acquire + persist the token, then immediately retry the server sync.
    if (serverResult.skipped === 'no-stored-token' && isManual) {
      const authResult = await authenticateSpotifyInApp();
      if (authResult.ok) {
        // Token persisted by authenticateSpotifyInApp — retry server sync.
        await clearNoServerSpotifyTokenCache(userId);
        serverResult = await requestServerSpotifySync();
        syncRan = serverResult.ok;
      } else if (!authResult.cancelled) {
        // OAuth failed for a real reason — surface it.
        return {
          ok: false,
          skipped: 'error',
          message: authResult.error,
          counts: getProfileSyncCounts(profileData),
        };
      } else {
        // User cancelled the OAuth prompt.
        return {
          ok: false,
          skipped: 'no-stored-token',
          message: 'Spotify sign-in was cancelled. Tap Sync again to try.',
          counts: getProfileSyncCounts(profileData),
        };
      }
    } else if (serverResult.skipped === 'no-stored-token') {
      await markNoServerSpotifyToken(userId);
    } else if (serverResult.ok) {
      await clearNoServerSpotifyTokenCache(userId);
    }

    profileData = await fetchSpotifyProfileData(userId);
    complete = profileSyncComplete(profileData);
  }

  const counts = serverResult.counts ?? getProfileSyncCounts(profileData);
  const needsTrackResync = streamingProfileNeedsTrackResync(profileData);

  if (complete && (syncRan || !isManual)) {
    await markAutoSynced(userId);
    await refreshFeedAfterStreamingSync(userId);
    logSyncResult({
      ok: true,
      manual: isManual,
      usedServer: serverResult.ok,
      needsTrackResync,
      syncRan,
      counts,
    });
    return { ok: true, usedServer: serverResult.ok, counts };
  }

  if (complete && isManual && !syncRan) {
    const noRefreshMessage =
      'Could not reach Spotify. Tap Sync again — if it keeps failing, use Reconnect on web.';
    logSyncResult({
      ok: false,
      manual: true,
      skipped: 'no-stored-token',
      syncRan: false,
      counts,
      message: noRefreshMessage,
    });
    return {
      ok: false,
      skipped: 'no-stored-token',
      usedServer: false,
      counts,
      message: noRefreshMessage,
    };
  }

  const partialMessage =
    serverResult.skipped === 'partial-sync'
      ? serverResult.message || TRACKS_RECONNECT_MESSAGE
      : needsTrackResync
        ? TRACKS_RECONNECT_MESSAGE
        : serverResult.message || 'Could not refresh Spotify stats. Tap Sync again to retry.';

  logSyncResult({
    ok: false,
    manual: isManual,
    skipped:
      needsTrackResync || serverResult.skipped === 'partial-sync'
        ? 'partial-sync'
        : serverResult.skipped ?? 'sync-failed',
    usedServer: serverResult.ok,
    needsTrackResync,
    syncRan,
    counts,
    message: partialMessage,
  });

  if (serverResult.skipped === 'no-stored-token' && !needsTrackResync) {
    return {
      ok: false,
      skipped: 'no-stored-token',
      message: partialMessage,
      usedServer: true,
      counts,
    };
  }

  if (needsTrackResync || serverResult.skipped === 'partial-sync') {
    return {
      ok: false,
      skipped: 'partial-sync',
      message: partialMessage,
      usedServer: serverResult.ok,
      counts,
    };
  }

  return {
    ok: false,
    skipped: 'sync-failed',
    message: partialMessage,
    usedServer: serverResult.ok,
    counts,
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

  const { error: tokenError } = await supabase
    .from('spotify_user_tokens')
    .delete()
    .eq('user_id', userId);

  if (tokenError) throw tokenError;
}
