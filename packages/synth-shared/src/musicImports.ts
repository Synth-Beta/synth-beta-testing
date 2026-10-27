/**
 * Music imports for people who can't use Spotify OAuth (Spotify Development Mode only
 * allows allowlisted accounts): Last.fm by username, and the Spotify privacy-data export.
 *
 * The export is parsed on the device and only a small top-artists/top-tracks summary is
 * uploaded, in the same topArtistsByTimeRange shape a Spotify sync writes, so the
 * artist-signals trigger and the stats screens read it without special cases.
 */
import { strFromU8, unzipSync } from 'fflate';

export type MusicImportSource = 'lastfm' | 'spotify-export';

export type MusicImportRange = 'short_term' | 'medium_term' | 'long_term';

export interface MusicImportArtist {
  name: string;
  playcount: number;
  minutes: number;
}

export interface MusicImportTrack {
  name: string;
  artists: Array<{ name: string }>;
  playcount: number;
  minutes: number;
}

export interface SpotifyExportSummary {
  topArtistsByTimeRange: Record<MusicImportRange, MusicImportArtist[]>;
  topTracksByTimeRange: Record<MusicImportRange, MusicImportTrack[]>;
  periodStart: string;
  periodEnd: string;
  totalPlays: number;
  totalMinutes: number;
}

export const SPOTIFY_EXPORT_URL = 'https://www.spotify.com/account/privacy/';

export const SPOTIFY_EXPORT_STEPS = [
  'Open spotify.com/account/privacy and request "Account data".',
  'Spotify emails you a download link, usually within a few days.',
  'Upload the zip (or the StreamingHistory .json files inside it) here.',
] as const;

export const LASTFM_SPOTIFY_TIP =
  'Already scrobbling? Enter your Last.fm username. New to Last.fm? Create a free account, then link Spotify in Last.fm settings → Applications. Your recommendations improve as you listen.';

const TOP_N = 50;
/** Spotify counts a stream after 30 seconds; shorter plays are skips. */
const MIN_PLAY_MS = 30_000;
const RANGE_DAYS: Record<MusicImportRange, number> = {
  short_term: 28,
  medium_term: 182,
  long_term: Number.POSITIVE_INFINITY,
};
const DAY_MS = 86_400_000;

/**
 * Account-data export: StreamingHistory_music_0.json (older: StreamingHistory0.json).
 * Extended streaming history: Streaming_History_Audio_2023-2024_0.json.
 */
export function isSpotifyHistoryFile(name: string): boolean {
  const base = name.split('/').pop() ?? name;
  return /^(StreamingHistory(_music_)?\d*|Streaming_History_Audio_.*)\.json$/i.test(base);
}

/** Pulls the listening-history JSON texts out of uploaded .zip / .json files. */
export function readSpotifyExportFiles(files: Array<{ name: string; bytes: Uint8Array }>): string[] {
  const texts: string[] = [];
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      const entries = unzipSync(file.bytes, { filter: (f) => isSpotifyHistoryFile(f.name) });
      for (const bytes of Object.values(entries)) texts.push(strFromU8(bytes));
    } else if (/\.json$/i.test(file.name)) {
      texts.push(strFromU8(file.bytes));
    }
  }
  return texts;
}

type Play = { at: number; artist: string; track: string; ms: number };

function parsePlays(text: string): Play[] {
  let rows: unknown;
  try {
    rows = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];

  const plays: Play[] = [];
  for (const row of rows as Array<Record<string, unknown>>) {
    if (!row || typeof row !== 'object') continue;
    // Podcast rows in the extended history have null track/artist names and drop out here.
    const artist = row.artistName ?? row.master_metadata_album_artist_name;
    const track = row.trackName ?? row.master_metadata_track_name;
    const ms = Number(row.msPlayed ?? row.ms_played);
    const when =
      typeof row.ts === 'string'
        ? row.ts
        : typeof row.endTime === 'string'
          ? `${row.endTime.replace(' ', 'T')}Z`
          : '';
    const at = Date.parse(when);
    if (typeof artist !== 'string' || !artist.trim()) continue;
    if (typeof track !== 'string' || !track.trim()) continue;
    if (!Number.isFinite(ms) || ms < MIN_PLAY_MS || !Number.isFinite(at)) continue;
    plays.push({ at, artist: artist.trim(), track: track.trim(), ms });
  }
  return plays;
}

