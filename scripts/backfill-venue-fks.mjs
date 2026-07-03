/**
 * Backfill venue_id on Jambase events where it is null.
 * Uses coordinate proximity (< 0.001° ≈ 100m) to match events to venues.
 * Runs in small batches to avoid timeouts.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BATCH_SIZE = 200;
const COORD_TOLERANCE = 0.001; // ~100m

async function run() {
  console.log('🔧 Starting venue_id backfill for broken Jambase events...\n');

  // 1. Load all venues that have coordinates (once). Supabase caps a single request at
  // 1000 rows, and this table has 500k+ venues. OFFSET-based .range() paging gets slower
  // the deeper it goes (Postgres has to scan past every prior row each time) and eventually
  // hits a statement timeout — use keyset pagination (cursor on id) instead, which stays
  // fast regardless of how far in we are.
  const venues = [];
  const PAGE_SIZE = 1000;
  let lastId = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const { data: page, error: vErr } = await supabase
      .from('venues')
      .select('id, latitude, longitude')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .gt('id', lastId)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);

    if (vErr) throw vErr;
    if (!page || page.length === 0) break;
    venues.push(...page);
    lastId = page[page.length - 1].id;
    if (page.length < PAGE_SIZE) break;
  }
  console.log(`  Loaded ${venues.length} venues with coordinates`);

  // Pre-build Set of Jambase-linked venue IDs for tie-breaking
  const { data: jbVenues } = await supabase
    .from('external_entity_ids')
    .select('entity_uuid')
    .eq('source', 'jambase')
    .eq('entity_type', 'venue');
  const jambaseVenueIds = new Set((jbVenues || []).map(r => r.entity_uuid));

  // 2. Page through broken events in batches
  let fixed = 0;
  let pass = 0;

  // Always fetch the first BATCH_SIZE events with venue_id IS NULL.
  // Fixed events drop out of the IS NULL set automatically — no OFFSET needed,
  // so every SELECT hits offset=0 and avoids the expensive offset-scan timeout.
  // Stop when a batch produces zero coord matches (remaining events have no nearby venue).
  while (true) {
    const { data: events, error: eErr } = await supabase
      .from('events')
      .select('id, latitude, longitude')
      .eq('source', 'jambase')
      .is('venue_id', null)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .limit(BATCH_SIZE);

    if (eErr) throw eErr;
    if (!events || events.length === 0) break;

    const updates = [];
    for (const event of events) {
      const lat = parseFloat(event.latitude);
      const lon = parseFloat(event.longitude);

      let best = null;
      let bestDist = Infinity;
      let bestIsJambase = false;

      for (const v of venues) {
        const vLat = parseFloat(v.latitude);
        const vLon = parseFloat(v.longitude);
        if (Math.abs(vLat - lat) > COORD_TOLERANCE) continue;
        if (Math.abs(vLon - lon) > COORD_TOLERANCE) continue;

        const dist = (vLat - lat) ** 2 + (vLon - lon) ** 2;
        const isJambase = jambaseVenueIds.has(v.id);

        if (!best || (isJambase && !bestIsJambase) || (isJambase === bestIsJambase && dist < bestDist)) {
          best = v;
          bestDist = dist;
          bestIsJambase = isJambase;
        }
      }

      if (best) updates.push({ id: event.id, venue_id: best.id });
    }

    if (updates.length === 0) {
      console.log(`  Pass ${pass + 1}: no coord matches in batch of ${events.length} — stopping`);
      break;
    }

    const byVenue = new Map();
    for (const { id, venue_id } of updates) {
      if (!byVenue.has(venue_id)) byVenue.set(venue_id, []);
      byVenue.get(venue_id).push(id);
    }
    for (const [venue_id, eventIds] of byVenue) {
      const { error: upErr } = await supabase
        .from('events')
        .update({ venue_id })
        .in('id', eventIds);
      if (upErr) throw upErr;
    }

    fixed += updates.length;
    pass++;
    console.log(`  Pass ${pass}: fixed ${updates.length}/${events.length} (running total: ${fixed})`);
  }

  console.log(`\n✅ Done. venue_id fixed: ${fixed}`);
  console.log('   artist_id will be fixed by the catalog re-sync running in background.');
}

run().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
