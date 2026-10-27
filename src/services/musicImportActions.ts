import {
  postMusicImport,
  readSpotifyExportFiles,
  summarizeSpotifyExport,
  type MusicImportRequest,
  type MusicImportResult,
  type SpotifyExportSummary,
} from '@synth/shared';
import { supabase } from '@/integrations/supabase/client';
import { getApiBaseUrl } from '@/utils/apiBaseUrl';

/** Last.fm sync or Spotify-export upload; the server also refreshes feed preferences. */
export async function importMusic(request: MusicImportRequest): Promise<MusicImportResult> {
  const base = getApiBaseUrl();
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!base || !session) return { ok: false, message: 'Sign in again, then try.' };

  const result = await postMusicImport(base, session.access_token, request);
  if (result.ok && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('synth:streaming-sync-complete', { detail: { userId: session.user.id } }));
  }
  return result;
}

/** The username saved by the last successful Last.fm import, if any. */
export async function fetchSavedLastfmUsername(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const userId = data?.session?.user.id;
  if (!userId) return null;
  const { data: row } = await supabase
    .from('streaming_profiles')
    .select('username:profile_data->>username')
    .eq('user_id', userId)
    .eq('service_type', 'lastfm')
    .maybeSingle();
  return (row as { username?: string | null } | null)?.username ?? null;
}

/** Parses the chosen .zip / .json files in the browser; nothing raw leaves the device. */
export async function summarizeSpotifyExportFiles(files: File[]): Promise<SpotifyExportSummary | null> {
  const loaded = await Promise.all(
    files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))
  );
  return summarizeSpotifyExport(readSpotifyExportFiles(loaded));
}
