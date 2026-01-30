/**
 * Phase One: Spotify Artist Seeding
 *
 * Seeds the `artists` table with popular artists from the Spotify API so users
 * can select them for reviews (including past events) without consuming JamBase quota.
 *
 * Usage:
 *   node scripts/seed-artists-from-spotify.mjs [--limit=N] [--genres=rock,indie,pop]
 *
 * Environment (server-only; do not use VITE_ or expose in frontend):
 *   SPOTIFY_CLIENT_ID      - from Spotify Dashboard (same app as OAuth is fine)
 *   SPOTIFY_CLIENT_SECRET  - from Spotify Dashboard
 *   SUPABASE_URL           - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)
 *
 * Does not touch JamBase sync or venues.
 */

import { createClient } from '@supabase/supabase-js';

async function loadEnv() {
  try {
    const dotenv = await import('dotenv');
    dotenv.default.config({ path: '.env.local' });
  } catch (e) {
    // dotenv not installed, assume env vars are already set
  }
}

const SPOTIFY_ARTISTS_BATCH = 50;
const SPOTIFY_SEARCH_LIMIT = 20;
const DEFAULT_INSERT_LIMIT = 500;
const DELAY_MS = 300;
const RETRY_AFTER_DEFAULT = 60;

function parseArgs() {
  const args = process.argv.slice(2);
  let limit = DEFAULT_INSERT_LIMIT;
  let genres = ['rock', 'indie', 'pop', 'hip-hop', 'electronic'];
  for (const arg of args) {
    if (arg.startsWith('--limit=')) limit = Math.max(1, parseInt(arg.slice(8), 10) || DEFAULT_INSERT_LIMIT);
    if (arg.startsWith('--genres=')) genres = arg.slice(9).split(',').map((g) => g.trim()).filter(Boolean);
  }
  return { limit, genres: genres.length ? genres : ['rock', 'indie', 'pop'] };
}

