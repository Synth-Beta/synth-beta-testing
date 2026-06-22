/**
 * Test genre fetching functionality only (no sync required)
 * Tests on sample artists to verify effectiveness
 */

import { fetchGenresForArtist, isEmptyGenres } from './fetch-artist-genres.mjs';

// Load environment variables
try {
  const dotenv = await import('dotenv');
  dotenv.default.config({ path: '.env.local' });
} catch (e) {
  // dotenv not installed
}

// Sample artists to test (with various external identifiers)
const testArtists = [
  {
    id: 'test-1',
    name: 'The Grateful Dead',
    external_identifiers: [
      {
        source: 'spotify',
        identifier: ['4vVEwJpJ5bCSgNcesKdAOT']
      }
    ]
  },
  {
    id: 'test-2',
    name: 'Phish',
    external_identifiers: [
      {
        source: 'spotify',
        identifier: ['3eqvTvw0B8MUgHz5UR0KJD']
      }
    ]
  },
  {
    id: 'test-3',
    name: 'Dead & Company',
    external_identifiers: [
      {
        source: 'spotify',
        identifier: ['4TtxVQ9fXrX3x23g3qfDXF']
      }
    ]
  },
  {
    id: 'test-4',
    name: 'Widespread Panic',
    external_identifiers: [
      {
        source: 'spotify',
        identifier: ['5M4pINQrkW88Usut2U4i3Y']
      }
    ]
  },
  {
    id: 'test-5',
    name: 'Umphrey\'s McGee',
    external_identifiers: [
      {
        source: 'spotify',
        identifier: ['2j0wQ9dmudXmyoTbyqYXSG']
      }
    ]
  },
  {
    id: 'test-6',
    name: 'String Cheese Incident',
    external_identifiers: [
      {
        source: 'spotify',
        identifier: ['3Lw3mlpm8r5XOf1m6YSq51']
      }
    ]
  },
  {
    id: 'test-7',
    name: 'moe.',
    external_identifiers: [
      {
        source: 'spotify',
        identifier: ['5d7fQ2aFpJicY2dPgd5K9S']
      }
    ]
  },
  {
    id: 'test-8',
    name: 'Lettuce',
    external_identifiers: [
      {
        source: 'spotify',
        identifier: ['1Tcl2ij3eC8b5TeI11Aadqd']
      }
    ]
  },
  {
    id: 'test-9',
    name: 'Tedeschi Trucks Band',
    external_identifiers: [
      {
        source: 'spotify',
        identifier: ['2gOghHZaUq9eB1sKNZdXvK']
      }
    ]
  },
  {
    id: 'test-10',
    name: 'Gov\'t Mule',
    external_identifiers: [
      {
        source: 'spotify',
        identifier: ['3hc6yqVJTlvKslvuvFllVX']
      }
    ]
  }
];

console.log('🧪 Testing Genre Fetching Functionality\n');
console.log('='.repeat(70));
console.log(`📊 Testing on ${testArtists.length} sample artists\n`);

const results = {
  success: 0,
  failed: 0,
  sources: {},
  artists: [],
  totalTime: 0
};

const startTime = Date.now();

for (let i = 0; i < testArtists.length; i++) {
  const artist = testArtists[i];
  console.log(`[${i + 1}/${testArtists.length}] ${artist.name}...`);
  
  try {
    const fetchStart = Date.now();
    const { genres, source } = await fetchGenresForArtist(artist);
    const fetchDuration = ((Date.now() - fetchStart) / 1000).toFixed(1);
    
    if (genres && genres.length > 0) {
      results.success++;
      results.sources[source] = (results.sources[source] || 0) + 1;
      results.artists.push({
        name: artist.name,
        genres,
        source,
        duration: `${fetchDuration}s`,
        success: true
      });
      console.log(`  ✓ Found via ${source} (${fetchDuration}s): ${genres.slice(0, 3).join(', ')}${genres.length > 3 ? '...' : ''}`);
    } else {
      results.failed++;
      results.artists.push({
        name: artist.name,
        genres: [],
        source: 'None',
        duration: `${fetchDuration}s`,
        success: false
      });
      console.log(`  ✗ No genres found (${fetchDuration}s)`);
    }
  } catch (error) {
    results.failed++;
    results.artists.push({
      name: artist.name,
      genres: [],
      source: 'Error',
      duration: 'N/A',
      success: false,
      error: error.message
    });
    console.log(`  ✗ Error: ${error.message}`);
  }
  
  // Small delay between requests to avoid rate limiting
  if (i < testArtists.length - 1) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

results.totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

console.log('\n' + '='.repeat(70));
console.log('📊 RESULTS SUMMARY');
console.log('='.repeat(70));
console.log(`✅ Successfully fetched genres: ${results.success}`);
console.log(`❌ Failed to fetch genres: ${results.failed}`);
console.log(`📈 Success rate: ${((results.success / testArtists.length) * 100).toFixed(1)}%`);
console.log(`⏱️  Total time: ${results.totalTime}s`);
console.log(`⏱️  Average time per artist: ${(results.totalTime / testArtists.length).toFixed(1)}s\n`);

console.log('📋 Sources:');
for (const [source, count] of Object.entries(results.sources)) {
  console.log(`  ${source}: ${count}`);
}

console.log('\n📝 Detailed Results:');
for (const artist of results.artists) {
  if (artist.success) {
    console.log(`  ✓ ${artist.name}: [${artist.genres.join(', ')}] via ${artist.source} (${artist.duration})`);
  } else {
    console.log(`  ✗ ${artist.name}: No genres found (${artist.duration})${artist.error ? ` - ${artist.error}` : ''}`);
  }
}

console.log('\n' + '='.repeat(70));
console.log('💡 Effectiveness Assessment:');
const successRate = results.success / testArtists.length;
if (successRate >= 0.8) {
  console.log('✅ EXCELLENT: Genre fetching is highly effective!');
  console.log('   Ready for production use in sync.');
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
