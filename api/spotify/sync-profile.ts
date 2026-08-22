import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function parseResponseJson(text: string): Record<string, unknown> {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function errorMessageFromResponse(
  res: Response,
  data: Record<string, unknown>,
  text: string
): string {
  // Every branch checks for a NON-EMPTY string: Spotify answers some errors with
  // {"error":{"status":410,"message":""}}, and returning that empty message produced
  // a 500 with an empty `error` body, so the app could only show "Sync failed (500)".
  const errorField = data.error;
  if (typeof data.error_description === 'string' && data.error_description) {
    return data.error_description;
  }
  if (typeof errorField === 'string' && errorField) return errorField;
  if (errorField && typeof errorField === 'object' && 'message' in errorField) {
    const nested = (errorField as { message?: unknown }).message;
    if (typeof nested === 'string' && nested) return `${nested} (HTTP ${res.status})`;
  }
  if (typeof data.message === 'string' && data.message) return data.message;
  if (text.trim().startsWith('<')) {
    return `HTTP ${res.status} (non-JSON response)`;
  }
  return `HTTP ${res.status}${text.trim() ? `: ${text.slice(0, 200)}` : ''}`;
}

async function getAccessToken(refreshToken: string, clientId: string, clientSecret: string) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const text = await res.text();
  const data = parseResponseJson(text);
  if (!res.ok) {
    throw new Error(errorMessageFromResponse(res, data, text));
  }
  const accessToken = data.access_token;
  if (typeof accessToken !== 'string' || !accessToken.trim()) {
    throw new Error('Spotify token response missing access_token');
  }
  return accessToken;
}

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

/** Bounded retries for 429 — the rate limit is per app, so one busy user can 429 another. */
const RATE_LIMIT_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 3000;

/**
 * Pages of top items to pull per entity/time-range.
 *
 * One page (50 items) is deliberate. The stats UI renders 20 per range, the web sync
 * (src/services/spotifyService.ts syncUserMusicPreferences) writes exactly one page, and
 * Spotify's real totals for an active listener are in the thousands — paging all of them
 * costs 100+ sequential requests per sync, which rate-limits the whole app and overruns
 * this function's 30s maxDuration. Raise it only alongside a rate-limit budget.
 */
const TOP_ITEMS_MAX_PAGES = 1;

/**
 * Spotify's `next` is an ABSOLUTE url whose pathname already carries the `/v1` API
 * version prefix. Feeding `nextUrl.pathname` straight back into spotifyApi(), which
 * prepends the base itself, requested `https://api.spotify.com/v1/v1/me/top/...` —
 * Spotify answers that with HTTP 410, so every account holding more than one page of
 * top items failed the ENTIRE sync and streaming_profiles was never written.
 */
function nextPageToApiPath(nextUrl: string): string {
  const parsed = new URL(nextUrl);
  return parsed.pathname.replace(/^\/v1/, '') + parsed.search;
}