class SpotifyArtistSeed {
  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    this.spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
    this.spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!this.spotifyClientId || !this.spotifyClientSecret) {
      throw new Error(
        'Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET. Add to .env.local (server-only, no VITE_).'
      );
    }
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
    this.accessToken = null;
    this.tokenExpiry = null;
    this.stats = { discovered: 0, alreadyInDb: 0, inserted: 0, errors: 0, rateLimitHits: 0 };
  }

  async getAccessToken() {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 300000) {
      return this.accessToken;
    }
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${this.spotifyClientId}:${this.spotifyClientSecret}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Spotify token failed: ${response.status} ${text}`);
    }
    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000);
    return this.accessToken;
  }

  async spotifyRequest(url, retries = 2) {
    const token = await this.getAccessToken();
    let res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (res.status === 429) {
      this.stats.rateLimitHits++;
      const wait = parseInt(res.headers.get('retry-after') || String(RETRY_AFTER_DEFAULT), 10) * 1000;
      console.warn(`Rate limited; waiting ${wait / 1000}s...`);
      await new Promise((r) => setTimeout(r, wait));
      return this.spotifyRequest(url, retries);
    }
    if (res.status === 401 && retries > 0) {
      this.accessToken = null;
      await new Promise((r) => setTimeout(r, 500));
      return this.spotifyRequest(url, retries - 1);
    }
    return res;
  }

  /**
   * Discover artist IDs via search playlists by genre/keyword, then get playlist tracks.
   */
  async discoverArtistIds(genres, maxIds) {
    const seen = new Set();
    for (const genre of genres) {
      if (seen.size >= maxIds) break;
      const query = encodeURIComponent(`top ${genre}`);
      const searchRes = await this.spotifyRequest(
        `https://api.spotify.com/v1/search?type=playlist&q=${query}&limit=${SPOTIFY_SEARCH_LIMIT}`
      );
      if (!searchRes.ok) {
        console.warn(`Search playlists "${genre}": ${searchRes.status}`);
        await new Promise((r) => setTimeout(r, DELAY_MS));
        continue;
      }
      const searchData = await searchRes.json();
      const playlists = searchData.playlists?.items || [];
      await new Promise((r) => setTimeout(r, DELAY_MS));

      for (const pl of playlists) {
        if (seen.size >= maxIds) break;
        if (!pl?.id) continue;
        const tracksRes = await this.spotifyRequest(
          `https://api.spotify.com/v1/playlists/${pl.id}/tracks?limit=100&fields=items(track(artists(id)))`
        );
        if (!tracksRes.ok) {
          await new Promise((r) => setTimeout(r, DELAY_MS));
          continue;
        }
        const tracksData = await tracksRes.json();
        const items = tracksData.items || [];
        for (const it of items) {
          const artists = it?.track?.artists;
          if (Array.isArray(artists)) {
            for (const a of artists) {
              if (a?.id && !seen.has(a.id)) seen.add(a.id);
            }
          }
        }
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }
    this.stats.discovered = seen.size;
    return Array.from(seen);
  }

  /**
   * Return which of the given Spotify IDs are not yet in external_entity_ids (source=spotify, entity_type=artist).
   */
  async filterExistingSpotifyIds(spotifyIds) {
    if (spotifyIds.length === 0) return [];
    const chunkSize = 100;
    const existing = new Set();
    for (let i = 0; i < spotifyIds.length; i += chunkSize) {
      const chunk = spotifyIds.slice(i, i + chunkSize);
      const { data, error } = await this.supabase
        .from('external_entity_ids')
        .select('external_id')
        .eq('source', 'spotify')
        .eq('entity_type', 'artist')
        .in('external_id', chunk);
      if (!error && Array.isArray(data)) {
        for (const row of data) if (row.external_id) existing.add(row.external_id);
      }
    }
    this.stats.alreadyInDb = existing.size;
    return spotifyIds.filter((id) => !existing.has(id));
  }

  /**
   * Fetch artist objects from Spotify (up to 50 per request).
   */
  async fetchArtists(spotifyIds) {
    const results = [];
    for (let i = 0; i < spotifyIds.length; i += SPOTIFY_ARTISTS_BATCH) {
      const batch = spotifyIds.slice(i, i + SPOTIFY_ARTISTS_BATCH);
      const ids = batch.join(',');
      const res = await this.spotifyRequest(`https://api.spotify.com/v1/artists?ids=${ids}`);
      if (!res.ok) {
        console.warn(`Get artists batch: ${res.status}`);
        this.stats.errors += batch.length;
        await new Promise((r) => setTimeout(r, DELAY_MS));
        continue;
      }
      const data = await res.json();
      const artists = data.artists || [];
      for (const a of artists) {
        if (a?.id && a?.name) results.push(a);
      }
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
    return results;
  }

  /**
   * Insert one artist and one external_entity_ids row. Uses synthetic jambase_artist_id and identifier.
   */
  async insertArtist(spotifyArtist) {
    const spotifyId = spotifyArtist.id;
    const jambaseArtistId = `spotify-${spotifyId}`;
    const identifier = `spotify:${spotifyId}`;
    const name = spotifyArtist.name || 'Unknown Artist';
    const imageUrl = Array.isArray(spotifyArtist.images) && spotifyArtist.images.length
      ? spotifyArtist.images[0].url
      : null;
    const url = spotifyArtist.external_urls?.spotify || null;
    const genres = Array.isArray(spotifyArtist.genres) && spotifyArtist.genres.length
      ? spotifyArtist.genres
      : null;

    const row = {
      jambase_artist_id: jambaseArtistId,
      name,
      identifier,
      url,
      image_url: imageUrl,
      ...(genres && { genres }),
    };

    const { data: inserted, error } = await this.supabase
      .from('artists')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        // unique violation - already exists (e.g. from another run), link external_id if missing
        const { data: existing } = await this.supabase
          .from('artists')
          .select('id')
          .eq('jambase_artist_id', jambaseArtistId)
          .maybeSingle();
        if (existing?.id) {
          await this.supabase.from('external_entity_ids').upsert(
            {
              entity_type: 'artist',
              entity_uuid: existing.id,
              source: 'spotify',
              external_id: spotifyId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'entity_uuid,source,entity_type' }
          );
          this.stats.inserted++;
          if (genres && genres.length > 0) {
            try {
              await this.supabase.rpc('sync_artist_genres', {
                p_artist_id: existing.id,
                p_raw_genres: genres,
              });
            } catch (err) {
              console.warn(`sync_artist_genres (existing) for ${spotifyId}: ${err.message}`);
            }
          }
        }
        return;
      }
      console.warn(`Insert artist ${name} (${spotifyId}): ${error.message}`);
      this.stats.errors++;
      return;
    }

    if (inserted?.id) {
      const { error: eeiError } = await this.supabase.from('external_entity_ids').insert({
        entity_type: 'artist',
        entity_uuid: inserted.id,
        source: 'spotify',
        external_id: spotifyId,
      });
      if (eeiError) {
        console.warn(`external_entity_ids for ${spotifyId}: ${eeiError.message}`);
      } else {
        this.stats.inserted++;
      }
      // Optional: sync normalized genres so artists_genres is populated (skip if RPC missing)
      if (genres && genres.length > 0) {
        try {
          const { error: rpcError } = await this.supabase.rpc('sync_artist_genres', {
            p_artist_id: inserted.id,
            p_raw_genres: genres,
          });
          if (rpcError) {
            console.warn(`sync_artist_genres for ${spotifyId}: ${rpcError.message}`);
          }
        } catch (err) {
          console.warn(`sync_artist_genres for ${spotifyId}: ${err.message}`);
        }
      }
    }
  }

  async run() {
    const { limit, genres } = parseArgs();
    console.log('Phase One: Spotify artist seeding');
    console.log('Genres/keywords:', genres.join(', '));
    console.log('Insert limit:', limit);

    const allIds = await this.discoverArtistIds(genres, Math.max(limit * 2, 2000));
    console.log('Discovered artist IDs:', allIds.length);

    const toInsert = await this.filterExistingSpotifyIds(allIds);
    console.log('Already in DB:', this.stats.alreadyInDb);
    console.log('To insert (capped):', Math.min(toInsert.length, limit));

    const toProcess = toInsert.slice(0, limit);
    const artists = await this.fetchArtists(toProcess);
    console.log('Fetched artist details:', artists.length);

    for (let i = 0; i < artists.length; i++) {
      await this.insertArtist(artists[i]);
      if ((i + 1) % 50 === 0) console.log('Inserted so far:', this.stats.inserted);
    }

    console.log('Done. Inserted:', this.stats.inserted);
    console.log('Errors:', this.stats.errors);
    if (this.stats.rateLimitHits) console.log('Rate limit hits:', this.stats.rateLimitHits);
  }
}

(async () => {
  await loadEnv();
  const seed = new SpotifyArtistSeed();
  await seed.run();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
