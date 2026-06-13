import { supabase } from '@/integrations/supabase/client';
import { getApiBaseUrl } from '@/utils/apiBaseUrl';
import { spotifyService } from '@/services/spotifyService';
import { appleMusicService } from '@/services/appleMusicService';
import { streamingSyncService } from '@/services/streamingSyncService';
import {
  markAutoSynced,
  clearAutoSyncThrottle,
} from '@/services/streamingAutoSyncService';

export type StreamingSyncResult = {
  ok: boolean;
  skipped?: 'no-session' | 'no-stored-token' | 'sync-failed' | 'error' | 'not-configured';
  message?: string;
  usedClient?: boolean;
  usedServer?: boolean;
};

function parseApiErrorBody(text: string): Record<string, string> {
  try {
    const parsed = JSON.parse(text) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    if (text.includes('DEPLOYMENT_NOT_FOUND')) {
      return {
        error: 'Server sync API is not available on this deployment. Deploy the latest build to Vercel.',
      };
    }
    if (text.trim().startsWith('<')) {
      return {
        error: 'Server sync returned an HTML error page. The /api/spotify/sync-profile route may not be deployed yet.',
      };
    }
    return text ? { error: text.slice(0, 200) } : {};
  }
}

export async function requestServerSpotifySync(): Promise<StreamingSyncResult> {
  const base = getApiBaseUrl();
  if (!base) {
    return { ok: false, skipped: 'not-configured', message: 'API base URL not configured' };
  }

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
        message: 'Connect Spotify once to save a refresh token for background sync.',
        usedServer: true,
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

    return { ok: true, usedServer: true };
  } catch (error) {
    return {
      ok: false,
      skipped: 'error',
      message: error instanceof Error ? error.message : 'Sync failed',
      usedServer: true,
    };
  }
}

async function tryClientSpotifySync(): Promise<{ ok: boolean; message?: string }> {
  const sessionOk = await spotifyService.ensureSession();
  if (!sessionOk) {
    return { ok: false, message: 'No active Spotify session in this browser' };
  }

  try {
    await spotifyService.syncUserMusicPreferences();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Client Spotify sync failed',
    };
  }
}

export async function syncStreamingProfile(
  userId: string,
  serviceType: 'spotify' | 'apple-music',
  options?: { manual?: boolean }
): Promise<StreamingSyncResult> {
  if (options?.manual) {
    clearAutoSyncThrottle(userId);
  }

  streamingSyncService.startSync(serviceType);

  try {
    if (serviceType === 'spotify') {
      const clientResult = await tryClientSpotifySync();
      const serverResult = await requestServerSpotifySync();

      if (clientResult.ok || serverResult.ok) {
        streamingSyncService.completeSync();
        markAutoSynced(userId);
        return {
          ok: true,
          usedClient: clientResult.ok,
          usedServer: serverResult.ok,
        };
      }

      const message =
        serverResult.message ||
        clientResult.message ||
        'Could not refresh Spotify stats. Connect Spotify once, then try again.';

      streamingSyncService.errorSync(message);

      if (serverResult.skipped === 'no-stored-token' && !clientResult.ok) {
        return { ok: false, skipped: 'no-stored-token', message, usedServer: true };
      }

      return {
        ok: false,
        skipped: serverResult.skipped ?? 'sync-failed',
        message,
        usedClient: false,
        usedServer: true,
      };
    }

    if (!appleMusicService.checkStoredToken()) {
      streamingSyncService.errorSync('no-session');
      return {
        ok: false,
        skipped: 'no-session',
        message: 'Connect Apple Music to refresh stats.',
      };
    }

    const data = await appleMusicService.generateProfileData();
    if (!data || !(await appleMusicService.uploadProfileData(data))) {
      streamingSyncService.errorSync('sync-failed');
      return { ok: false, skipped: 'sync-failed', message: 'Apple Music sync failed' };
    }

    appleMusicService.markSyncCompleted();
    streamingSyncService.completeSync();
    markAutoSynced(userId);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    streamingSyncService.errorSync(message);
    return { ok: false, skipped: 'error', message };
  }
}

export async function disconnectStreamingAccount(userId: string): Promise<void> {
  await spotifyService.logout().catch(() => undefined);
  appleMusicService.logout();

  await Promise.all([
    supabase
      .from('users')
      .update({
        music_streaming_profile: null,
        music_streaming_service: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId),
    supabase.from('streaming_profiles').delete().eq('user_id', userId),
    supabase.from('spotify_user_tokens').delete().eq('user_id', userId),
  ]);
}