async function spotifyApi(
  accessToken: string,
  path: string,
  attempt = 0
): Promise<Record<string, unknown>> {
  const res = await fetch(`${SPOTIFY_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    throw new Error('Token expired or invalid');
  }
  if (res.status === 429 && attempt < RATE_LIMIT_RETRIES) {
    const retryAfter = Number(res.headers.get('Retry-After'));
    const delayMs = Math.min(
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000,
      MAX_RETRY_DELAY_MS
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return spotifyApi(accessToken, path, attempt + 1);
  }
  const text = await res.text();
  const data = parseResponseJson(text);
  if (!res.ok) {
    throw new Error(errorMessageFromResponse(res, data, text));
  }
  return data;
}

async function getAllTopItems(
  accessToken: string,
  entity: 'artists' | 'tracks',
  timeRange: string,
  limit = 50,
  maxPages = TOP_ITEMS_MAX_PAGES
) {
  const items: unknown[] = [];
  let url: string | null = `/me/top/${entity}?time_range=${timeRange}&limit=${limit}&offset=0`;
  let pages = 0;
  while (url && pages < maxPages) {
    const data = await spotifyApi(accessToken, url);
    pages += 1;
    const pageItems = data.items;
    if (Array.isArray(pageItems)) {
      items.push(...pageItems);
    }
    const next = data.next;
    url = typeof next === 'string' && next ? nextPageToApiPath(next) : null;
  }
  return items;
}

const TRACKS_RECONNECT_MESSAGE =
  'Your artists synced but songs are missing. Disconnect and reconnect Spotify on the web to grant track permissions (user-top-read).';

/** artists.genres placeholders that mean "we looked and found nothing", not a real tag. */
const PLACEHOLDER_GENRES = new Set(['small artist', 'unknown', 'n/a']);

/** "hip-hop-rap" -> "Hip Hop Rap". Mirrors how genres.name relates to genres.slug. */
function genreSlugToDisplay(value: string): string {
  return value
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

type SpotifyArtistLike = { name?: unknown; genres?: unknown };

/**
 * Spotify's artist objects no longer carry a populated `genres` array — verified live:
 * 0 of 123 artists across all three time ranges came back with any genre tag, where a
 * 2026-07-02 sync of the same account had 65 of 130. Without a substitute, a successful
 * sync would write genre-less artists, the Genres tab would compute nothing, and the
 * spotify_genre preference signals (which are replaced wholesale on every sync) would be
 * emptied — quietly degrading feed personalization.
 *
 * Our own `artists` table already holds curated genres for these acts, and the artist
 * name -> artists.id match is the same one process_spotify_artists_to_signals relies on,
 * so fill the gap from there. Display-cased on purpose: the stats UI renders these strings
 * as-is, and refresh_user_preferences_v5 slug-normalizes whatever form it receives
 * (genre_match_slug maps both "Hip Hop Rap" and "hip-hop-rap" to "hip-hop-rap").
 *
 * Best-effort: any failure leaves the artists exactly as Spotify returned them.
 */
async function backfillArtistGenresFromDb(
  supabase: SupabaseClient,
  artistLists: SpotifyArtistLike[][]
): Promise<void> {
  const names = new Set<string>();
  for (const list of artistLists) {
    for (const artist of list) {
      const name = typeof artist?.name === 'string' ? artist.name.trim() : '';
      const genres = artist?.genres;
      const alreadyTagged = Array.isArray(genres) && genres.length > 0;
      if (name && !alreadyTagged) names.add(name);
    }
  }
  if (names.size === 0) return;

  try {
    const { data, error } = await supabase
      .from('artists')
      .select('name, genres')
      .in('name', [...names]);
    if (error || !data) return;

    const byName = new Map<string, string[]>();
    for (const row of data as Array<{ name?: string | null; genres?: string[] | null }>) {
      const rowName = typeof row.name === 'string' ? row.name.trim().toLowerCase() : '';
      if (!rowName || !Array.isArray(row.genres)) continue;
      const cleaned = row.genres
        .filter((g): g is string => typeof g === 'string' && g.trim().length > 0)
        .filter((g) => !PLACEHOLDER_GENRES.has(g.trim().toLowerCase()))
        .map((g) => genreSlugToDisplay(g.trim()));
      if (cleaned.length > 0) byName.set(rowName, [...new Set(cleaned)]);
    }
    if (byName.size === 0) return;

    for (const list of artistLists) {
      for (const artist of list) {
        const name = typeof artist?.name === 'string' ? artist.name.trim().toLowerCase() : '';
        const genres = artist?.genres;
        if (!name || (Array.isArray(genres) && genres.length > 0)) continue;
        const fromDb = byName.get(name);
        if (fromDb) (artist as { genres?: string[] }).genres = fromDb;
      }
    }
  } catch {
    // Genres are an enrichment, never a reason to fail an otherwise good sync.
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const spotifyClientId = process.env.SPOTIFY_CLIENT_ID || process.env.VITE_SPOTIFY_CLIENT_ID;
  const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }
  if (!spotifyClientId || !spotifyClientSecret) {
    return res.status(500).json({ error: 'Spotify server credentials not configured' });
  }

  const authHeaderRaw = (req.headers.authorization || req.headers.Authorization) as string | undefined;
  const token =
    typeof authHeaderRaw === 'string' && authHeaderRaw.startsWith('Bearer ')
      ? authHeaderRaw.slice('Bearer '.length)
      : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const userId = userData.user.id;

    const { data: tokenRow, error: tokenError } = await supabase
      .from('spotify_user_tokens')
      .select('refresh_token')
      .eq('user_id', userId)
      .maybeSingle();

    if (tokenError) {
      return res.status(500).json({ error: 'Failed to read stored Spotify token' });
    }
    if (!tokenRow?.refresh_token) {
      return res.status(404).json({
        error: 'no_stored_token',
        message: 'No stored Spotify token. Connect Spotify once to enable background sync.',
      });
    }

    const accessToken = await getAccessToken(tokenRow.refresh_token, spotifyClientId, spotifyClientSecret);

    const [artistsShort, artistsMed, artistsLong, tracksShort, tracksMed, tracksLong, recent, me] =
      await Promise.all([
        getAllTopItems(accessToken, 'artists', 'short_term'),
        getAllTopItems(accessToken, 'artists', 'medium_term'),
        getAllTopItems(accessToken, 'artists', 'long_term'),
        getAllTopItems(accessToken, 'tracks', 'short_term'),
        getAllTopItems(accessToken, 'tracks', 'medium_term'),
        getAllTopItems(accessToken, 'tracks', 'long_term'),
        spotifyApi(accessToken, '/me/player/recently-played?limit=50')
          .then((d) => d.items || [])
          .catch(() => []),
        spotifyApi(accessToken, '/me').catch(() => null),
      ]);

    const artistCount = artistsShort.length + artistsMed.length + artistsLong.length;
    const trackCount = tracksShort.length + tracksMed.length + tracksLong.length;

    if (artistCount > 0 && trackCount === 0) {
      return res.status(422).json({
        error: 'tracks_empty',
        message: TRACKS_RECONNECT_MESSAGE,
        counts: { artists: artistCount, tracks: 0 },
      });
    }

    await backfillArtistGenresFromDb(supabase, [
      artistsShort as SpotifyArtistLike[],
      artistsMed as SpotifyArtistLike[],
      artistsLong as SpotifyArtistLike[],
    ]);

    const profileData = {
      topArtists: [...artistsShort, ...artistsMed, ...artistsLong],
      topArtistsByTimeRange: {
        short_term: artistsShort,
        medium_term: artistsMed,
        long_term: artistsLong,
      },
      topTracks: [...tracksShort, ...tracksMed, ...tracksLong],
      topTracksByTimeRange: {
        short_term: tracksShort,
        medium_term: tracksMed,
        long_term: tracksLong,
      },
      recentlyPlayed: recent,
      userProfile: me,
      external_urls: me?.external_urls,
      followers: me?.followers,
      country: me?.country,
      display_name: me?.display_name,
      email: me?.email,
      images: me?.images,
      product: me?.product,
      type: me?.type,
      uri: me?.uri,
    };

    const { error: upsertError } = await supabase.from('streaming_profiles').upsert(
      {
        user_id: userId,
        service_type: 'spotify',
        profile_data: profileData,
        sync_status: 'completed',
        last_updated: new Date().toISOString(),
      },
      { onConflict: 'user_id,service_type' }
    );

    if (upsertError) {
      // Never swallow this again. Returning only "Failed to save streaming profile"
      // hid the actual Postgres error for several rounds of debugging: the write was
      // dying on 57014 (statement timeout) inside the AFTER-UPDATE-OF-profile_data
      // trigger cascade on streaming_profiles, which no amount of app-side change
      // could have fixed because the app could not see it.
      console.error('[spotify/sync-profile] streaming_profiles upsert failed', {
        userId,
        code: upsertError.code,
        message: upsertError.message,
        details: upsertError.details,
        hint: upsertError.hint,
        artistCount,
        trackCount,
        payloadBytes: Buffer.byteLength(JSON.stringify(profileData)),
      });

      // 57014 is the statement_timeout cancel. The Spotify half of the sync succeeded;
      // what failed is the database write, so say that rather than blaming the user's
      // Spotify connection and sending them back through OAuth (which can never fix it).
      if (upsertError.code === '57014') {
        return res.status(504).json({
          error: 'save_timeout',
          message:
            'Spotify data loaded, but saving it timed out in the database. This is a server-side issue, not your Spotify connection — reconnecting will not help.',
          code: upsertError.code,
          counts: { artists: artistCount, tracks: trackCount },
        });
      }

      return res.status(500).json({
        error: `Failed to save streaming profile: ${upsertError.message}`,
        code: upsertError.code,
        counts: { artists: artistCount, tracks: trackCount },
      });
    }

    const externalUrls = me?.external_urls;
    const spotifyUrl =
      externalUrls && typeof externalUrls === 'object' && externalUrls !== null
        ? (externalUrls as { spotify?: string }).spotify
        : undefined;
    if (spotifyUrl) {
      await supabase
        .from('users')
        .update({ music_streaming_profile: spotifyUrl, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
    }

    // Belt-and-suspenders: triggers also refresh preferences; explicit call for mobile-only path.
    // Non-fatal, but log it: this shares a statement_timeout budget with the trigger cascade
    // above, so when that cascade is slow this silently fails and the feed never picks up the
    // new taste data — a sync that looks successful but changes nothing.
    const { error: refreshError } = await supabase.rpc('refresh_user_preferences_v5', {
      p_user_id: userId,
    });
    if (refreshError) {
      console.error('[spotify/sync-profile] refresh_user_preferences_v5 failed', {
        userId,
        code: refreshError.code,
        message: refreshError.message,
      });
    }

    const { error: cacheError } = await supabase
      .from('personalized_feed_cache')
      .delete()
      .eq('user_id', userId);
    if (cacheError) {
      console.error('[spotify/sync-profile] feed cache invalidation failed', {
        userId,
        code: cacheError.code,
        message: cacheError.message,
      });
    }

    return res.status(200).json({
      ok: true,
      lastUpdated: new Date().toISOString(),
      counts: { artists: artistCount, tracks: trackCount },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    console.error('[spotify/sync-profile]', message);
    return res.status(500).json({ error: message });
  }
}
