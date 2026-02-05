/**
 * Sync Spotify data for all users who have a stored refresh token.
 * Uses service_role to read spotify_user_tokens and write to streaming_profiles.
 * Run after the app has saved tokens (users connect Spotify; tokens saved on connect).
 *
 * Usage:
 *   node scripts/sync-spotify-from-stored-tokens.mjs [--dry-run]
 *
 * Env (e.g. from .env.local):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || process.env.VITE_SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
  console.error('❌ Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET (server-side env)');
  process.exit(1);
}

const isDryRun = process.argv.includes('--dry-run');
if (isDryRun) console.log('🔍 DRY RUN – no DB writes\n');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getAccessToken(refreshToken) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: SPOTIFY_CLIENT_ID,
      client_secret: SPOTIFY_CLIENT_SECRET,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `HTTP ${res.status}`);
  }
  return data.access_token;
}

async function spotifyApi(accessToken, path) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) throw new Error('Token expired or invalid');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data;
}

async function getAllTopArtists(accessToken, timeRange, limit = 50) {
  const items = [];
  let url = `/me/top/artists?time_range=${timeRange}&limit=${limit}&offset=0`;
  while (url) {
    const data = await spotifyApi(accessToken, url);
    items.push(...(data.items || []));
    url = data.next ? new URL(data.next).pathname + new URL(data.next).search : null;
  }
  return items;
}

async function getAllTopTracks(accessToken, timeRange, limit = 50) {
  const items = [];
  let url = `/me/top/tracks?time_range=${timeRange}&limit=${limit}&offset=0`;
  while (url) {
    const data = await spotifyApi(accessToken, url);
    items.push(...(data.items || []));
    url = data.next ? new URL(data.next).pathname + new URL(data.next).search : null;
  }
  return items;
}

async function syncOneUser(userId, refreshToken) {
  const accessToken = await getAccessToken(refreshToken);
  const [artistsShort, artistsMed, artistsLong, tracksShort, tracksMed, tracksLong, recent, me] = await Promise.all([
    getAllTopArtists(accessToken, 'short_term'),
    getAllTopArtists(accessToken, 'medium_term'),
    getAllTopArtists(accessToken, 'long_term'),
    getAllTopTracks(accessToken, 'short_term'),
    getAllTopTracks(accessToken, 'medium_term'),
    getAllTopTracks(accessToken, 'long_term'),
    spotifyApi(accessToken, '/me/player/recently-played?limit=50').then((d) => d.items || []).catch(() => []),
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

  if (isDryRun) {
    console.log(`  [dry-run] would upsert streaming_profiles for ${userId} (${profileData.topArtists.length} artists)`);
    return;
  }

  const { error } = await supabase.from('streaming_profiles').upsert(
    {
      user_id: userId,
      service_type: 'spotify',
      profile_data: profileData,
      sync_status: 'completed',
      last_updated: new Date().toISOString(),
    },
    { onConflict: 'user_id,service_type' }
  );

  if (error) throw error;
}

async function main() {
  const { data: rows, error } = await supabase.from('spotify_user_tokens').select('user_id, refresh_token');
  if (error) {
    console.error('❌ Failed to read spotify_user_tokens:', error.message);
    process.exit(1);
  }
  if (!rows?.length) {
    console.log('No stored Spotify tokens yet.');
    console.log('');
    console.log('Important: A Spotify *link* in Edit Profile (username/URL) is NOT the same as connecting.');
    console.log('We only get a token when someone completes "Connect Spotify" (OAuth login with Spotify).');
    console.log('');
    console.log('What to do:');
    console.log('  1. Each user goes to Profile and taps "Sync my Spotify" (or opens Streaming Stats).');
    console.log('  2. They tap "Connect Spotify" and sign in with Spotify (one time).');
    console.log('  3. After that, their token is saved and this script can sync them.');
    console.log('');
    console.log('(There is no token from just pasting a Spotify link in Edit Profile.)');
    return;
  }
  console.log(`Found ${rows.length} user(s) with stored Spotify token.\n`);

  let ok = 0;
  let fail = 0;
  for (const { user_id, refresh_token } of rows) {
    try {
      await syncOneUser(user_id, refresh_token);
      ok++;
      console.log(`  ✅ ${user_id}`);
    } catch (e) {
      fail++;
      console.error(`  ❌ ${user_id}:`, e.message);
    }
  }
  console.log(`\nDone: ${ok} synced, ${fail} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
