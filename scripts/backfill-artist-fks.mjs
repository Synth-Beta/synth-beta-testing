/**
 * Backfill artist_id on Jambase events where it is null.
 *
 * Jambase event titles follow "Artist Name at Venue Name" format.
 * We parse the artist name from the title and match it (case-insensitive)
 * to the artists table. Prefers Jambase-linked artists on ties.
 *
 * Uses OFFSET pagination like the venue backfill (proven to work).
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BATCH_SIZE = 200;

async function loadAllArtists() {
  const all = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('artists')
      .select('id, name')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    page++;
  }
  return all;
}

async function run() {
  console.log('🔧 Starting artist_id backfill for broken Jambase events...\n');

  const artists = await loadAllArtists();
  console.log(`  Loaded ${artists.length} artists`);

  // Get Jambase-linked artist IDs for tie-breaking
  const { data: jbArtists } = await supabase
    .from('external_entity_ids')
    .select('entity_uuid')
    .eq('source', 'jambase')
    .eq('entity_type', 'artist');
  const jambaseArtistIds = new Set((jbArtists || []).map(r => r.entity_uuid));

  // Build lowercase-name → artist_id map (Jambase-linked wins ties)
  const nameToArtistId = new Map();
  for (const a of artists) {
    if (!a.name) continue;
    const key = a.name.toLowerCase().trim();
    const existing = nameToArtistId.get(key);
    if (!existing) {
      nameToArtistId.set(key, a.id);
    } else if (jambaseArtistIds.has(a.id) && !jambaseArtistIds.has(existing)) {
      nameToArtistId.set(key, a.id);
    }
  }
  console.log(`  Built name map: ${nameToArtistId.size} unique artist names\n`);

  let fixed = 0;
  let pass = 0;

  // Always fetch the first BATCH_SIZE events with artist_id IS NULL.
  // Fixed events drop out of the IS NULL set automatically, so each pass
  // makes forward progress without an expensive OFFSET scan.
  // Stop when a full batch has no matchable events (can't make more progress).
  while (true) {
    const { data: events, error: eErr } = await supabase
      .from('events')
      .select('id, title')
      .eq('source', 'jambase')
      .is('artist_id', null)
      .not('title', 'is', null)
      .limit(BATCH_SIZE);

    if (eErr) throw eErr;
    if (!events || events.length === 0) break;

    const updates = [];
    for (const event of events) {
      // Title format: "Artist Name at Venue Name"
      const atIdx = event.title.indexOf(' at ');
      if (atIdx <= 0) continue;

      const artistName = event.title.slice(0, atIdx).trim().toLowerCase();
      const artistId = nameToArtistId.get(artistName);
      if (artistId) updates.push({ id: event.id, artist_id: artistId });
    }

    if (updates.length === 0) {
      console.log(`  Pass ${pass + 1}: no matches in batch of ${events.length} — stopping (remaining events have unrecognized titles)`);
      break;
    }

    const byArtist = new Map();
    for (const { id, artist_id } of updates) {
      if (!byArtist.has(artist_id)) byArtist.set(artist_id, []);
      byArtist.get(artist_id).push(id);
    }
    for (const [artist_id, eventIds] of byArtist) {
      const { error: upErr } = await supabase
        .from('events')
        .update({ artist_id })
        .in('id', eventIds);
      if (upErr) throw upErr;
    }

    fixed += updates.length;
    pass++;
    console.log(`  Pass ${pass}: fixed ${updates.length}/${events.length} (running total: ${fixed})`);
  }

  console.log(`\n✅ Done. artist_id fixed: ${fixed}`);
  console.log('   Remaining events will be fixed by the catalog re-sync running in background.');
}

run().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
