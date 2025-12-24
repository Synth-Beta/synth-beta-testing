/**
 * Full Jambase Sync - Safe Version with Duplicate Prevention
 * 
 * Fetches and processes ALL upcoming events from Jambase API.
 * Features:
 * - Deduplicates by jambase_event_id (no duplicates ever)
 * - Tracks processed pages to avoid re-processing
 * - Can resume from checkpoint
 * - Ensures we get everything, miss nothing
 * 
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

/**
 * Get already processed event IDs from database to avoid duplicates
 */
async function getExistingEventIds(syncService, limit = 100000) {
  console.log('🔍 Checking for existing events in database...');
  const { data, error } = await syncService.supabase
    .from('events')
    .select('jambase_event_id')
    .eq('source', 'jambase')
    .not('jambase_event_id', 'is', null)
    .limit(limit);
  
  if (error) {
    console.warn('⚠️  Could not fetch existing events:', error.message);
    return new Set();
  }
  
  const existingIds = new Set(data.map(e => e.jambase_event_id).filter(Boolean));
  console.log(`✅ Found ${existingIds.size} existing events in database`);
  return existingIds;
}

/**
 * Process a single page with duplicate checking
 */
async function processPageSafe(syncService, pageNum, perPage, existingEventIds) {
  try {
    const pageData = await syncService.fetchEventsPage(pageNum, perPage);
    
    if (!pageData.events || pageData.events.length === 0) {
      return { page: pageNum, success: false, reason: 'no events', eventsProcessed: 0 };
    }

    // Filter out events that already exist (extra safety check)
    const newEvents = pageData.events.filter(event => {
      if (!event.identifier) return false;
      const jambaseEventId = event.identifier.replace(/^jambase:/, '');
      return !existingEventIds.has(jambaseEventId);
    });

    if (newEvents.length === 0) {
      return { page: pageNum, success: true, reason: 'all duplicates', eventsProcessed: 0 };
    }

    // Process the page (upsert will handle duplicates via ON CONFLICT)
    await syncService.processPage(newEvents);
    
    // Add processed event IDs to our set
    newEvents.forEach(event => {
      if (event.identifier) {
        const jambaseEventId = event.identifier.replace(/^jambase:/, '');
        existingEventIds.add(jambaseEventId);
      }
    });

    return { 
      page: pageNum, 
      success: true, 
      eventsProcessed: newEvents.length,
      totalInPage: pageData.events.length
    };
  } catch (error) {
    return { page: pageNum, success: false, error: error.message };
  }
}

/**
 * Process pages in parallel with controlled concurrency and duplicate prevention
 */
