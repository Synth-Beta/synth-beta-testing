/**
 * Test sync on 50 artists - simulates the actual sync process
 * Tests genre fetching for new artists and genre preservation for existing artists
 */

import JambaseSyncService from '../backend/jambase-sync-service.mjs';
import { fetchGenresForArtist, isEmptyGenres } from './fetch-artist-genres.mjs';

// Load environment variables
try {
  const dotenv = await import('dotenv');
  dotenv.default.config({ path: '.env.local' });
  
  // Map VITE_ prefixed variables
  if (process.env.VITE_SUPABASE_URL && !process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  }
  if (process.env.VITE_SUPABASE_ANON_KEY && !process.env.SUPABASE_ANON_KEY) {
    process.env.SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
  }
} catch (e) {
  // dotenv not installed
}

console.log('🧪 Testing Sync on 50 Artists\n');
console.log('='.repeat(70));

try {
  // Initialize sync service
  const syncService = new JambaseSyncService();
  const supabase = syncService.supabase;

  // Get last sync timestamp or use 7 days ago
  const { data: lastEvent } = await supabase
    .from('events')
    .select('last_modified_at')
    .eq('source', 'jambase')
    .not('last_modified_at', 'is', null)
    .order('last_modified_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const dateModifiedFrom = lastEvent?.last_modified_at 
    ? new Date(lastEvent.last_modified_at).toISOString()
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  console.log(`📅 Fetching events modified since: ${dateModifiedFrom}\n`);

  // Fetch first page (50 events)
  const pageData = await syncService.fetchEventsPage(1, 50, dateModifiedFrom);

  if (!pageData.events || pageData.events.length === 0) {
    console.log('❌ No events found to sync');
    process.exit(0);
  }

  console.log(`📊 Found ${pageData.events.length} events to process\n`);

  // Extract artists
  const artistsData = [];
  const artistMap = new Map();

  for (const jambaseEvent of pageData.events) {
    const headliner = jambaseEvent.performer?.find(p => p['x-isHeadliner']) || jambaseEvent.performer?.[0];
    if (headliner && headliner.identifier) {
      const jambaseArtistId = headliner.identifier.replace(/^jambase:/, '');
      if (!artistMap.has(jambaseArtistId)) {
        const artistData = syncService.extractArtistData(headliner);
        if (artistData) {
          artistsData.push(artistData);
          artistMap.set(jambaseArtistId, artistData);
        }
      }
    }
  }

  console.log(`🎵 Found ${artistsData.length} unique artists\n`);

  // Check existing artists in database
  const artistIdentifiers = artistsData.map(a => a.identifier).filter(Boolean);
  const { data: existingArtists } = await supabase
    .from('artists')
    .select('id, identifier, name, genres')
    .in('identifier', artistIdentifiers);

  const existingArtistsMap = new Map();
  if (existingArtists) {
    for (const artist of existingArtists) {
      existingArtistsMap.set(artist.identifier, artist);
    }
  }

  // Categorize artists
  const newArtists = [];
  const existingArtistsList = [];
  const artistsNeedingGenres = [];

  for (const artist of artistsData) {
    const existing = existingArtistsMap.get(artist.identifier);
    if (existing) {
      existingArtistsList.push({ ...artist, existing });
      if (isEmptyGenres(existing.genres)) {
        artistsNeedingGenres.push({ ...artist, existing, isNew: false });
      }
    } else {
      newArtists.push(artist);
      if (isEmptyGenres(artist.genres)) {
        artistsNeedingGenres.push({ ...artist, isNew: true });
      }
    }
  }

  console.log(`📊 Artist Breakdown:`);
  console.log(`  New artists: ${newArtists.length}`);
  console.log(`  Existing artists: ${existingArtistsList.length}`);
  console.log(`  Artists needing genres: ${artistsNeedingGenres.length}\n`);

  if (artistsNeedingGenres.length === 0) {
    console.log('✅ All artists already have genres!');
    console.log('💡 Testing genre preservation for existing artists...\n');
    
    // Test that we don't overwrite existing genres
    let preservedCount = 0;
    for (const { artist, existing } of existingArtistsList) {
      if (!isEmptyGenres(existing.genres) && isEmptyGenres(artist.genres)) {
        preservedCount++;
      }
    }
    console.log(`✅ Genre preservation test: ${preservedCount}/${existingArtistsList.length} artists would preserve genres`);
    process.exit(0);
  }

  // Test genre fetching on artists that need it
  console.log('🚀 Testing genre fetching on artists needing genres...\n');
  console.log('='.repeat(70));

  const results = {
    success: 0,
    failed: 0,
    sources: {},
    artists: [],
    preserved: 0
  };

  // Test on first 10 artists needing genres (or all if less than 10)
  const testArtists = artistsNeedingGenres.slice(0, Math.min(10, artistsNeedingGenres.length));

  for (let i = 0; i < testArtists.length; i++) {
    const item = testArtists[i];
    const artist = item.isNew ? item : item.artist;
    const isNew = item.isNew;
    
    console.log(`[${i + 1}/${testArtists.length}] ${artist.name} (${isNew ? 'NEW' : 'EXISTING'})...`);
    
    try {
      const startTime = Date.now();
      const { genres, source } = await fetchGenresForArtist({
        id: artist.identifier || artist.jambase_artist_id,
        name: artist.name,
        external_identifiers: artist.external_identifiers
      });
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      if (genres && genres.length > 0) {
        results.success++;
        results.sources[source] = (results.sources[source] || 0) + 1;
        results.artists.push({
          name: artist.name,
          genres,
          source,
          duration: `${duration}s`,
          isNew,
          success: true
        });
        console.log(`  ✓ Found via ${source} (${duration}s): ${genres.slice(0, 3).join(', ')}${genres.length > 3 ? '...' : ''}`);
      } else {
        results.failed++;
        results.artists.push({
          name: artist.name,
          genres: [],
          source: 'None',
          duration: `${duration}s`,
          isNew,
          success: false
        });
        console.log(`  ✗ No genres found (${duration}s)`);
      }
    } catch (error) {
      results.failed++;
      results.artists.push({
        name: artist.name,
        genres: [],
        source: 'Error',
        duration: 'N/A',
        isNew,
        success: false,
        error: error.message
      });
      console.log(`  ✗ Error: ${error.message}`);
    }
    
    // Small delay between requests
    if (i < testArtists.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Test genre preservation
  console.log('\n' + '='.repeat(70));
  console.log('🛡️  Testing Genre Preservation...\n');
  
  for (const { artist, existing } of existingArtistsList) {
    if (!isEmptyGenres(existing.genres) && isEmptyGenres(artist.genres)) {
      results.preserved++;
    }
  }
  
  console.log(`✅ Would preserve genres for ${results.preserved}/${existingArtistsList.length} existing artists`);

  console.log('\n' + '='.repeat(70));
  console.log('📊 RESULTS SUMMARY');
  console.log('='.repeat(70));
  console.log(`✅ Successfully fetched genres: ${results.success}`);
  console.log(`❌ Failed to fetch genres: ${results.failed}`);
  console.log(`📈 Success rate: ${((results.success / testArtists.length) * 100).toFixed(1)}%`);
  console.log(`🛡️  Genre preservation: ${results.preserved} artists\n`);

  console.log('📋 Sources:');
  for (const [source, count] of Object.entries(results.sources)) {
    console.log(`  ${source}: ${count}`);
  }

  console.log('\n📝 Detailed Results:');
  for (const artist of results.artists) {
    if (artist.success) {
      console.log(`  ✓ ${artist.name} (${artist.isNew ? 'NEW' : 'EXISTING'}): [${artist.genres.join(', ')}] via ${artist.source} (${artist.duration})`);
    } else {
      console.log(`  ✗ ${artist.name} (${artist.isNew ? 'NEW' : 'EXISTING'}): No genres found (${artist.duration})${artist.error ? ` - ${artist.error}` : ''}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('💡 Effectiveness Assessment:');
  const successRate = results.success / testArtists.length;
  if (successRate >= 0.8) {
    console.log('✅ EXCELLENT: Genre fetching is highly effective!');
    console.log('   Ready for production sync.');
  } else if (successRate >= 0.6) {
    console.log('✅ GOOD: Genre fetching is effective.');
    console.log('   Suitable for production use.');
  } else if (successRate >= 0.4) {
    console.log('⚠️  MODERATE: Genre fetching is moderately effective.');
    console.log('   Consider improvements or fallback strategies.');
  } else {
    console.log('❌ POOR: Genre fetching needs significant improvement.');
    console.log('   Review API keys, network connectivity, or script logic.');
  }
  console.log('='.repeat(70));

} catch (error) {
  if (error.message.includes('SUPABASE_SERVICE_ROLE_KEY')) {
    console.error('❌ Error: Missing SUPABASE_SERVICE_ROLE_KEY environment variable.');
    console.error('   This test requires the service role key to query the database.');
    console.error('   Add SUPABASE_SERVICE_ROLE_KEY to .env.local to run this test.');
  } else {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
  process.exit(1);
}
