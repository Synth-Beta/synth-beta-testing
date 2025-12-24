/**
 * Full Jambase Sync - All Upcoming Events
 * 
 * Fetches and processes ALL upcoming events from Jambase API.
 * Expected: ~90,000 events, ~900 API calls
 */

import JambaseSyncService from '../backend/jambase-sync-service.mjs';

// Load environment variables
async function loadEnv() {
  try {
    const dotenv = await import('dotenv');
    dotenv.default.config({ path: '.env.local' });
  } catch (e) {
    // dotenv not installed, assume env vars are already set
  }
}

async function fullSync() {
  await loadEnv();
  console.log('🚀 Starting Full Jambase Sync...\n');
  console.log('📊 Expected: ~90,000 events, ~900 API calls\n');

  const syncService = new JambaseSyncService();
  const startTime = Date.now();

  try {
    let currentPage = 1;
    let totalPages = 1;
    const perPage = 100; // Maximum page size

    // Fetch first page to get total count
    console.log('📡 Fetching first page to get total count...');
    const firstPage = await syncService.fetchEventsPage(1, perPage);
    totalPages = firstPage.totalPages || 1;
    
    console.log(`✅ Total pages: ${totalPages}`);
    console.log(`✅ Total items: ${firstPage.totalItems || 'unknown'}\n`);

    // Process first page
    await syncService.processPage(firstPage.events);
    console.log(`✅ Processed page 1/${totalPages}`);

    // Process remaining pages
    for (currentPage = 2; currentPage <= totalPages; currentPage++) {
      try {
        const pageData = await syncService.fetchEventsPage(currentPage, perPage);
        
        if (!pageData.events || pageData.events.length === 0) {
          console.log(`⚠️  Page ${currentPage} returned no events, stopping`);
          break;
        }

        await syncService.processPage(pageData.events);

        // Log progress every 10 pages
        if (currentPage % 10 === 0) {
          const stats = syncService.getStats();
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = currentPage / elapsed;
          const remaining = totalPages - currentPage;
          const eta = remaining / rate;
          
          console.log(`\n📊 Progress: ${currentPage}/${totalPages} pages (${Math.round((currentPage / totalPages) * 100)}%)`);
          console.log(`   Events: ${stats.eventsProcessed}`);
          console.log(`   Artists: ${stats.artistsProcessed}`);
          console.log(`   Venues: ${stats.venuesProcessed}`);
          console.log(`   API Calls: ${stats.apiCalls}`);
          console.log(`   ETA: ${Math.round(eta / 60)} minutes\n`);
        } else {
          process.stdout.write(`.`);
        }

        // Small delay to avoid rate limiting
        if (currentPage < totalPages) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (error) {
        console.error(`\n❌ Error processing page ${currentPage}:`, error.message);
        syncService.stats.errors.push({ page: currentPage, error: error.message });
        
        // Continue to next page
        continue;
      }
    }

    // Final statistics
    const stats = syncService.getStats();
    const elapsed = (Date.now() - startTime) / 1000 / 60; // minutes

    console.log('\n\n✨ Full Sync Complete!');
    console.log('\n📈 Final Statistics:');
    console.log(`   Total API calls: ${stats.apiCalls}`);
    console.log(`   Total events processed: ${stats.eventsProcessed}`);
    console.log(`   Total artists processed: ${stats.artistsProcessed}`);
    console.log(`   Total venues processed: ${stats.venuesProcessed}`);
    console.log(`   Total errors: ${stats.errors.length}`);
    console.log(`   Time elapsed: ${Math.round(elapsed)} minutes`);

    if (stats.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      stats.errors.slice(0, 10).forEach((error, i) => {
        console.log(`   ${i + 1}. Page ${error.page || 'unknown'}: ${error.error}`);
      });
      if (stats.errors.length > 10) {
        console.log(`   ... and ${stats.errors.length - 10} more errors`);
      }
    }

    console.log('\n✅ Sync complete! Database is now populated with all upcoming events.');

  } catch (error) {
    console.error('❌ Full sync failed:', error);
    const stats = syncService.getStats();
    console.log(`\n📊 Progress before failure:`);
    console.log(`   Pages processed: ${stats.apiCalls}`);
    console.log(`   Events processed: ${stats.eventsProcessed}`);
    process.exit(1);
  }
}

// Run full sync
fullSync().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

