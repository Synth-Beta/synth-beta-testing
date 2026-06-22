/**
 * Incremental Jambase Sync - Daily Updates
 * 
 * Fetches only events that have been modified since last sync.
 * Uses MAX(last_modified_at) from events table to determine sync point.
 * Typically only 1-5 pages per day.
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

async function incrementalSync() {
  await loadEnv();
  console.log('🔄 Starting Incremental Jambase Sync...\n');

  const syncService = new JambaseSyncService();

  try {
    // Get the most recent last_modified_at from events table
    console.log('📅 Finding last sync timestamp...');
    const { data: lastSyncData, error: lastSyncError } = await syncService.supabase
      .from('events')
      .select('last_modified_at')
      .eq('source', 'jambase')
      .not('last_modified_at', 'is', null)
      .order('last_modified_at', { ascending: false })
      .limit(1)
      .single();

    if (lastSyncError && lastSyncError.code !== 'PGRST116') {
      throw lastSyncError;
    }

    const lastModifiedAt = lastSyncData?.last_modified_at;
    
    if (!lastModifiedAt) {
      console.log('⚠️  No previous sync found. Running full sync instead...');
      console.log('   (This is normal for the first sync)');
      // Could call full sync here, but for now just exit
      process.exit(0);
    }

    console.log(`✅ Last sync: ${lastModifiedAt}\n`);

    // Format for Jambase API (RFC3339)
    const dateModifiedFrom = new Date(lastModifiedAt).toISOString();

    // Fetch events modified since last sync
    console.log(`📡 Fetching events modified since ${dateModifiedFrom}...`);
    let currentPage = 1;
    let totalPages = 1;
    const perPage = 100;
    let hasMorePages = true;

    while (hasMorePages) {
      const pageData = await syncService.fetchEventsPage(currentPage, perPage, dateModifiedFrom);
      
      if (!pageData.events || pageData.events.length === 0) {
        console.log('✅ No new or modified events found');
        hasMorePages = false;
        break;
      }

      await syncService.processPage(pageData.events);
      console.log(`✅ Processed page ${currentPage} (${pageData.events.length} events)`);

      totalPages = pageData.totalPages || 1;
      
      if (currentPage >= totalPages) {
        hasMorePages = false;
      } else {
        currentPage++;
      }

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Final statistics
    const stats = syncService.getStats();
    console.log('\n✨ Incremental Sync Complete!');
    console.log('\n📈 Statistics:');
    console.log(`   API calls: ${stats.apiCalls}`);
    console.log(`   Events processed: ${stats.eventsProcessed}`);
    console.log(`   Artists processed: ${stats.artistsProcessed}`);
    console.log(`   Venues processed: ${stats.venuesProcessed}`);
    console.log(`   Errors: ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      stats.errors.forEach((error, i) => {
        console.log(`   ${i + 1}. ${error.type}: ${error.error}`);
      });
    }

  } catch (error) {
    console.error('❌ Incremental sync failed:', error);
    process.exit(1);
  }
}

// Run incremental sync
incrementalSync().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

