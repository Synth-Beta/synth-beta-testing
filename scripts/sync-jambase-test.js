/**
 * Test Jambase Sync - Second Page (100 Events)
 * 
 * Fetches and processes the second page (100 events) to verify:
 * - Data extraction works correctly
 * - Foreign keys are properly linked
 * - All fields are mapped correctly
 * - Updates to extraction logic are working
 */

import JambaseSyncService from '../backend/jambase-sync-service.mjs';

// Load environment variables (dotenv may not be installed, but env vars should be set)
async function loadEnv() {
  try {
    const dotenv = await import('dotenv');
    dotenv.default.config({ path: '.env.local' });
  } catch (e) {
    // dotenv not installed, assume env vars are already set
  }
}

async function testSync() {
  await loadEnv();
  console.log('🧪 Starting Jambase Sync Test (Second Page - 100 events)...\n');

  const syncService = new JambaseSyncService();

  try {
    // Fetch second page with full 100 events
    console.log('📡 Fetching second page (100 events) from Jambase API...');
    const { events, pagination, totalItems, totalPages } = await syncService.fetchEventsPage(2, 100);

    if (!events || events.length === 0) {
      console.error('❌ No events returned from API');
      process.exit(1);
    }

    console.log(`✅ Fetched ${events.length} events`);
    console.log(`📊 Total pages: ${totalPages}`);
    console.log(`📊 Total items: ${totalItems || 'unknown'}\n`);

    // Process the events
    console.log('🔄 Processing events...');
    const result = await syncService.processPage(events);

    console.log('\n📊 Processing Results:');
    console.log(`  - Artists processed: ${result.artistsProcessed}`);
    console.log(`  - Venues processed: ${result.venuesProcessed}`);
    console.log(`  - Events processed: ${result.eventsProcessed}`);

    // Get final stats
    const stats = syncService.getStats();
    console.log('\n📈 Statistics:');
    console.log(`  - API calls: ${stats.apiCalls}`);
    console.log(`  - Total events processed: ${stats.eventsProcessed}`);
    console.log(`  - Total artists processed: ${stats.artistsProcessed}`);
    console.log(`  - Total venues processed: ${stats.venuesProcessed}`);
    console.log(`  - Errors: ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      stats.errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error.type}: ${error.error}`);
      });
    }

    // Verify data in database
    console.log('\n🔍 Verifying data in database...');
    const { data: eventsData, error: eventsError } = await syncService.supabase
      .from('events')
      .select('id, jambase_event_id, title, artist_name, venue_name, artist_jambase_id, venue_jambase_id, last_modified_at')
      .eq('source', 'jambase')
      .order('created_at', { ascending: false })
      .limit(10);

    if (eventsError) {
      console.error('❌ Error querying events:', eventsError);
    } else {
      console.log(`✅ Found ${eventsData.length} events in database (showing first 10):`);
      eventsData.slice(0, 5).forEach((event, i) => {
        console.log(`\n  Event ${i + 1}:`);
        console.log(`    ID: ${event.id}`);
        console.log(`    Jambase ID: ${event.jambase_event_id}`);
        console.log(`    Title: ${event.title}`);
        console.log(`    Artist: ${event.artist_name} (FK: ${event.artist_jambase_id ? '✅' : '❌'})`);
        console.log(`    Venue: ${event.venue_name} (FK: ${event.venue_jambase_id ? '✅' : '❌'})`);
        console.log(`    Last Modified: ${event.last_modified_at || '❌ NOT SET'}`);
      });
      if (eventsData.length > 5) {
        console.log(`\n  ... and ${eventsData.length - 5} more events`);
      }
    }

    // Verify artists
    const { data: artistsData, error: artistsError } = await syncService.supabase
      .from('artists')
      .select('id, jambase_artist_id, name, identifier')
      .order('created_at', { ascending: false })
      .limit(10);

    if (artistsError) {
      console.error('❌ Error querying artists:', artistsError);
    } else {
      console.log(`\n✅ Found ${artistsData.length} artists in database (showing up to 10)`);
    }

    // Verify venues
    const { data: venuesData, error: venuesError } = await syncService.supabase
      .from('venues')
      .select('id, jambase_venue_id, name, identifier')
      .order('created_at', { ascending: false })
      .limit(10);

    if (venuesError) {
      console.error('❌ Error querying venues:', venuesError);
    } else {
      console.log(`✅ Found ${venuesData.length} venues in database (showing up to 10)`);
    }

    // Check for venue address columns
    const { data: venueSample, error: venueSampleError } = await syncService.supabase
      .from('venues')
      .select('id, name, street_address, state, country, zip, latitude, longitude')
      .not('street_address', 'is', null)
      .limit(5);

    if (!venueSampleError && venueSample && venueSample.length > 0) {
      console.log(`\n✅ Sample venue with address data (showing first venue with address):`);
      const venue = venueSample[0];
      console.log(`    Name: ${venue.name}`);
      console.log(`    Street: ${venue.street_address || 'null'}`);
      console.log(`    State: ${venue.state || 'null'}`);
      console.log(`    Country: ${venue.country || 'null'}`);
      console.log(`    ZIP: ${venue.zip || 'null'}`);
      console.log(`    Lat/Lng: ${venue.latitude || 'null'}, ${venue.longitude || 'null'}`);
    }

    // Check for artist founding data (should be null, but verify extraction logic)
    const { data: artistSample, error: artistSampleError } = await syncService.supabase
      .from('artists')
      .select('id, name, founding_location, founding_date, members')
      .order('created_at', { ascending: false })
      .limit(5);

    if (!artistSampleError && artistSample && artistSample.length > 0) {
      console.log(`\n✅ Sample artists (founding data expected to be null from events endpoint):`);
      artistSample.forEach((artist, i) => {
        console.log(`    ${i + 1}. ${artist.name}:`);
        console.log(`       Founding Location: ${artist.founding_location || 'null (expected)'}`);
        console.log(`       Founding Date: ${artist.founding_date || 'null (expected)'}`);
        console.log(`       Members: ${artist.members ? 'present' : 'null (expected)'}`);
      });
    }

    console.log('\n✨ Test complete!');
    console.log('\n📝 Next steps:');
    console.log('  1. Verify the events in your database');
    console.log('  2. Check that foreign keys are properly linked');
    console.log('  3. Verify venue address columns are populated');
    console.log('  4. Verify artist founding data is null (expected from events endpoint)');
    console.log('  5. If everything looks good, proceed to full sync');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run test
testSync().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

