import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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
  const errorField = data.error;
  if (typeof data.error_description === 'string') return data.error_description;
  if (typeof errorField === 'string') return errorField;
  if (errorField && typeof errorField === 'object' && 'message' in errorField) {
    const nested = (errorField as { message?: unknown }).message;
    if (typeof nested === 'string') return nested;
  }
  if (typeof data.message === 'string') return data.message;
  if (text.trim().startsWith('<')) {
    return `HTTP ${res.status} (non-JSON response)`;
  }
  return text.slice(0, 200) || `HTTP ${res.status}`;
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
  return data.access_token as string;
}

async function spotifyApi(accessToken: string, path: string) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    throw new Error('Token expired or invalid');
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
  limit = 50
) {
  const items: unknown[] = [];
  let url: string | null = `/me/top/${entity}?time_range=${timeRange}&limit=${limit}&offset=0`;
  while (url) {
    const data = await spotifyApi(accessToken, url);
    items.push(...(data.items || []));
    url = data.next ? new URL(data.next).pathname + new URL(data.next).search : null;
  }
  return items;
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
      return res.status(500).json({ error: 'Failed to save streaming profile' });
    }

    const spotifyUrl = me?.external_urls?.spotify;
    if (spotifyUrl) {
      await supabase
        .from('users')
        .update({ music_streaming_profile: spotifyUrl, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
    }

    return res.status(200).json({ ok: true, lastUpdated: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    console.error('[spotify/sync-profile]', message);
    return res.status(500).json({ error: message });
  }
}
