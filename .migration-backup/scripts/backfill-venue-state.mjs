/**
 * Backfill venue_state for events using a two-layer strategy:
 * 
 * Layer 1: Match venue_city to city_centers table (free, instant)
 * Layer 2: Use Mapbox reverse geocoding for remaining nulls with lat/lng (100k free/month)
 * 
 * Usage:
 *   node scripts/backfill-venue-state.mjs [--dry-run] [--layer=1|2|both] [--batch-size=100] [--delay=100]
 * 
 * Options:
 *   --dry-run: Show what would be done without making changes
 *   --layer: Which layer to run (1=city_centers, 2=mapbox, both=default)
 *   --batch-size: Number of events to process in each batch (default: 100)
 *   --delay: Delay between Mapbox API calls in ms (default: 100)
 * 
 * Environment Variables Required:
 *   SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key for bypassing RLS
 *   MAPBOX_TOKEN or VITE_MAPBOX_TOKEN - Mapbox access token (for Layer 2)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, existsSync, mkdirSync } from 'fs';

// Load environment variables
dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get configuration from environment
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || process.env.VITE_MAPBOX_TOKEN;

// Validate required environment variables
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗');
  process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const layerArg = args.find(arg => arg.startsWith('--layer='));
const layer = layerArg ? layerArg.split('=')[1] : 'both';
const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : 100;
const delayArg = args.find(arg => arg.startsWith('--delay='));
const delayMs = delayArg ? parseInt(delayArg.split('=')[1], 10) : 100;

console.log('\n🚀 Venue State Backfill Script');
console.log('='.repeat(60));
console.log(`Mode: ${isDryRun ? '🔍 DRY RUN' : '🔧 LIVE UPDATE'}`);
console.log(`Layer: ${layer}`);
console.log(`Batch size: ${batchSize}`);
console.log(`API delay: ${delayMs}ms`);
console.log('='.repeat(60) + '\n');

// Initialize Supabase client with service role key (bypasses RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Initialize log object
const log = {
  startTime: new Date().toISOString(),
  dryRun: isDryRun,
  layer,
  batchSize,
  delayMs,
  layer1: {
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    changes: [],
  },
  layer2: {
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    apiCalls: 0,
    changes: [],
  },
  errors: [],
};

/**
 * Sleep helper for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Layer 1: Backfill venue_state from city_centers table
 */
async function runLayer1() {
  console.log('\n📍 LAYER 1: city_centers lookup');
  console.log('-'.repeat(40));

  // First, get count of events with NULL venue_state
  const { count: nullCount, error: countError } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true })
    .is('venue_state', null);

  if (countError) {
    console.error('❌ Error counting null venue_state:', countError.message);
    log.errors.push({ layer: 1, type: 'count', error: countError.message });
    return;
  }

  console.log(`📊 Events with NULL venue_state: ${nullCount}`);

  // Get events that can be matched via city_centers
  // We need to do this in batches since we can't do a JOIN directly
  console.log('🔍 Finding matchable events via city_centers...\n');

  // First, get all city_centers with state
  const { data: cityCenters, error: cityCentersError } = await supabase
    .from('city_centers')
    .select('normalized_name, state')
    .not('state', 'is', null);

  if (cityCentersError) {
    console.error('❌ Error fetching city_centers:', cityCentersError.message);
    log.errors.push({ layer: 1, type: 'city_centers_fetch', error: cityCentersError.message });
    return;
  }

  console.log(`   Found ${cityCenters.length} city_centers with state data`);

  // Create a map for fast lookups (lowercase normalized_name -> state)
  const cityToStateMap = new Map();
  for (const cc of cityCenters) {
    if (cc.normalized_name && cc.state) {
      cityToStateMap.set(cc.normalized_name.toLowerCase().trim(), cc.state);
    }
  }

  // Fetch events with NULL venue_state but valid venue_city
  let offset = 0;
  let hasMore = true;
  let totalMatched = 0;
  let totalProcessed = 0;

  while (hasMore) {
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id, venue_city, venue_state')
      .is('venue_state', null)
      .not('venue_city', 'is', null)
      .order('id')
      .range(offset, offset + batchSize - 1);

    if (eventsError) {
      console.error('❌ Error fetching events:', eventsError.message);
      log.errors.push({ layer: 1, type: 'events_fetch', error: eventsError.message });
      break;
    }

    if (!events || events.length === 0) {
      hasMore = false;
      break;
    }

    totalProcessed += events.length;
    const updates = [];

    for (const event of events) {
      const normalizedCity = event.venue_city?.toLowerCase().trim();
      const state = cityToStateMap.get(normalizedCity);

      if (state) {
        updates.push({
          id: event.id,
          venue_city: event.venue_city,
          venue_state: state,
        });
        totalMatched++;
      }
    }

    // Apply updates if not dry run
    if (updates.length > 0) {
      log.layer1.changes.push(...updates.map(u => ({
        id: u.id,
        venue_city: u.venue_city,
        new_state: u.venue_state,
      })));

      if (!isDryRun) {
        for (const update of updates) {
          const { error: updateError } = await supabase
            .from('events')
            .update({ venue_state: update.venue_state, updated_at: new Date().toISOString() })
            .eq('id', update.id);

          if (updateError) {
            console.error(`   ❌ Failed to update ${update.id}:`, updateError.message);
            log.layer1.errors++;
            log.errors.push({ layer: 1, type: 'update', id: update.id, error: updateError.message });
          } else {
            log.layer1.updated++;
          }
        }
      } else {
        log.layer1.updated += updates.length;
      }
    }

    process.stdout.write(`   Processed ${totalProcessed} events, matched ${totalMatched}...\r`);

    if (events.length < batchSize) {
      hasMore = false;
    } else {
      offset += batchSize;
    }
  }

  log.layer1.processed = totalProcessed;
  console.log(`\n\n✅ Layer 1 complete: ${totalMatched} matches found from ${totalProcessed} events`);
}

