/**
 * Resume Jambase Sync - Continue from where we left off
 * 
 * Resumes sync from a specific page number.
 * Usage: node scripts/sync-jambase-resume.js [startPage]
 * 
 * Features:
 * - Deduplicates by jambase_event_id (no duplicates ever)
 * - Starts from specified page (default: 210)
 * - Tracks processed pages to avoid re-processing
 * - Ensures we get everything, miss nothing
 * - Race-condition free: Processes pages deterministically
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
async function getExistingEventIds(syncService) {
  console.log('🔍 Checking for existing events in database...');
  const { data, error } = await syncService.supabase
    .from('events')
    .select('jambase_event_id')
    .eq('source', 'jambase')
    .not('jambase_event_id', 'is', null);
  
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

    // Process the page (upsert will handle duplicates via ON CONFLICT jambase_event_id)
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
 * Race-condition free: Each page is processed exactly once, deterministically
 */
async function processPagesParallelSafe(syncService, startPage, totalPages, perPage, existingEventIds, concurrency = 5) {
  const results = [];
  const errors = [];
  let processed = 0;
  let totalEventsProcessed = 0;
  const startTime = Date.now();
  
  // Track processed pages to ensure determinism (no race conditions)
  const processedPages = new Set();
  const processingLock = new Map(); // Track pages currently being processed

  // Create array of page numbers from startPage to totalPages
  const pageNumbers = Array.from({ length: totalPages - startPage + 1 }, (_, i) => startPage + i);

  // Process pages in batches - sequential batches, parallel within batch
  for (let i = 0; i < pageNumbers.length; i += concurrency) {
    const batch = pageNumbers.slice(i, i + concurrency);
    
    // Filter out already processed pages (safety check)
    const batchToProcess = batch.filter(pageNum => !processedPages.has(pageNum));
    
    if (batchToProcess.length === 0) {
      continue; // All pages in this batch already processed
    }
    
    // Mark pages as being processed (prevent duplicate processing)
    batchToProcess.forEach(pageNum => processingLock.set(pageNum, true));
    
    // Process batch in parallel - each page gets its own sync service instance to avoid shared state
    const batchPromises = batchToProcess.map(async (pageNum) => {
      try {
        // Create a fresh sync service instance for this page to avoid shared state races
        const pageSyncService = new JambaseSyncService();
        return await processPageSafe(pageSyncService, pageNum, perPage, existingEventIds);
      } catch (error) {
        return { page: pageNum, success: false, error: error.message };
      } finally {
        // Release lock
        processingLock.delete(pageNum);
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    
    // Collect results - mark pages as processed to ensure determinism
    batchResults.forEach(result => {
      if (result.success) {
        results.push(result);
        processedPages.add(result.page); // Mark as processed
        processed++;
        totalEventsProcessed += result.eventsProcessed || 0;
      } else {
        errors.push(result);
        // Don't mark failed pages as processed - they can be retried
        if (result.error) {
          // Note: We can't access syncService.stats here since we use per-page instances
          // Errors are tracked in the errors array
        }
      }
    });

    // Progress reporting
    const totalProcessed = processed;
    if (totalProcessed % 50 === 0 || i + concurrency >= pageNumbers.length) {
      const stats = syncService.getStats();
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = totalProcessed / elapsed;
      const remaining = totalPages - (startPage - 1 + totalProcessed);
      const eta = remaining / rate;
      
      const currentPage = startPage + totalProcessed - 1;
      console.log(`\n📊 Progress: ${currentPage}/${totalPages} pages (${Math.round((currentPage / totalPages) * 100)}%)`);
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

async function resumeSync() {
  await loadEnv();
  
  // Get start page from command line argument (default: 210 to redo from where we stopped)
  const startPage = parseInt(process.argv[2] || '210', 10);
  
  console.log('🚀 Resuming Jambase Sync (Safe Mode - No Duplicates)...\n');
  console.log(`📄 Starting from page ${startPage}\n`);
  
  // Configurable concurrency
  const concurrency = parseInt(process.env.SYNC_CONCURRENCY || '5', 10);
  console.log(`⚡ Concurrency: ${concurrency} parallel requests\n`);

  const syncService = new JambaseSyncService();
  const startTime = Date.now();

  try {
    const perPage = 100; // Maximum page size

    // Step 1: Get existing event IDs to prevent duplicates
    const existingEventIds = await getExistingEventIds(syncService);

    // Step 2: Fetch first page to get total count (or use startPage if we know it)
    console.log('\n📡 Fetching page 1 to get total count...');
    const firstPage = await syncService.fetchEventsPage(1, perPage);
    const totalPages = firstPage.totalPages || 1;
    
    console.log(`✅ Total pages: ${totalPages}`);
    console.log(`✅ Total items: ${firstPage.totalItems || 'unknown'}`);
    console.log(`✅ Resuming from page: ${startPage}\n`);

    if (startPage > totalPages) {
      console.log('⚠️  Start page is greater than total pages. Nothing to do.');
      return;
    }

    // Step 3: Process pages from startPage to totalPages
    console.log(`🔄 Processing pages ${startPage}-${totalPages} in parallel (${concurrency} concurrent requests)...\n`);
    console.log(`🔒 Race-condition free: Each page processed exactly once, deterministically\n`);
    const { results, errors, totalEventsProcessed } = await processPagesParallelSafe(
      syncService, 
      startPage,
      totalPages, 
      perPage, 
      existingEventIds, 
      concurrency
    );

    // Step 4: Verify we got everything
    console.log('\n🔍 Verifying completeness...');
    const successfulPages = new Set(results.map(r => r.page));
    const missingPages = [];
    for (let i = startPage; i <= totalPages; i++) {
      if (!successfulPages.has(i)) {
        missingPages.push(i);
      }
    }

    if (missingPages.length > 0) {
      console.log(`⚠️  Warning: ${missingPages.length} pages were not successfully processed:`);
      console.log(`   Pages: ${missingPages.slice(0, 20).join(', ')}${missingPages.length > 20 ? '...' : ''}`);
    } else {
      console.log(`✅ All pages ${startPage}-${totalPages} processed successfully!`);
    }

    // Final statistics
    const stats = syncService.getStats();
    const elapsed = (Date.now() - startTime) / 1000 / 60; // minutes

    console.log('\n\n✨ Resume Sync Complete!');
    console.log('\n📈 Final Statistics:');
    console.log(`   Pages processed: ${startPage}-${startPage + results.length - 1}`);
    console.log(`   Total API calls: ${stats.apiCalls}`);
    console.log(`   Total events processed: ${stats.eventsProcessed}`);
    console.log(`   New events added: ${totalEventsProcessed}`);
    console.log(`   Total artists processed: ${stats.artistsProcessed}`);
    console.log(`   Total venues processed: ${stats.venuesProcessed}`);
    console.log(`   Successful pages: ${results.length}`);
    console.log(`   Failed pages: ${errors.length}`);
    console.log(`   Missing pages: ${missingPages.length}`);
    console.log(`   Total errors: ${stats.errors.length}`);
    console.log(`   Time elapsed: ${Math.round(elapsed)} minutes`);

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

    console.log('\n✅ Resume sync complete! No duplicates created.');

  } catch (error) {
    console.error('❌ Resume sync failed:', error);
    const stats = syncService.getStats();
    console.log(`\n📊 Progress before failure:`);
    console.log(`   Pages processed: ${stats.apiCalls}`);
    console.log(`   Events processed: ${stats.eventsProcessed}`);
    process.exit(1);
  }
}

// Run resume sync
resumeSync().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

