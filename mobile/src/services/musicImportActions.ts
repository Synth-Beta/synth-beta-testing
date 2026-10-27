import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import {
  postMusicImport,
  readSpotifyExportFiles,
  summarizeSpotifyExport,
  type MusicImportRequest,
  type MusicImportResult,
  type SpotifyExportSummary,
} from '@synth/shared';
import { supabase } from '../integrations/supabase/client';
import { getExpoSiteUrl } from '../utils/siteUrl';

/** Last.fm sync or Spotify-export upload; the server also refreshes feed preferences. */
export async function importMusic(request: MusicImportRequest): Promise<MusicImportResult> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return { ok: false, message: 'Sign in again, then try.' };
  return postMusicImport(getExpoSiteUrl(), token, request);
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

/**
 * Lets the user pick the Spotify export (.zip or the .json files from it, e.g. from Files
 * or Mail) and parses it on the phone. Returns 'cancelled' if they backed out.
 */
export async function pickSpotifyExport(): Promise<SpotifyExportSummary | null | 'cancelled'> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'application/x-zip-compressed', 'application/json'],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (picked.canceled) return 'cancelled';

  const files = await Promise.all(
    picked.assets.map(async (a) => ({ name: a.name, bytes: await new File(a.uri).bytes() }))
  );
  return summarizeSpotifyExport(readSpotifyExportFiles(files));
}
