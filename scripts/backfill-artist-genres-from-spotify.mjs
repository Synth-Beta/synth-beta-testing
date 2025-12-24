/**
 * Backfill Artist Genres from Spotify API
 * 
 * This script:
 * 1. Finds all artists with no genres (genres IS NULL or empty array)
 * 2. Extracts Spotify IDs from external_identifiers JSONB column
 * 3. Fetches genres from Spotify API
 * 4. Updates the artists table with the fetched genres
 * 
 * Usage: node scripts/backfill-artist-genres-from-spotify.mjs
 * 
 * Environment Variables Required:
 * - SPOTIFY_CLIENT_ID (or pass via command line)
 * - SPOTIFY_CLIENT_SECRET (or pass via command line)
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';

// Load environment variables
async function loadEnv() {
  try {
    const dotenv = await import('dotenv');
    dotenv.default.config({ path: '.env.local' });
  } catch (e) {
    // dotenv not installed, assume env vars are already set
  }
}

class SpotifyGenreBackfill {
  constructor(spotifyClientId, spotifyClientSecret) {
    // Supabase client
    const supabaseUrl = process.env.SUPABASE_URL || 'https://glpiolbrafqikqhnseto.supabase.co';
    const supabaseServiceKey = 
      process.env.SUPABASE_SERVICE_ROLE_KEY || 
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjkzNzgyNCwiZXhwIjoyMDcyNTEzODI0fQ.cS0y6dQiw2VvGD7tKfKADKqM8whaopJ716G4dexBRGI';
    
    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Spotify API credentials
    this.spotifyClientId = spotifyClientId || process.env.SPOTIFY_CLIENT_ID;
    this.spotifyClientSecret = spotifyClientSecret || process.env.SPOTIFY_CLIENT_SECRET;
    
    if (!this.spotifyClientId || !this.spotifyClientSecret) {
      throw new Error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET');
    }
    
    this.accessToken = null;
    this.tokenExpiry = null;
    
    // Statistics
    this.stats = {
      artistsFound: 0,
      artistsWithSpotifyId: 0,
      artistsUpdated: 0,
      artistsSkipped: 0,
      apiErrors: 0,
      rateLimitHits: 0
    };
  }

  /**
   * Get Spotify access token using Client Credentials flow
   */
  async getAccessToken() {
    // Return cached token if still valid (with 5 minute buffer)
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 300000) {
      return this.accessToken;
    }

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${this.spotifyClientId}:${this.spotifyClientSecret}`).toString('base64')}`
      },
      body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get Spotify access token: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    // Set expiry time (typically 3600 seconds)
    this.tokenExpiry = Date.now() + (data.expires_in * 1000);
    
    return this.accessToken;
  }

  /**
   * Fetch artist data from Spotify API
   */
  async fetchSpotifyArtist(spotifyId) {
    const token = await this.getAccessToken();
    
    const response = await fetch(`https://api.spotify.com/v1/artists/${spotifyId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 429) {
      // Rate limited - get retry-after header
      const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
      this.stats.rateLimitHits++;
      throw new Error(`Rate limited. Retry after ${retryAfter} seconds.`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Spotify API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Extract Spotify ID from external_identifiers JSONB
   * Format: [{"source": "spotify", "identifier": ["0NcPKaSNIHAM2RfioH9vMT"]}]
   */
  extractSpotifyId(externalIdentifiers) {
    if (!externalIdentifiers || !Array.isArray(externalIdentifiers)) {
      return null;
    }

    const spotifyEntry = externalIdentifiers.find(entry => entry.source === 'spotify');
    if (!spotifyEntry || !spotifyEntry.identifier) {
      return null;
    }

    // identifier can be a string or array
    if (Array.isArray(spotifyEntry.identifier) && spotifyEntry.identifier.length > 0) {
      return spotifyEntry.identifier[0];
    } else if (typeof spotifyEntry.identifier === 'string') {
      return spotifyEntry.identifier;
    }

    return null;
  }

  /**
   * Get all artists with no genres
   * Uses pagination to avoid timeout, filtering in JavaScript
   * @param {number} limit - Optional limit for testing (default: null = all)
   */
  async getArtistsWithoutGenres(limit = null) {
    const artists = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore && (!limit || artists.length < limit)) {
      const { data: batch, error } = await this.supabase
        .from('artists')
        .select('id, name, external_identifiers, genres')
        .order('created_at', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        throw new Error(`Failed to fetch artists (page ${page}): ${error.message}`);
      }

      if (!batch || batch.length === 0) {
        hasMore = false;
        break;
      }

      // Filter artists with no genres AND that have external_identifiers (to ensure they might have Spotify IDs)
      const filtered = batch.filter(artist => {
        // Must have no genres
        const noGenres = !artist.genres || !Array.isArray(artist.genres) || artist.genres.length === 0;
        if (!noGenres) return false;
        
        // Must have external_identifiers (potential Spotify ID)
        if (!artist.external_identifiers || !Array.isArray(artist.external_identifiers)) return false;
        
        return true;
      });

      artists.push(...filtered);

      // If we have a limit and reached it, stop
      if (limit && artists.length >= limit) {
        return artists.slice(0, limit);
      }

      // Check if we got a full page (means there might be more)
      if (batch.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }

      // Small delay between pages to avoid overwhelming the database
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return artists;
  }

  /**
   * Update artist genres in database
   */
  async updateArtistGenres(artistId, genres) {
    const { error } = await this.supabase
      .from('artists')
      .update({ 
        genres: genres.length > 0 ? genres : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', artistId);

    if (error) {
      throw new Error(`Failed to update artist ${artistId}: ${error.message}`);
    }
  }

  /**
   * Process a single artist
   */
  async processArtist(artist) {
    const spotifyId = this.extractSpotifyId(artist.external_identifiers);
    
    if (!spotifyId) {
      this.stats.artistsSkipped++;
      return { success: false, reason: 'No Spotify ID' };
    }

    this.stats.artistsWithSpotifyId++;

    try {
      const spotifyArtist = await this.fetchSpotifyArtist(spotifyId);
      
      if (!spotifyArtist.genres || !Array.isArray(spotifyArtist.genres) || spotifyArtist.genres.length === 0) {
        this.stats.artistsSkipped++;
        return { success: false, reason: 'No genres in Spotify response' };
      }

      await this.updateArtistGenres(artist.id, spotifyArtist.genres);
      this.stats.artistsUpdated++;

      return { 
        success: true, 
        genres: spotifyArtist.genres,
        spotifyId 
      };

    } catch (error) {
      this.stats.apiErrors++;
      console.error(`  ❌ Error processing ${artist.name} (Spotify ID: ${spotifyId}): ${error.message}`);
      
      // If rate limited, wait and return special status
      if (error.message.includes('Rate limited')) {
        const retryMatch = error.message.match(/Retry after (\d+) seconds/);
        if (retryMatch) {
          const waitTime = parseInt(retryMatch[1], 10);
          return { success: false, reason: 'rate_limited', waitTime };
        }
      }
      
      return { success: false, reason: error.message };
    }
  }

  /**
   * Main backfill process
   * @param {number} testLimit - Optional limit for testing (default: null = all)
   */
  async run(testLimit = null) {
    console.log('🎵 Starting Spotify Genre Backfill...\n');
    if (testLimit) {
      console.log(`🧪 TEST MODE: Processing only ${testLimit} artists\n`);
    }

    // Get all artists without genres
    console.log('📊 Fetching artists with no genres...');
    const artists = await this.getArtistsWithoutGenres(testLimit);
    this.stats.artistsFound = artists.length;
    
    console.log(`   Found ${artists.length} artists without genres\n`);

    if (artists.length === 0) {
      console.log('✅ No artists to process!');
      return;
    }

    console.log('🔄 Processing artists...\n');

    let processed = 0;
    const batchSize = 10; // Process 10 at a time

    for (let i = 0; i < artists.length; i += batchSize) {
      const batch = artists.slice(i, i + batchSize);
      
      for (const artist of batch) {
        processed++;
        const progress = `[${processed}/${artists.length}]`;
        console.log(`${progress} Processing: ${artist.name}`);
        
        const result = await this.processArtist(artist);
        
        if (result.success) {
          console.log(`  ✅ Updated with genres: ${result.genres.join(', ')}`);
        } else if (result.reason === 'rate_limited') {
          console.log(`  ⏸️  Rate limited. Waiting ${result.waitTime} seconds...`);
          await new Promise(resolve => setTimeout(resolve, (result.waitTime + 1) * 1000));
          // Retry this artist
          i--; // Go back one to retry
          processed--; // Don't count this as processed yet
          break; // Exit batch loop to retry
        } else {
          console.log(`  ⚠️  Skipped: ${result.reason}`);
        }

        // Small delay between API calls to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Brief pause between batches
      if (i + batchSize < artists.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Progress update every batch
      console.log(`\n📈 Progress: ${processed}/${artists.length} processed | ${this.stats.artistsUpdated} updated | ${this.stats.artistsSkipped} skipped\n`);
    }

    // Final statistics
    console.log('\n\n✨ Backfill Complete!');
    console.log('\n📊 Final Statistics:');
    console.log(`   Artists found (no genres): ${this.stats.artistsFound}`);
    console.log(`   Artists with Spotify ID: ${this.stats.artistsWithSpotifyId}`);
    console.log(`   Artists updated: ${this.stats.artistsUpdated}`);
    console.log(`   Artists skipped: ${this.stats.artistsSkipped}`);
    console.log(`   API errors: ${this.stats.apiErrors}`);
    console.log(`   Rate limit hits: ${this.stats.rateLimitHits}`);
  }
}

// Main execution
async function main() {
  await loadEnv();

  // Get credentials from command line arguments or environment variables
  const args = process.argv.slice(2);
  let clientId = args[0] || process.env.SPOTIFY_CLIENT_ID;
  let clientSecret = args[1] || process.env.SPOTIFY_CLIENT_SECRET;
  
  // Check for test mode flag (--test or --limit=N)
  let testLimit = null;
  const testFlagIndex = args.findIndex(arg => arg === '--test' || arg.startsWith('--limit='));
  if (testFlagIndex !== -1) {
    const flag = args[testFlagIndex];
    if (flag === '--test') {
      testLimit = 10;
    } else if (flag.startsWith('--limit=')) {
      testLimit = parseInt(flag.split('=')[1], 10);
    }
    // Remove the flag from args so it doesn't interfere with credential parsing
    args.splice(testFlagIndex, 1);
    // Re-parse credentials in case flag was first
    if (!clientId && args[0]) clientId = args[0];
    if (!clientSecret && args[1]) clientSecret = args[1];
  }

  if (!clientId || !clientSecret) {
    console.error('❌ Missing Spotify credentials!');
    console.error('Usage: node scripts/backfill-artist-genres-from-spotify.mjs [CLIENT_ID] [CLIENT_SECRET] [--test|--limit=N]');
    console.error('   OR: Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables');
    console.error('   Use --test for 10 artists, or --limit=N for custom limit');
    process.exit(1);
  }

  try {
    const backfill = new SpotifyGenreBackfill(clientId, clientSecret);
    await backfill.run(testLimit);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();

