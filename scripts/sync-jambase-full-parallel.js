/**
 * Full Jambase Sync - Parallel Version
 * 
 * Fetches and processes ALL upcoming events from Jambase API using parallel processing.
 * Expected: ~90,000 events, ~900 API calls
 * 
 * Parallelization:
 * - Processes multiple pages concurrently (configurable concurrency limit)
 * - Batches database operations for efficiency
 * - Respects rate limits with controlled concurrency
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

/**
 * Process a single page with error handling
 */
async function processPage(syncService, pageNum, perPage) {
  try {
    const pageData = await syncService.fetchEventsPage(pageNum, perPage);
    
    if (!pageData.events || pageData.events.length === 0) {
      return { page: pageNum, success: false, reason: 'no events' };
    }

    await syncService.processPage(pageData.events);
    return { page: pageNum, success: true, eventsCount: pageData.events.length };
  } catch (error) {
    return { page: pageNum, success: false, error: error.message };
  }
}

/**
 * Process pages in parallel with controlled concurrency
 */
async function processPagesParallel(syncService, totalPages, perPage, concurrency = 5) {
  const results = [];
  const errors = [];
  let processed = 0;
  const startTime = Date.now();

  // Create array of page numbers (starting from page 2, since page 1 is already processed)
  const pageNumbers = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);

  // Process pages in batches
  for (let i = 0; i < pageNumbers.length; i += concurrency) {
    const batch = pageNumbers.slice(i, i + concurrency);
    
    // Process batch in parallel
    const batchPromises = batch.map(pageNum => processPage(syncService, pageNum, perPage));
    const batchResults = await Promise.all(batchPromises);
    
    // Collect results
    batchResults.forEach(result => {
      if (result.success) {
        results.push(result);
        processed++;
      } else {
        errors.push(result);
        if (result.error) {
          syncService.stats.errors.push({ page: result.page, error: result.error });
        }
      }
    });

    // Progress reporting
    const totalProcessed = processed + 1; // +1 for page 1
    if (totalProcessed % 50 === 0 || i + concurrency >= pageNumbers.length) {
      const stats = syncService.getStats();
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = totalProcessed / elapsed;
      const remaining = totalPages - totalProcessed;
      const eta = remaining / rate;
      
      console.log(`\n📊 Progress: ${totalProcessed}/${totalPages} pages (${Math.round((totalProcessed / totalPages) * 100)}%)`);
      console.log(`   Events: ${stats.eventsProcessed}`);
      console.log(`   Artists: ${stats.artistsProcessed}`);
      console.log(`   Venues: ${stats.venuesProcessed}`);
      console.log(`   API Calls: ${stats.apiCalls}`);
      console.log(`   Rate: ${rate.toFixed(2)} pages/sec`);
      console.log(`   ETA: ${Math.round(eta / 60)} minutes`);
    } else {
      process.stdout.write(`.`);
    }

    // Small delay between batches to avoid overwhelming the API
    if (i + concurrency < pageNumbers.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  return { results, errors };
}

async function fullSync() {
  await loadEnv();
  console.log('🚀 Starting Full Jambase Sync (Parallel Mode)...\n');
  console.log('📊 Expected: ~90,000 events, ~900 API calls\n');
  
  // Configurable concurrency (can be adjusted via environment variable)
  const concurrency = parseInt(process.env.SYNC_CONCURRENCY || '5', 10);
  console.log(`⚡ Concurrency: ${concurrency} parallel requests\n`);

  const syncService = new JambaseSyncService();
  const startTime = Date.now();

  try {
    const perPage = 100; // Maximum page size

    // Fetch first page to get total count
    console.log('📡 Fetching first page to get total count...');
    const firstPage = await syncService.fetchEventsPage(1, perPage);
    const totalPages = firstPage.totalPages || 1;
    
    console.log(`✅ Total pages: ${totalPages}`);
    console.log(`✅ Total items: ${firstPage.totalItems || 'unknown'}\n`);

    // Process first page
    await syncService.processPage(firstPage.events);
    console.log(`✅ Processed page 1/${totalPages}\n`);

    // Process remaining pages in parallel
    console.log(`🔄 Processing pages 2-${totalPages} in parallel (${concurrency} concurrent requests)...\n`);
    const { results, errors } = await processPagesParallel(syncService, totalPages, perPage, concurrency);

    // Final statistics
    const stats = syncService.getStats();
    const elapsed = (Date.now() - startTime) / 1000 / 60; // minutes

    console.log('\n\n✨ Full Sync Complete!');
    console.log('\n📈 Final Statistics:');
    console.log(`   Total API calls: ${stats.apiCalls}`);
    console.log(`   Total events processed: ${stats.eventsProcessed}`);
    console.log(`   Total artists processed: ${stats.artistsProcessed}`);
    console.log(`   Total venues processed: ${stats.venuesProcessed}`);
    console.log(`   Successful pages: ${results.length + 1}`); // +1 for page 1
    console.log(`   Failed pages: ${errors.length}`);
    console.log(`   Total errors: ${stats.errors.length}`);
    console.log(`   Time elapsed: ${Math.round(elapsed)} minutes`);
    console.log(`   Average rate: ${((results.length + 1) / (elapsed * 60)).toFixed(2)} pages/sec`);

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

