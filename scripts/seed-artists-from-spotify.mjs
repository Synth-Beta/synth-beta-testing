/**
 * Phase One: Spotify Artist Seeding
 *
 * Seeds the `artists` table with popular artists from the Spotify API so users
 * can select them for reviews (including past events) without consuming JamBase quota.
 *
 * Usage:
 *   node scripts/seed-artists-from-spotify.mjs [--limit=N] [--genres=rock,indie,pop]
 *   node scripts/seed-artists-from-spotify.mjs --top2025 [--limit=N]  # Top 50 USA/Global, Billions Club, top hits 2025
 *   node scripts/seed-artists-from-spotify.mjs --top1000 [--limit=N]  # Top N artists by Spotify popularity (default 1000)
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
const TOP1000_DISCOVERY_POOL = 5000; // Discover this many, fetch all, sort by popularity, take top N
const DELAY_MS = 300;
const RETRY_AFTER_DEFAULT = 60;

// Curated playlist IDs (Top 50 USA, Top 50 Global, Billions Club)
const CURATED_PLAYLIST_IDS = [
  { id: '37i9dQZEVXbLRQDuF5jeBp', name: 'Top 50 - USA' },
  { id: '37i9dQZEVXbMDoHDwVN2tF', name: 'Top 50 - Global' },
  { id: '37i9dQZF1DX7iB3RCnBnN4', name: 'Billions Club (1B+ streams)' },
];

// Search queries for top/trending tracks 2025 (fallback when direct fetch fails)
const TOP_2025_SEARCH_QUERIES = [
  'top artists 2025 USA',
  'top artists 2025 global',
  'top hits 2025',
  'top tracks 2025',
  "today's top hits",
  'billions club 1 billion streams',
  'viral hits 2025',
  'top 50 global',
  'trending 2025',
];

function parseArgs() {
  const args = process.argv.slice(2);
  let limit = DEFAULT_INSERT_LIMIT;
  let genres = ['rock', 'indie', 'pop', 'hip-hop', 'electronic'];
  let top2025 = false;
  let top1000 = false;
  for (const arg of args) {
    if (arg.startsWith('--limit=')) limit = Math.max(1, parseInt(arg.slice(8), 10) || DEFAULT_INSERT_LIMIT);
    if (arg.startsWith('--genres=')) genres = arg.slice(9).split(',').map((g) => g.trim()).filter(Boolean);
    if (arg === '--top2025') top2025 = true;
    if (arg === '--top1000') top1000 = true;
  }
  if (top1000 && limit === DEFAULT_INSERT_LIMIT) limit = 1000;
  return { limit, genres: genres.length ? genres : ['rock', 'indie', 'pop'], top2025, top1000 };
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
   * Fetch artist IDs from a playlist by ID (handles pagination).
   */
  async fetchArtistsFromPlaylist(playlistId) {
    const seen = new Set();
    let offset = 0;
    const limit = 100;
    for (;;) {
      const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}&fields=items(track(artists(id)))`;
      const res = await this.spotifyRequest(url);
      if (!res.ok) return null;
      const data = await res.json();
      const items = data.items || [];
      for (const it of items) {
        const artists = it?.track?.artists;
        if (Array.isArray(artists)) {
          for (const a of artists) {
            if (a?.id) seen.add(a.id);
          }
        }
      }
      if (items.length < limit) break;
      offset += limit;
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
    return Array.from(seen);
  }

  /**
   * Discover artist IDs from Top 50 USA, Top 50 Global, Billions Club, and top 2025 search.
   */
  async discoverFromTop2025(maxIds) {
    const seen = new Set();

    // 1. Try curated playlists directly (Top 50 USA, Top 50 Global, Billions Club)
    for (const { id, name } of CURATED_PLAYLIST_IDS) {
      if (seen.size >= maxIds) break;
      const ids = await this.fetchArtistsFromPlaylist(id);
      if (ids && ids.length > 0) {
        ids.forEach((x) => seen.add(x));
        console.log(`  📀 ${name}: ${ids.length} artists`);
      }
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }

    // 2. Search-based discovery (fallback / supplement)
    for (const query of TOP_2025_SEARCH_QUERIES) {
      if (seen.size >= maxIds) break;
      const searchRes = await this.spotifyRequest(
        `https://api.spotify.com/v1/search?type=playlist&q=${encodeURIComponent(query)}&limit=${SPOTIFY_SEARCH_LIMIT}`
      );
      if (!searchRes.ok) {
        console.warn(`Search "${query}": ${searchRes.status}`);
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
   * Escape special LIKE/ILIKE pattern characters for literal matching.
   * PostgreSQL LIKE treats % as "any sequence" and _ as "any single char".
   */
  escapeLikePattern(str) {
    if (!str) return str;
    // Escape backslash first, then % and _
    return str.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  }

  /**
   * Find an artist by name (case-insensitive).
   * Returns the artist UUID if found, null otherwise.
   */
  async findArtistByName(name) {
    if (!name) return null;
    const normalizedName = name.trim().toLowerCase();
    // Escape LIKE special characters for literal matching
    const escapedName = this.escapeLikePattern(normalizedName);
    const { data, error } = await this.supabase
      .from('artists')
      .select('id')
      .ilike('name', escapedName)
      .limit(1);
    if (error) {
      console.warn(`Error checking artist by name "${name}": ${error.message}`);
      return null;
    }
    return data && data.length > 0 ? data[0].id : null;
  }

  /**
   * Link a Spotify ID to an existing artist (adds external_entity_ids entry).
   * Returns: { success: boolean, skipped: boolean, reason?: string }
   */
  async linkSpotifyIdToArtist(artistUuid, spotifyId, artistName) {
    // First, check if this artist already has a Spotify ID linked
    const { data: existing, error: checkError } = await this.supabase
      .from('external_entity_ids')
      .select('external_id')
      .eq('entity_uuid', artistUuid)
      .eq('source', 'spotify')
      .eq('entity_type', 'artist')
      .maybeSingle();
    
    if (checkError) {
      console.warn(`Error checking existing Spotify ID for ${artistUuid}: ${checkError.message}`);
      return { success: false, skipped: false };
    }
    
    if (existing) {
      if (existing.external_id === spotifyId) {
        // Same ID already linked - nothing to do
        return { success: true, skipped: true, reason: 'already_linked' };
      } else {
        // Different Spotify ID already linked - don't overwrite (could be different artist with same name)
        console.warn(`  ⚠️ Artist "${artistName}" already has Spotify ID ${existing.external_id}, skipping new ID ${spotifyId} (possible name collision)`);
        return { success: false, skipped: true, reason: 'different_id_exists' };
      }
    }
    
    // No existing Spotify ID - safe to insert
    const { error } = await this.supabase
      .from('external_entity_ids')
      .insert({
        entity_type: 'artist',
        entity_uuid: artistUuid,
        source: 'spotify',
        external_id: spotifyId,
      });
    
    if (error) {
      console.warn(`Error linking Spotify ID ${spotifyId} to artist ${artistUuid}: ${error.message}`);
      return { success: false, skipped: false };
    }
    return { success: true, skipped: false };
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
   * Insert or link an artist.
   * - If artist exists by name (from Jambase or other source) → Link Spotify ID to existing artist
   * - If artist doesn't exist → Create new artist + link Spotify ID
   */
  async insertArtist(spotifyArtist) {
    const spotifyId = spotifyArtist.id;
    const name = spotifyArtist.name || 'Unknown Artist';

    // Check if artist already exists by name (from Jambase or previous imports)
    const existingArtistUuid = await this.findArtistByName(name);
    
    if (existingArtistUuid) {
      // Artist exists - try to link the Spotify ID to the existing artist
      const result = await this.linkSpotifyIdToArtist(existingArtistUuid, spotifyId, name);
      if (result.success) {
        if (result.skipped && result.reason === 'already_linked') {
          // Already linked with same ID - count as already in DB
          this.stats.alreadyInDb++;
        } else {
          console.log(`  🔗 Linked Spotify ID to existing artist: "${name}"`);
          this.stats.inserted++;
        }
        return;
      } else if (result.skipped && result.reason === 'different_id_exists') {
        // Different Spotify artist with same name - this is a legitimate different artist
        // Fall through to create as new artist (don't return)
        console.log(`  ➕ Creating new artist (name collision): "${name}"`);
      } else {
        console.warn(`  ⚠️ Failed to link Spotify ID to existing artist: "${name}"`);
        this.stats.errors++;
        return;
      }
    }

    // Artist doesn't exist OR name collision detected - create new artist
    const jambaseArtistId = `spotify-${spotifyId}`;
    const identifier = `spotify:${spotifyId}`;
    const imageUrl = Array.isArray(spotifyArtist.images) && spotifyArtist.images.length
      ? spotifyArtist.images[0].url
      : null;
    const url = spotifyArtist.external_urls?.spotify || null;
    const genres = Array.isArray(spotifyArtist.genres) && spotifyArtist.genres.length
      ? spotifyArtist.genres
      : null;

    // Try with jambase_artist_id first, fallback to without if schema cache issue
    let inserted = null;
    let error = null;
    
    // First attempt: with jambase_artist_id
    const rowWithJambase = {
      jambase_artist_id: jambaseArtistId,
      name,
      identifier,
      url,
      image_url: imageUrl,
      ...(genres && { genres }),
    };

    const result1 = await this.supabase
      .from('artists')
      .insert(rowWithJambase)
      .select('id')
      .single();
    
    if (result1.error && result1.error.message?.includes('schema cache')) {
      // Schema cache issue - try without jambase_artist_id (might work if column is nullable in prod)
      console.log(`  ℹ️ Schema cache issue, trying alternative insert for "${name}"`);
      const rowWithoutJambase = {
        name,
        identifier,
        url,
        image_url: imageUrl,
        ...(genres && { genres }),
      };
      const result2 = await this.supabase
        .from('artists')
        .insert(rowWithoutJambase)
        .select('id')
        .single();
      inserted = result2.data;
      error = result2.error;
    } else {
      inserted = result1.data;
      error = result1.error;
    }

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
    const { limit, genres, top2025, top1000 } = parseArgs();
    console.log('Phase One: Spotify artist seeding');
    if (top1000) {
      console.log('Mode: Top N by Spotify popularity (sort after fetch)');
      console.log('Target:', limit, 'artists');
    } else if (top2025) {
      console.log('Source: Top Tracks 2025 playlists (Top 50 Global, Today\'s Top Hits, Viral Hits, etc.)');
      console.log('Insert limit:', limit);
    } else {
      console.log('Genres/keywords:', genres.join(', '));
      console.log('Insert limit:', limit);
    }

    if (top1000) {
      await this.runTop1000ByPopularity(limit);
    } else {
      await this.runStandard(limit, genres, top2025);
    }

    console.log('Done. Inserted:', this.stats.inserted);
    console.log('Errors:', this.stats.errors);
    if (this.stats.rateLimitHits) console.log('Rate limit hits:', this.stats.rateLimitHits);
  }

  async runStandard(limit, genres, top2025) {
    const maxIds = Math.max(limit * 2, 2000);
    const allIds = top2025
      ? await this.discoverFromTop2025(maxIds)
      : await this.discoverArtistIds(genres, maxIds);
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
  }

  /**
   * Discover from playlists, fetch all artist details (with popularity),
   * sort by popularity desc, take top N, then insert/link.
   */
  async runTop1000ByPopularity(limit) {
    const maxIds = Math.min(TOP1000_DISCOVERY_POOL, Math.max(limit * 3, 3000));
    console.log('Discovering artist IDs from playlists (pool size:', maxIds, ')...');
    const allIds = await this.discoverFromTop2025(maxIds);
    console.log('Discovered:', allIds.length, 'artist IDs');

    console.log('Fetching artist details (Get Several Artists, includes popularity)...');
    const artists = await this.fetchArtists(allIds);
    console.log('Fetched:', artists.length, 'artists');

    // Sort by popularity descending (100 = most popular)
    const byPopularity = [...artists].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    const topN = byPopularity.slice(0, limit);
    console.log('Top', topN.length, 'by popularity (range:', topN[topN.length - 1]?.popularity ?? '?', '-', topN[0]?.popularity ?? '?', ')');

    // Filter out artists already in DB (by Spotify ID)
    const existingIds = new Set();
    const chunkSize = 100;
    for (let i = 0; i < topN.length; i += chunkSize) {
      const chunk = topN.slice(i, i + chunkSize).map((a) => a.id);
      const { data } = await this.supabase
        .from('external_entity_ids')
        .select('external_id')
        .eq('source', 'spotify')
        .eq('entity_type', 'artist')
        .in('external_id', chunk);
      if (data) for (const row of data) existingIds.add(row.external_id);
    }
    this.stats.alreadyInDb = existingIds.size;
    const toProcess = topN.filter((a) => !existingIds.has(a.id));
    console.log('Already in DB:', existingIds.size, '| To insert:', toProcess.length);

    for (let i = 0; i < toProcess.length; i++) {
      await this.insertArtist(toProcess[i]);
      if ((i + 1) % 50 === 0) console.log('Inserted so far:', this.stats.inserted);
    }
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