/**
 * Layer 2: Backfill venue_state using Mapbox reverse geocoding
 */
async function runLayer2() {
  console.log('\n📍 LAYER 2: Mapbox reverse geocoding');
  console.log('-'.repeat(40));

  if (!MAPBOX_TOKEN) {
    console.error('❌ MAPBOX_TOKEN not found. Layer 2 requires Mapbox API access.');
    console.error('   Set MAPBOX_TOKEN or VITE_MAPBOX_TOKEN in .env.local');
    log.errors.push({ layer: 2, type: 'config', error: 'MAPBOX_TOKEN not configured' });
    return;
  }

  // Get events with NULL venue_state but valid lat/lng
  let offset = 0;
  let hasMore = true;
  let totalProcessed = 0;
  let totalUpdated = 0;

  console.log('🔍 Finding events with NULL venue_state but valid coordinates...\n');

  while (hasMore) {
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id, venue_city, latitude, longitude')
      .is('venue_state', null)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('id')
      .range(offset, offset + batchSize - 1);

    if (eventsError) {
      console.error('❌ Error fetching events:', eventsError.message);
      log.errors.push({ layer: 2, type: 'events_fetch', error: eventsError.message });
      break;
    }

    if (!events || events.length === 0) {
      hasMore = false;
      break;
    }

    totalProcessed += events.length;

    for (const event of events) {
      try {
        // Call Mapbox reverse geocoding API
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${event.longitude},${event.latitude}.json?access_token=${MAPBOX_TOKEN}&types=region&limit=1`;

        log.layer2.apiCalls++;

        if (!isDryRun) {
          const response = await fetch(url);
          
          if (!response.ok) {
            throw new Error(`Mapbox API returned ${response.status}: ${response.statusText}`);
          }

          const data = await response.json();

          if (data.features && data.features.length > 0) {
            const feature = data.features[0];
            // Get state name from the feature
            // features[0].text is the state name (e.g., "California")
            // features[0].properties.short_code is like "US-CA"
            const stateName = feature.text;
            const shortCode = feature.properties?.short_code;
            
            // Prefer short code (e.g., "CA") if available, otherwise use full name
            let stateValue = stateName;
            if (shortCode && shortCode.startsWith('US-')) {
              stateValue = shortCode.replace('US-', '');
            }

            if (stateValue) {
              log.layer2.changes.push({
                id: event.id,
                venue_city: event.venue_city,
                latitude: event.latitude,
                longitude: event.longitude,
                new_state: stateValue,
                source: 'mapbox',
              });

              const { error: updateError } = await supabase
                .from('events')
                .update({ venue_state: stateValue, updated_at: new Date().toISOString() })
                .eq('id', event.id);

              if (updateError) {
                console.error(`   ❌ Failed to update ${event.id}:`, updateError.message);
                log.layer2.errors++;
                log.errors.push({ layer: 2, type: 'update', id: event.id, error: updateError.message });
              } else {
                log.layer2.updated++;
                totalUpdated++;
              }
            } else {
              log.layer2.skipped++;
            }
          } else {
            log.layer2.skipped++;
          }

          // Rate limiting delay
          await sleep(delayMs);
        } else {
          // Dry run - just log what would happen
          log.layer2.changes.push({
            id: event.id,
            venue_city: event.venue_city,
            latitude: event.latitude,
            longitude: event.longitude,
            new_state: '[would query Mapbox]',
            source: 'mapbox_dry_run',
          });
          log.layer2.updated++;
          totalUpdated++;
        }
      } catch (error) {
        console.error(`   ❌ Error processing event ${event.id}:`, error.message);
        log.layer2.errors++;
        log.errors.push({ layer: 2, type: 'api', id: event.id, error: error.message });
      }
    }

    process.stdout.write(`   Processed ${totalProcessed} events, updated ${totalUpdated}...\r`);

    if (events.length < batchSize) {
      hasMore = false;
    } else {
      offset += batchSize;
    }
  }

  log.layer2.processed = totalProcessed;
  console.log(`\n\n✅ Layer 2 complete: ${totalUpdated} updates from ${totalProcessed} events`);
  console.log(`   API calls made: ${log.layer2.apiCalls}`);
}

/**
 * Get statistics on venue_state coverage
 */
async function getStats() {
  console.log('\n📊 Current venue_state coverage:');
  console.log('-'.repeat(40));

  // Total events
  const { count: totalCount } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true });

  // Events with NULL venue_state
  const { count: nullCount } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true })
    .is('venue_state', null);

  // Events with NULL venue_state but valid venue_city
  const { count: nullWithCityCount } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true })
    .is('venue_state', null)
    .not('venue_city', 'is', null);

  // Events with NULL venue_state but valid lat/lng
  const { count: nullWithCoordsCount } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true })
    .is('venue_state', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  console.log(`   Total events: ${totalCount}`);
  console.log(`   With venue_state: ${totalCount - nullCount} (${((totalCount - nullCount) / totalCount * 100).toFixed(1)}%)`);
  console.log(`   NULL venue_state: ${nullCount} (${(nullCount / totalCount * 100).toFixed(1)}%)`);
  console.log(`   NULL but has city: ${nullWithCityCount} (Layer 1 candidates)`);
  console.log(`   NULL but has coords: ${nullWithCoordsCount} (Layer 2 candidates)`);

  return {
    total: totalCount,
    withState: totalCount - nullCount,
    nullState: nullCount,
    nullWithCity: nullWithCityCount,
    nullWithCoords: nullWithCoordsCount,
  };
}

/**
 * Main function
 */
async function main() {
  try {
    // Get initial stats
    const beforeStats = await getStats();
    log.beforeStats = beforeStats;

    // Run layers based on argument
    if (layer === '1' || layer === 'both') {
      await runLayer1();
    }

    if (layer === '2' || layer === 'both') {
      await runLayer2();
    }

    // Get final stats
    if (!isDryRun) {
      const afterStats = await getStats();
      log.afterStats = afterStats;

      console.log('\n📈 Improvement:');
      console.log('-'.repeat(40));
      console.log(`   venue_state coverage: ${beforeStats.withState} → ${afterStats.withState}`);
      console.log(`   NULL reduced by: ${beforeStats.nullState - afterStats.nullState}`);
    }

    // Summary
    log.endTime = new Date().toISOString();
    log.duration = new Date(log.endTime) - new Date(log.startTime);

    console.log('\n' + '='.repeat(60));
    console.log('📊 BACKFILL SUMMARY');
    console.log('='.repeat(60));
    console.log(`Layer 1 - city_centers lookup:`);
    console.log(`   Processed: ${log.layer1.processed}`);
    console.log(`   Updated: ${log.layer1.updated}`);
    console.log(`   Errors: ${log.layer1.errors}`);
    console.log(`Layer 2 - Mapbox geocoding:`);
    console.log(`   Processed: ${log.layer2.processed}`);
    console.log(`   Updated: ${log.layer2.updated}`);
    console.log(`   API calls: ${log.layer2.apiCalls}`);
    console.log(`   Errors: ${log.layer2.errors}`);
    console.log(`Duration: ${Math.round(log.duration / 1000)}s`);
    console.log('='.repeat(60));

    // Save log file
    const logsDir = join(__dirname, '..', 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = join(logsDir, `backfill-venue-state-${timestamp}.json`);
    writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`\n📄 Log saved to: ${logPath}`);

    if (isDryRun) {
      console.log('\n🔍 This was a dry run. Run without --dry-run to apply changes.');
      
      // Show sample of what would be changed
      const sampleChanges = [...log.layer1.changes.slice(0, 5), ...log.layer2.changes.slice(0, 5)];
      if (sampleChanges.length > 0) {
        console.log('\n📝 Sample changes (first 5 per layer):');
        sampleChanges.forEach(change => {
          console.log(`   ${change.id}: ${change.venue_city} → ${change.new_state}`);
        });
      }
    } else {
      console.log('\n✅ Backfill completed successfully!');
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    log.endTime = new Date().toISOString();
    log.fatalError = error.message;

    const logsDir = join(__dirname, '..', 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = join(logsDir, `backfill-venue-state-${timestamp}-error.json`);
    writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`\n📄 Error log saved to: ${logPath}`);
    process.exit(1);
  }
}

// Run the script
main();
