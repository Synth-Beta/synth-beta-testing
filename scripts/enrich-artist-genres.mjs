/**
 * Backlog processor: finds artists stuck on `genres = null`, `'{}'`, or the
 * `['small artist']` placeholder (the fallback the sync writes when genre
 * lookup fails or is skipped) and looks up real genres for them via
 * fetch-artist-genres.mjs (MusicBrainz — see that file for why Spotify, the
 * original plan, turned out to be a dead end; iTunes fallback also exists
 * there and is ON by default -- set GENRE_ENRICH_USE_ITUNES=0 to go
 * MusicBrainz-only. This comment previously claimed the opposite; the code has
 * always read `!== '0'` (fetch-artist-genres.mjs:49), i.e. enabled unless
 * explicitly disabled.
 *
 * Processes the backlog ordered by EVENT COUNT, most first (via the
 * get_stuck_artists_by_event_count DB function — apply
 * supabase/migrations/20260813000000_genre_enrich_priority_and_attempted.sql
 * first if this errors with "Could not find the function..."). Genre
 * coverage is only ever user-facing through events.genres, and event count
 * per artist is highly skewed (residencies/recurring bookings), so fixing a
 * handful of high-traffic artists moves the events-with-genres percentage
 * far more than fixing the same number of one-off local openers.
 *
 * Every attempted artist gets `genre_lookup_attempted_at` set, found or not —
 * so a "no data anywhere" artist is never redundantly re-queried on a later
 * run, regardless of processing order. GENRE_ENRICH_RESET=1 clears this (for
 * currently-stuck artists only) to force a full re-sweep, e.g. after adding
 * a new source.
 *
 * Resumable via a checkpoint file (last event_count + id processed, matching
 * the DB function's ordering). Live testing showed MusicBrainz's 503 throttle
 * trips much sooner than their documented "1 req/sec" policy suggests, far
 * too often to re-run this command by hand every time. So this script runs
 * its own outer retry loop: on a trip, it sleeps a cooldown period, resets
 * both sources' circuit breakers, and keeps going — no manual re-invocation
 * needed — up to a max total runtime per invocation (default 4h), after
 * which it stops and reports progress so an unattended process doesn't run
 * forever unsupervised. Re-run the same command to pick up another session.
 *
 * IMPORTANT: only run one instance of this script at a time — two instances
 * would race on the same checkpoint file and double up on API requests
 * against the same rate limits.
 *
 * Usage:
 *   node scripts/enrich-artist-genres.mjs
 *   GENRE_ENRICH_LIMIT=500 node scripts/enrich-artist-genres.mjs             # batch size per DB fetch
 *   GENRE_ENRICH_COOLDOWN_MS=120000 node scripts/enrich-artist-genres.mjs    # wait 2min after each trip instead of 1min
 *   GENRE_ENRICH_MAX_RUNTIME_MIN=480 node scripts/enrich-artist-genres.mjs   # run up to 8h instead of 4h
 *   GENRE_ENRICH_RESET=1 node scripts/enrich-artist-genres.mjs               # re-sweep from the start
 *
 * After a run finds new genres, re-run supabase/migrations/
 * 20260812120000_backfill_event_genres_from_artist.sql to push them onto events
 * (this script only ever writes artists.genres, never touches events directly).
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import {
  fetchGenresForArtist,
  isGenreLookupCircuitTripped,
  getGenreLookupCircuitTripReason,
  resetGenreLookupCircuit,
} from './fetch-artist-genres.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CHECKPOINT_FILE = path.join(__dirname, 'genre-enrich-checkpoint.json');
const DEFAULT_LIMIT = 1500;
const DEFAULT_COOLDOWN_MS = 60_000;
const DEFAULT_MAX_RUNTIME_MIN = 240;
const STUCK_FILTER = 'genres.is.null,genres.eq.{},genres.eq.{small artist}';

async function loadEnv() {
  try {
    const dotenv = await import('dotenv');
    dotenv.default.config({ path: '.env.local' });
  } catch {
    // dotenv not installed, assume env vars are already set
  }
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) environment variable.');
  }
  if (!serviceKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY environment variable. This script writes artists.genres and needs service-role access.'
    );
  }
  if (serviceKey === anonKey) {
    throw new Error('SECURITY ERROR: SUPABASE_SERVICE_ROLE_KEY cannot be the same as the anon key.');
  }
  return createClient(url, serviceKey);
}

function loadCheckpoint() {
  if (process.env.GENRE_ENRICH_RESET === '1') return { lastEventCount: null, lastId: null };
  try {
    const raw = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    // Back-compat with the old id-only checkpoint format (pre event-count
    // ordering) — start fresh under the new ordering rather than misread it.
    if (raw.lastEventCount === undefined) return { lastEventCount: null, lastId: null };
    return raw;
  } catch {
    return { lastEventCount: null, lastId: null };
  }
}

function saveCheckpoint(checkpoint) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Clear `genre_lookup_attempted_at` across the stuck backlog, in id-ordered
 * pages.
 *
 * This was a single unbounded UPDATE over the whole `artists` table, which
 * died on `canceling statement due to statement timeout` (live, 2026-09-01)
 * — thousands of rows plus their index writes exceed the hosted statement
 * timeout. Worse, it failed *silently in effect*: the reset aborted, the run
 * exited, and the next plain run then reported "backlog is clear" after
 * touching only the handful of newly-synced artists, because every artist in
 * the real backlog still had the flag set and was filtered out.
 *
 * Paged reads + `in(ids)` writes keep each statement small and bounded. Same
 * batched, re-runnable shape as the heavy SQL migrations in supabase/.
 */
