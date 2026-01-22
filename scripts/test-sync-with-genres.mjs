/**
 * Test sync with genre fetching - limited to 50 events
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

// Initialize sync service (handles client creation)
const syncService = new JambaseSyncService();
const supabase = syncService.supabase;

console.log('🧪 Testing Sync with Genre Fetching (50 events limit)\n');
console.log('=' .repeat(70));

// Get last sync timestamp
const { data: lastEvent } = await supabase
  .from('events')
  .select('last_modified_at')
  .eq('source', 'jambase')
  .not('last_modified_at', 'is', null)
  .order('last_modified_at', { ascending: false })
  .limit(1)
  .single();

const dateModifiedFrom = lastEvent?.last_modified_at 
  ? new Date(lastEvent.last_modified_at).toISOString()
  : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days ago

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

// Check which artists need genre fetching
const artistsNeedingGenres = artistsData.filter(a => isEmptyGenres(a.genres));
console.log(`🔍 Artists needing genres: ${artistsNeedingGenres.length}`);
console.log(`✅ Artists with genres: ${artistsData.length - artistsNeedingGenres.length}\n`);

if (artistsNeedingGenres.length === 0) {
  console.log('✅ All artists already have genres!');
  process.exit(0);
}

// Test genre fetching
console.log('🚀 Testing genre fetching...\n');
console.log('=' .repeat(70));

const results = {
  success: 0,
  failed: 0,
  sources: {},
  artists: []
};

for (let i = 0; i < Math.min(artistsNeedingGenres.length, 10); i++) {
  const artist = artistsNeedingGenres[i];
  console.log(`[${i + 1}/${Math.min(artistsNeedingGenres.length, 10)}] ${artist.name}...`);
  
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
        duration: `${duration}s`
      });
      console.log(`  ✓ Found via ${source} (${duration}s): ${genres.slice(0, 3).join(', ')}${genres.length > 3 ? '...' : ''}`);
    } else {
      results.failed++;
      results.artists.push({
        name: artist.name,
        genres: [],
        source: 'None',
        duration: `${duration}s`
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
      error: error.message
    });
    console.log(`  ✗ Error: ${error.message}`);
  }
  
  // Small delay between requests
  await new Promise(resolve => setTimeout(resolve, 500));
}

console.log('\n' + '='.repeat(70));
console.log('📊 RESULTS SUMMARY');
console.log('='.repeat(70));
console.log(`✅ Successfully fetched genres: ${results.success}`);
console.log(`❌ Failed to fetch genres: ${results.failed}`);
console.log(`📈 Success rate: ${((results.success / (results.success + results.failed)) * 100).toFixed(1)}%\n`);

console.log('📋 Sources:');
for (const [source, count] of Object.entries(results.sources)) {
  console.log(`  ${source}: ${count}`);
}

console.log('\n📝 Detailed Results:');
for (const artist of results.artists) {
  if (artist.genres.length > 0) {
    console.log(`  ✓ ${artist.name}: [${artist.genres.join(', ')}] via ${artist.source} (${artist.duration})`);
  } else {
    console.log(`  ✗ ${artist.name}: No genres found (${artist.duration})${artist.error ? ` - ${artist.error}` : ''}`);
  }
}

console.log('\n' + '='.repeat(70));
console.log('💡 Recommendation:');
if (results.success / (results.success + results.failed) >= 0.7) {
  console.log('✅ Genre fetching is effective! Ready for production sync.');
} else if (results.success / (results.success + results.failed) >= 0.5) {
  console.log('⚠️  Genre fetching is moderately effective. Consider improvements.');
} else {
  console.log('❌ Genre fetching needs improvement before production use.');
}
console.log('='.repeat(70));
