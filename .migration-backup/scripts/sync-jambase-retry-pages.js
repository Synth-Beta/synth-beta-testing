/**
 * Retry Failed Pages - Jambase Sync
 * 
 * Retries specific pages that failed during sync.
 * Usage: node scripts/sync-jambase-retry-pages.js [page1] [page2] ... OR
 *        node scripts/sync-jambase-retry-pages.js 431-440
 * 
 * Features:
 * - Retries specific page numbers
 * - Deduplicates by jambase_event_id (no duplicates ever)
 * - Sequential processing (no deadlocks)
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
 * Parse page numbers from command line arguments
 * Supports: 431 432 433 OR 431-440 (range)
 */
function parsePageNumbers() {
  const args = process.argv.slice(2);
  const pages = new Set();
  
  for (const arg of args) {
    if (arg.includes('-')) {
      // Range format: 431-440
      const [start, end] = arg.split('-').map(n => parseInt(n, 10));
      if (start && end && start <= end) {
        for (let i = start; i <= end; i++) {
          pages.add(i);
        }
      }
    } else {
      // Single page number
      const page = parseInt(arg, 10);
      if (page > 0) {
        pages.add(page);
      }
    }
  }
  
  return Array.from(pages).sort((a, b) => a - b);
}

async function retryPages() {
  await loadEnv();
  
  const pageNumbers = parsePageNumbers();
  
  if (pageNumbers.length === 0) {
    console.error('❌ No page numbers provided!');
    console.log('Usage: node scripts/sync-jambase-retry-pages.js 431 432 433');
    console.log('   OR: node scripts/sync-jambase-retry-pages.js 431-440');
    process.exit(1);
  }
  
  console.log('🔄 Retrying Failed Pages - Jambase Sync...\n');
  console.log(`📄 Pages to retry: ${pageNumbers.join(', ')}\n`);

  const syncService = new JambaseSyncService();
  const startTime = Date.now();
  const perPage = 100;

  try {
    const results = [];
    const errors = [];

    for (const pageNum of pageNumbers) {
      try {
        console.log(`📡 Fetching page ${pageNum}...`);
        const pageData = await syncService.fetchEventsPage(pageNum, perPage);
        
        if (!pageData.events || pageData.events.length === 0) {
          console.log(`⚠️  Page ${pageNum} returned no events`);
          results.push({ page: pageNum, success: false, reason: 'no events' });
          continue;
        }

        console.log(`🔄 Processing page ${pageNum} (${pageData.events.length} events)...`);
        await syncService.processPage(pageData.events);
        
        results.push({ page: pageNum, success: true, eventsCount: pageData.events.length });
        console.log(`✅ Successfully processed page ${pageNum}`);

        // Small delay between pages
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`❌ Error processing page ${pageNum}:`, error.message);
        errors.push({ page: pageNum, error: error.message });
        syncService.stats.errors.push({ page: pageNum, error: error.message });
      }
    }

    // Final statistics
    const stats = syncService.getStats();
    const elapsed = (Date.now() - startTime) / 1000 / 60; // minutes

    console.log('\n\n✨ Retry Complete!');
    console.log('\n📈 Final Statistics:');
    console.log(`   Pages retried: ${pageNumbers.length}`);
    console.log(`   Successful: ${results.filter(r => r.success).length}`);
    console.log(`   Failed: ${errors.length}`);
    console.log(`   Total events processed: ${stats.eventsProcessed}`);
    console.log(`   Total artists processed: ${stats.artistsProcessed}`);
    console.log(`   Total venues processed: ${stats.venuesProcessed}`);
    console.log(`   Time elapsed: ${Math.round(elapsed)} minutes`);

    if (errors.length > 0) {
      console.log('\n⚠️  Failed pages:');
      errors.forEach((error, i) => {
        console.log(`   ${i + 1}. Page ${error.page}: ${error.error}`);
      });
    } else {
      console.log('\n✅ All pages retried successfully!');
    }

    // Verify no duplicates
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

  } catch (error) {
    console.error('❌ Retry failed:', error);
    process.exit(1);
  }
}

// Run retry
retryPages().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