const RESWEEP_PAGE_SIZE = 500;

async function clearAttemptedForResweep(supabase) {
  let cursor = null;
  let cleared = 0;

  for (;;) {
    let query = supabase
      .from('artists')
      .select('id')
      .or(STUCK_FILTER)
      .not('genre_lookup_attempted_at', 'is', null)
      .order('id', { ascending: true })
      .limit(RESWEEP_PAGE_SIZE);
    if (cursor) query = query.gt('id', cursor);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;

    const ids = data.map(r => r.id);
    const { error: updateError } = await supabase
      .from('artists')
      .update({ genre_lookup_attempted_at: null })
      .in('id', ids);
    if (updateError) throw updateError;

    cleared += ids.length;
    cursor = ids[ids.length - 1];
    process.stdout.write(`\r   cleared ${cleared}...`);
  }

  console.log(`\r   cleared ${cleared} artist(s) for re-sweep.        `);
  return cleared;
}

async function fetchNextBatch(supabase, checkpoint, limit) {
  const { data, error } = await supabase.rpc('get_stuck_artists_by_event_count', {
    p_after_event_count: checkpoint.lastEventCount,
    p_after_id: checkpoint.lastId,
    p_limit: limit,
  });
  if (error) {
    if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message || '')) {
      throw new Error(
        'get_stuck_artists_by_event_count() does not exist yet. Apply supabase/migrations/' +
          '20260813000000_genre_enrich_priority_and_attempted.sql first, then re-run this script.'
      );
    }
    throw error;
  }
  return data || [];
}

async function processArtist(supabase, artist, totals) {
  totals.processed++;
  const { genres, source } = await fetchGenresForArtist({
    id: artist.identifier || artist.id,
    name: artist.name,
    external_identifiers: artist.external_identifiers,
  });

  const update = { genre_lookup_attempted_at: new Date().toISOString() };
  if (genres.length > 0) {
    update.genres = genres;
    update.updated_at = new Date().toISOString();
  }

  const { error: updateError } = await supabase.from('artists').update(update).eq('id', artist.id);
  if (updateError) {
    console.warn(`  ⚠️  Failed to save result for "${artist.name}": ${updateError.message}`);
    return;
  }

  if (genres.length > 0) {
    totals.found++;
    totals.bySource[source] = (totals.bySource[source] || 0) + 1;
    console.log(`  ✓ ${artist.name} (${artist.event_count} events): ${genres.slice(0, 3).join(', ')} (${source})`);
  } else {
    totals.notFound++;
  }
}