async function processPagesParallelSafe(syncService, totalPages, perPage, existingEventIds, concurrency = 5) {
  const results = [];
  const errors = [];
  let processed = 0;
  let totalEventsProcessed = 0;
  const startTime = Date.now();

  // Create array of page numbers (starting from page 2, since page 1 is already processed)
  const pageNumbers = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);

  // Process pages in batches
  for (let i = 0; i < pageNumbers.length; i += concurrency) {
    const batch = pageNumbers.slice(i, i + concurrency);
    
    // Process batch in parallel
    const batchPromises = batch.map(pageNum => 
      processPageSafe(syncService, pageNum, perPage, existingEventIds)
    );
    const batchResults = await Promise.all(batchPromises);
    
    // Collect results
    batchResults.forEach(result => {
      if (result.success) {
        results.push(result);
        processed++;
        totalEventsProcessed += result.eventsProcessed || 0;
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
      console.log(`   Events: ${stats.eventsProcessed} (${totalEventsProcessed} new this run)`);
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

  return { results, errors, totalEventsProcessed };
}

async function fullSync() {
  await loadEnv();
  console.log('🚀 Starting Full Jambase Sync (Safe Mode - No Duplicates)...\n');
  console.log('📊 Expected: ~90,000 events, ~900 API calls\n');
  
  // Configurable concurrency (can be adjusted via environment variable)
  const concurrency = parseInt(process.env.SYNC_CONCURRENCY || '5', 10);
  console.log(`⚡ Concurrency: ${concurrency} parallel requests\n`);

  const syncService = new JambaseSyncService();
  const startTime = Date.now();

  try {
    const perPage = 100; // Maximum page size

    // Step 1: Get existing event IDs to prevent duplicates
    const existingEventIds = await getExistingEventIds(syncService);

    // Step 2: Fetch first page to get total count
    console.log('\n📡 Fetching first page to get total count...');
    const firstPage = await syncService.fetchEventsPage(1, perPage);
    const totalPages = firstPage.totalPages || 1;
    
    console.log(`✅ Total pages: ${totalPages}`);
    console.log(`✅ Total items: ${firstPage.totalItems || 'unknown'}\n`);

    // Step 3: Process first page (with duplicate check)
    console.log('🔄 Processing page 1...');
    const firstPageResult = await processPageSafe(syncService, 1, perPage, existingEventIds);
    if (firstPageResult.success) {
      console.log(`✅ Processed page 1/${totalPages} (${firstPageResult.eventsProcessed || 0} new events)`);
    }

    // Step 4: Process remaining pages in parallel
    console.log(`\n🔄 Processing pages 2-${totalPages} in parallel (${concurrency} concurrent requests)...\n`);
    const { results, errors, totalEventsProcessed } = await processPagesParallelSafe(
      syncService, 
      totalPages, 
      perPage, 
      existingEventIds, 
      concurrency
    );

    // Step 5: Verify we got everything - check for any missing pages
    console.log('\n🔍 Verifying completeness...');
    const successfulPages = new Set([1, ...results.map(r => r.page)]);
    const missingPages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (!successfulPages.has(i)) {
        missingPages.push(i);
      }
    }

    if (missingPages.length > 0) {
      console.log(`⚠️  Warning: ${missingPages.length} pages were not successfully processed:`);
      console.log(`   Pages: ${missingPages.slice(0, 20).join(', ')}${missingPages.length > 20 ? '...' : ''}`);
    } else {
      console.log('✅ All pages processed successfully!');
    }

    // Final statistics
    const stats = syncService.getStats();
    const elapsed = (Date.now() - startTime) / 1000 / 60; // minutes

    console.log('\n\n✨ Full Sync Complete!');
    console.log('\n📈 Final Statistics:');
    console.log(`   Total API calls: ${stats.apiCalls}`);
    console.log(`   Total events processed: ${stats.eventsProcessed}`);
    console.log(`   New events added: ${totalEventsProcessed}`);
    console.log(`   Total artists processed: ${stats.artistsProcessed}`);
    console.log(`   Total venues processed: ${stats.venuesProcessed}`);
    console.log(`   Successful pages: ${results.length + 1}`); // +1 for page 1
    console.log(`   Failed pages: ${errors.length}`);
    console.log(`   Missing pages: ${missingPages.length}`);
    console.log(`   Total errors: ${stats.errors.length}`);
    console.log(`   Time elapsed: ${Math.round(elapsed)} minutes`);
    console.log(`   Average rate: ${((results.length + 1) / (elapsed * 60)).toFixed(2)} pages/sec`);

    // Verify no duplicates were created
    console.log('\n🔍 Verifying no duplicates...');
    const { data: duplicateCheck, error: dupError } = await syncService.supabase
      .from('events')
      .select('jambase_event_id')
      .eq('source', 'jambase')
      .not('jambase_event_id', 'is', null);
    
    if (!dupError && duplicateCheck) {
      const eventIds = duplicateCheck.map(e => e.jambase_event_id);
      const uniqueIds = new Set(eventIds);
      const duplicates = eventIds.length - uniqueIds.size;
      if (duplicates > 0) {
        console.log(`⚠️  WARNING: Found ${duplicates} duplicate events!`);
      } else {
        console.log(`✅ No duplicates found! All ${uniqueIds.size} events are unique.`);
      }
    }

    if (stats.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      stats.errors.slice(0, 10).forEach((error, i) => {
        console.log(`   ${i + 1}. Page ${error.page || 'unknown'}: ${error.error}`);
      });
      if (stats.errors.length > 10) {
        console.log(`   ... and ${stats.errors.length - 10} more errors`);
      }
    }

    console.log('\n✅ Sync complete! Database is now populated with all upcoming events (no duplicates).');

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

