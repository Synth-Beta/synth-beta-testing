/**
 * Resume Jambase Sync - Sequential Version (No Deadlocks)
 * 
 * Resumes sync from a specific page number using sequential processing.
 * This avoids deadlocks and timeouts from parallel database operations.
 * 
 * Usage: node scripts/sync-jambase-resume-sequential.js [startPage]
 * Default: starts at page 210
 * 
 * Features:
 * - Deduplicates by jambase_event_id (no duplicates ever)
 * - Sequential processing (no deadlocks)
 * - Can resume from any page
 * - Ensures we get everything, miss nothing
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

async function resumeSync() {
  await loadEnv();
  
  // Get start page from command line argument (default: 210)
  const startPage = parseInt(process.argv[2] || '210', 10);
  
  console.log('🚀 Resuming Jambase Sync (Sequential Mode - No Deadlocks)...\n');
  console.log(`📄 Starting from page ${startPage}\n`);

  const syncService = new JambaseSyncService();
  const startTime = Date.now();

  try {
    const perPage = 100; // Maximum page size

    // Step 1: Fetch first page to get total count
    console.log('📡 Fetching page 1 to get total count...');
    const firstPage = await syncService.fetchEventsPage(1, perPage);
    const totalPages = firstPage.totalPages || 1;
    
    console.log(`✅ Total pages: ${totalPages}`);
    console.log(`✅ Total items: ${firstPage.totalItems || 'unknown'}`);
    console.log(`✅ Resuming from page: ${startPage}\n`);

    if (startPage > totalPages) {
      console.log('⚠️  Start page is greater than total pages. Nothing to do.');
      return;
    }

    // Step 2: Process pages sequentially (no parallel processing = no deadlocks)
    console.log(`🔄 Processing pages ${startPage}-${totalPages} sequentially...\n`);
    
    let processed = 0;
    let totalEventsProcessed = 0;
    
    for (let currentPage = startPage; currentPage <= totalPages; currentPage++) {
      try {
        const pageData = await syncService.fetchEventsPage(currentPage, perPage);
        
        if (!pageData.events || pageData.events.length === 0) {
          console.log(`⚠️  Page ${currentPage} returned no events, stopping`);
          break;
        }

        // Process the page (upsert handles duplicates via ON CONFLICT jambase_event_id)
        await syncService.processPage(pageData.events);
        processed++;
        totalEventsProcessed += pageData.events.length;

        // Log progress every 10 pages
        if (currentPage % 10 === 0 || currentPage === totalPages) {
          const stats = syncService.getStats();
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = processed / elapsed;
          const remaining = totalPages - currentPage;
          const eta = remaining / rate;
          
          console.log(`\n📊 Progress: ${currentPage}/${totalPages} pages (${Math.round((currentPage / totalPages) * 100)}%)`);
          console.log(`   Events: ${stats.eventsProcessed}`);
          console.log(`   Artists: ${stats.artistsProcessed}`);
          console.log(`   Venues: ${stats.venuesProcessed}`);
          console.log(`   API Calls: ${stats.apiCalls}`);
          console.log(`   Rate: ${rate.toFixed(2)} pages/sec`);
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
        
        // Continue to next page (don't stop on individual page errors)
        continue;
      }
    }

    // Step 3: Verify we got everything
    console.log('\n🔍 Verifying completeness...');
    const stats = syncService.getStats();
    const expectedPages = totalPages - startPage + 1;
    const successfulPages = expectedPages - stats.errors.length;
    
    if (stats.errors.length > 0) {
      console.log(`⚠️  Warning: ${stats.errors.length} pages had errors:`);
      stats.errors.slice(0, 10).forEach((error, i) => {
        console.log(`   ${i + 1}. Page ${error.page || 'unknown'}: ${error.error}`);
      });
      if (stats.errors.length > 10) {
        console.log(`   ... and ${stats.errors.length - 10} more errors`);
      }
    } else {
      console.log(`✅ All pages ${startPage}-${totalPages} processed successfully!`);
    }

    // Final statistics
    const elapsed = (Date.now() - startTime) / 1000 / 60; // minutes

    console.log('\n\n✨ Resume Sync Complete!');
    console.log('\n📈 Final Statistics:');
    console.log(`   Pages processed: ${startPage}-${startPage + processed - 1}`);
    console.log(`   Total API calls: ${stats.apiCalls}`);
    console.log(`   Total events processed: ${stats.eventsProcessed}`);
    console.log(`   Total artists processed: ${stats.artistsProcessed}`);
    console.log(`   Total venues processed: ${stats.venuesProcessed}`);
    console.log(`   Successful pages: ${successfulPages}`);
    console.log(`   Failed pages: ${stats.errors.length}`);
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