async function main() {
  await loadEnv();
  const supabase = getSupabase();
  const limit = Number(process.env.GENRE_ENRICH_LIMIT) || DEFAULT_LIMIT;
  const cooldownMs = Number(process.env.GENRE_ENRICH_COOLDOWN_MS) || DEFAULT_COOLDOWN_MS;
  const maxRuntimeMs = (Number(process.env.GENRE_ENRICH_MAX_RUNTIME_MIN) || DEFAULT_MAX_RUNTIME_MIN) * 60_000;

  if (process.env.GENRE_ENRICH_RESET === '1') {
    console.log('🔄 GENRE_ENRICH_RESET=1 — clearing genre_lookup_attempted_at for the current backlog...');
    await clearAttemptedForResweep(supabase);
  }

  const checkpoint = loadCheckpoint();
  const startedAt = Date.now();

  console.log(
    `🎧 Artist genre enrichment starting (limit=${limit}/fetch, cooldown=${cooldownMs / 1000}s, ` +
      `max runtime=${Math.round(maxRuntimeMs / 60_000)}min, order=event count desc, ` +
      `resuming after event_count=${checkpoint.lastEventCount ?? '(start)'} id=${checkpoint.lastId || '(start)'})\n`
  );

  const totals = { processed: 0, found: 0, notFound: 0, bySource: {}, trips: 0 };
  let clearedBacklog = false;
  let stoppedForRuntime = false;

  outer: while (true) {
    if (Date.now() - startedAt > maxRuntimeMs) {
      stoppedForRuntime = true;
      break;
    }

    const batch = await fetchNextBatch(supabase, checkpoint, limit);
    if (batch.length === 0) {
      clearedBacklog = true;
      break;
    }

    for (const artist of batch) {
      if (Date.now() - startedAt > maxRuntimeMs) {
        stoppedForRuntime = true;
        break outer;
      }

      await processArtist(supabase, artist, totals);
      checkpoint.lastEventCount = artist.event_count;
      checkpoint.lastId = artist.id;
      saveCheckpoint(checkpoint);

      if (isGenreLookupCircuitTripped()) {
        totals.trips++;
        console.error(
          `\n🛑 Both sources tripped: ${getGenreLookupCircuitTripReason()} — cooling down ${cooldownMs / 1000}s before resuming (trip #${totals.trips})...\n`
        );
        await sleep(cooldownMs);
        resetGenreLookupCircuit();
        break; // re-fetch a fresh batch from the (now-advanced) checkpoint
      }
    }
  }

  const elapsedMin = Math.round((Date.now() - startedAt) / 60_000);
  console.log(
    `\n📊 This session (${elapsedMin}min, ${totals.trips} throttle trip(s)): ` +
      `${totals.processed} processed, ${totals.found} found, ${totals.notFound} not found.`
  );
  console.log(`   Sources: ${JSON.stringify(totals.bySource)}`);

  if (clearedBacklog) {
    // Reaching the end of the scan means the checkpoint is parked at the TAIL
    // of the event_count-desc ordering (lastEventCount: 0). Left in place, the
    // next run resumes *after* that point, fetches zero rows, and exits
    // instantly reporting "backlog is clear" — even when artists were skipped
    // mid-run by throttle trips or batch boundaries, and even when the sync has
    // since added brand-new unattempted artists. Observed live 2026-08-25: 713
    // artists with upcoming events stayed unattempted across repeated restarts.
    //
    // Dropping the checkpoint here makes the next run rescan from the top. It
    // does NOT re-query dead ends: genre_lookup_attempted_at stays set, and
    // get_stuck_artists_by_event_count filters on `attempted IS NULL`.
    try {
      fs.unlinkSync(CHECKPOINT_FILE);
    } catch {
      // never written, or already gone — nothing to reset
    }
    console.log('\n✅ Backlog is clear — no stuck, unattempted artists left.');
    console.log('   Checkpoint reset, so the next run rescans from the top for newly-synced artists.');
    console.log('   Run with GENRE_ENRICH_RESET=1 to re-sweep already-attempted artists (e.g. after adding a new source).');
  } else if (stoppedForRuntime) {
    console.log(
      `\n⏱️  Max runtime reached — checkpoint saved at event_count=${checkpoint.lastEventCount}, id=${checkpoint.lastId}. Re-run to continue.`
    );
  }

  if (totals.found > 0) {
    console.log(
      `\n➡️  Next: re-run supabase/migrations/20260812120000_backfill_event_genres_from_artist.sql to push these onto events.`
    );
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