function topBy<T extends { playcount: number; minutes: number }>(map: Map<string, T>): T[] {
  return [...map.values()]
    .sort((a, b) => b.playcount - a.playcount || b.minutes - a.minutes)
    .slice(0, TOP_N);
}

/** Returns null when the files hold no music plays (wrong file, or podcasts only). */
export function summarizeSpotifyExport(texts: string[]): SpotifyExportSummary | null {
  const plays = texts.flatMap(parsePlays);
  if (plays.length === 0) return null;

  // Ranges are relative to the newest play, not today: an export can be weeks old.
  let latest = 0;
  let earliest = Number.POSITIVE_INFINITY;
  let totalMs = 0;
  for (const p of plays) {
    if (p.at > latest) latest = p.at;
    if (p.at < earliest) earliest = p.at;
    totalMs += p.ms;
  }

  const artistsByRange = {} as SpotifyExportSummary['topArtistsByTimeRange'];
  const tracksByRange = {} as SpotifyExportSummary['topTracksByTimeRange'];
  for (const range of Object.keys(RANGE_DAYS) as MusicImportRange[]) {
    const cutoff = latest - RANGE_DAYS[range] * DAY_MS;
    const artists = new Map<string, MusicImportArtist>();
    const tracks = new Map<string, MusicImportTrack>();
    for (const p of plays) {
      if (p.at < cutoff) continue;
      const minutes = p.ms / 60_000;
      const aKey = p.artist.toLowerCase();
      const a = artists.get(aKey) ?? { name: p.artist, playcount: 0, minutes: 0 };
      a.playcount += 1;
      a.minutes += minutes;
      artists.set(aKey, a);
      const tKey = `${aKey}\u0000${p.track.toLowerCase()}`;
      const t = tracks.get(tKey) ?? { name: p.track, artists: [{ name: p.artist }], playcount: 0, minutes: 0 };
      t.playcount += 1;
      t.minutes += minutes;
      tracks.set(tKey, t);
    }
    artistsByRange[range] = topBy(artists).map((a) => ({ ...a, minutes: Math.round(a.minutes) }));
    tracksByRange[range] = topBy(tracks).map((t) => ({ ...t, minutes: Math.round(t.minutes) }));
  }

  return {
    topArtistsByTimeRange: artistsByRange,
    topTracksByTimeRange: tracksByRange,
    periodStart: new Date(earliest).toISOString(),
    periodEnd: new Date(latest).toISOString(),
    totalPlays: plays.length,
    totalMinutes: Math.round(totalMs / 60_000),
  };
}

/** Flat on purpose: the web tsconfig is non-strict and doesn't narrow unions on `ok`. */
export interface MusicImportResult {
  ok: boolean;
  /** Set when ok is false. */
  message?: string;
  counts?: { artists: number; tracks: number };
}

export type MusicImportRequest =
  | { source: 'lastfm'; username?: string }
  | { source: 'spotify-export'; summary: SpotifyExportSummary };

/**
 * Saves a Last.fm sync or an export summary through the server (it writes with the
 * service role and refreshes feed preferences). Omit `username` to resync Last.fm.
 */
export async function postMusicImport(
  apiBase: string,
  accessToken: string,
  request: MusicImportRequest
): Promise<MusicImportResult> {
  try {
    const res = await fetch(`${apiBase}/api/spotify/sync-profile?source=${request.source}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
      counts?: { artists: number; tracks: number };
    };
    if (!res.ok) return { ok: false, message: body.message || body.error || `Import failed (${res.status})` };
    return { ok: true, counts: body.counts };
  } catch {
    return { ok: false, message: "Couldn't reach Synth. Check your connection and try again." };
  }
}
