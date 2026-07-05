/**
 * Spotify Artist Linker
 *
 * Backfills artists.external_identifiers with a Spotify artist ID for artists
 * that don't have one yet. Every existing Spotify link in the DB came from
 * Jambase's own feed (jambase-sync-service.js passes through whatever Jambase
 * already had) -- there was previously no independent matching system. This
 * script builds one, using Spotify's Client Credentials flow (app-level auth,
 * no user login needed) against the existing SPOTIFY_CLIENT_ID/SECRET.
 *
 * Matching is deliberately conservative: this only auto-links a "tier A" match
 * (exactly one Spotify search result whose name is an exact case/punctuation-
 * normalized match to ours). Everything else — multiple same-name results,
 * fuzzy-only matches, zero results — is logged for manual review, never
 * guessed. This matters because the DB contains real tribute/cover acts
 * (e.g. "Man in the Mirror (Tribute to Michael Jackson)", "MJ LIVE - Michael
 * Jackson Tribute", "Foo Fighters GB") that must NOT get the real artist's
 * Spotify ID attached — that would corrupt the genre/recommendation signal
 * these IDs feed into (see 20260703000003_spotify_artists_to_signals.sql).
 * Names matching an obvious tribute/cover-band pattern are skipped before
 * ever calling Spotify, and flagged separately in the report.
 *
 * Usage:
 *   node backend/spotify-artist-linker.js                  # dry run, first 200 candidates, no writes
 *   node backend/spotify-artist-linker.js --limit=1000      # dry run, first 1000 candidates
 *   node backend/spotify-artist-linker.js --limit=1000 --write   # actually writes tier-A matches
 *
 * Candidates are pulled ordered by num_upcoming_events DESC, so the artists
 * that actually matter for the feed get linked first.
 *
 * Report: writes backend/spotify-link-report-<timestamp>.json with full
 * per-artist detail (tier, matched id/name, confidence signals) regardless of
 * --write, so match quality can always be reviewed after the fact.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const LIMIT = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 200);
const WRITE = args.includes('--write');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}
if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
  console.error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// The Spotify fetch() calls already had AbortSignal timeouts added after the
// first hang; a second run still hung before candidate 25 even printed, which
// points at the Supabase client's own (also-unbounded) requests instead --
// its query builder doesn't accept a plain timeout option, so race it
// manually. Doesn't cancel the underlying request, just stops the batch from
// waiting on it forever.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Obvious tribute/cover-band/impersonator name patterns. Conservative on
// purpose: false negatives (searching a real tribute act, landing in tier B/C/D
// and just not auto-linking) are harmless; false positives (linking a tribute
// act to the real artist's Spotify ID) are not.
const TRIBUTE_PATTERN = /\btribute(?:\s+to)?\b|\bcover\s*band\b|\bimpersonator\b|\btribute\s*band\b|\bas\s+performed\s+by\b/i;

function isLikelyTributeAct(name) {
  return TRIBUTE_PATTERN.test(name);
}

// Normalize for comparison only (never overwrites the stored name): lowercase,
// strip diacritics, "&"->"and", collapse punctuation/whitespace.
function normalizeName(name) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// No fetch() call in this file may run unbounded -- a single stalled
// connection (dropped TCP, silent hang) previously blocked the entire
// sequential batch forever with no error and no CPU usage, since nothing
// ever timed out. Every request gets an explicit AbortSignal timeout so a
// stuck request fails fast and the loop can log it and move on instead of
// hanging indefinitely.
const FETCH_TIMEOUT_MS = 15000;

async function getSpotifyToken() {
  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`Spotify token request failed: ${resp.status} ${await resp.text()}`);
  }
  const data = await resp.json();
  return data.access_token;
}

// Thrown when Spotify hands back a Retry-After long enough that sleeping
// through it inline would stall the whole batch (observed: 4661s / ~78min
// after ~950 cumulative requests in one day -- this app's quota is far
// stricter than assumed). The caller aborts the run instead of retrying.
class RateLimitedError extends Error {
  constructor(retryAfterSeconds) {
    super(`Spotify rate limit hit, Retry-After: ${retryAfterSeconds}s`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// Retry-after waits up to this long inline (brief, ordinary throttling);
// anything longer means real quota exhaustion, not a transient blip -- stop
// the batch instead of sleeping through it.
const MAX_INLINE_RETRY_WAIT_SECONDS = 20;

async function searchSpotifyArtist(token, name, attempt = 0) {
  const url = `https://api.spotify.com/v1/search?type=artist&limit=5&q=${encodeURIComponent(name)}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (resp.status === 429) {
    const retryAfter = Number(resp.headers.get('retry-after') || '2');
    if (retryAfter > MAX_INLINE_RETRY_WAIT_SECONDS) {
      throw new RateLimitedError(retryAfter);
    }
    if (attempt >= 3) throw new Error(`Rate limited repeatedly searching "${name}"`);
    await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
    return searchSpotifyArtist(token, name, attempt + 1);
  }
  if (!resp.ok) {
    throw new Error(`Spotify search failed for "${name}": ${resp.status} ${await resp.text()}`);
  }
  const data = await resp.json();
  return data.artists?.items ?? [];
}

async function fetchCandidates(limit) {
  // Artists with no spotify entry in external_identifiers yet, prioritized by
  // upcoming event count so the ones that actually surface in the feed get
  // linked first. Filtering out the tiny fraction that already has a spotify
  // entry happens in JS since PostgREST can't express the
  // jsonb_array_elements EXISTS check as a simple column filter. PostgREST
  // caps rows per request (project default ~1000) regardless of .limit(), so
  // a single oversized .limit() call silently truncates -- page through with
  // .range() instead until enough unlinked candidates are collected or the
  // table is exhausted.
  const PAGE_SIZE = 1000;
  const withoutSpotify = [];
  let offset = 0;

  while (withoutSpotify.length < limit) {
    console.log(`  [fetchCandidates] requesting page at offset ${offset}...`);
    const { data: rows, error: fetchError } = await withTimeout(
      supabase
        .from('artists')
        .select('id, name, external_identifiers, num_upcoming_events')
        .order('num_upcoming_events', { ascending: false, nullsFirst: false })
        .range(offset, offset + PAGE_SIZE - 1),
      20000,
      `fetchCandidates page at offset ${offset}`
    );

    if (fetchError) throw fetchError;
    if (!rows || rows.length === 0) break; // table exhausted

    for (const a of rows) {
      const ids = Array.isArray(a.external_identifiers) ? a.external_identifiers : [];
      if (!ids.some((e) => e?.source === 'spotify')) {
        withoutSpotify.push(a);
      }
    }

    offset += PAGE_SIZE;
  }

  return withoutSpotify.slice(0, limit);
}

async function main() {
  console.log(`Spotify Artist Linker — ${WRITE ? 'WRITE MODE' : 'DRY RUN'}, candidate limit ${LIMIT}`);

  const candidates = await fetchCandidates(LIMIT);
  console.log(`Fetched ${candidates.length} candidate artists (no spotify id yet, prioritized by upcoming events).`);

  const checkpointPath = path.join(__dirname, `spotify-link-report-${Date.now()}.json`);

  let token = await getSpotifyToken();
  let tokenObtainedAt = Date.now();
  console.log('Obtained Spotify app access token.');

  const results = [];
  let tierACount = 0;
  let skippedTributeCount = 0;

  for (let i = 0; i < candidates.length; i++) {
    const artist = candidates[i];
    console.log(`[${i + 1}/${candidates.length}] ${new Date().toISOString()} ${artist.name}`);

    // Client Credentials tokens expire after ~1hr; a run this size can outlast
    // that, so refresh proactively at 50min rather than let every subsequent
    // request start silently failing with 401s.
    if (Date.now() - tokenObtainedAt > 50 * 60 * 1000) {
      token = await getSpotifyToken();
      tokenObtainedAt = Date.now();
      console.log(`  ...refreshed Spotify access token at candidate ${i + 1}/${candidates.length}`);
    }

    if (isLikelyTributeAct(artist.name)) {
      skippedTributeCount++;
      results.push({
        artist_id: artist.id,
        name: artist.name,
        tier: 'skipped_tribute_pattern',
      });
      continue;
    }

    let items;
    try {
      items = await searchSpotifyArtist(token, artist.name);
    } catch (err) {
      if (err instanceof RateLimitedError) {
        // Stop the whole run rather than sleep through an hour-plus lockout --
        // save what we have and let the operator resume later once quota
        // resets, instead of silently blocking for potentially hours.
        console.error(`\nSpotify rate limit hit at candidate ${i + 1}/${candidates.length} (${artist.name}).`);
        console.error(`Retry-After: ${err.retryAfterSeconds}s (~${Math.round(err.retryAfterSeconds / 60)} min). Stopping run.`);
        fs.writeFileSync(checkpointPath, JSON.stringify({
          limit: LIMIT, write: WRITE, inProgress: false, stoppedForRateLimit: true,
          stoppedAtCandidate: i + 1, total: candidates.length,
          retryAfterSeconds: err.retryAfterSeconds, results,
        }, null, 2));
        console.error(`Partial report written to ${checkpointPath}. Re-run the same command after the cooldown to resume (already-linked artists are skipped automatically).`);
        process.exit(2);
      }
      results.push({ artist_id: artist.id, name: artist.name, tier: 'error', error: String(err.message || err) });
      continue;
    }

    const normalizedOurs = normalizeName(artist.name);
    const exactMatches = items.filter((it) => normalizeName(it.name) === normalizedOurs);

    let tier;
    let matched = null;
    if (items.length === 0) {
      tier = 'no_results';
    } else if (exactMatches.length === 1) {
      tier = 'tier_a_auto_link';
      matched = exactMatches[0];
      tierACount++;
    } else if (exactMatches.length > 1) {
      tier = 'tier_b_ambiguous_exact_matches';
    } else {
      tier = 'tier_c_no_exact_match';
    }

    results.push({
      artist_id: artist.id,
      name: artist.name,
      tier,
      matched_spotify_id: matched?.id ?? null,
      matched_spotify_name: matched?.name ?? null,
      matched_popularity: matched?.popularity ?? null,
      top_candidates: items.slice(0, 3).map((it) => ({ id: it.id, name: it.name, popularity: it.popularity })),
    });

    if (WRITE && tier === 'tier_a_auto_link') {
      const existing = Array.isArray(artist.external_identifiers) ? artist.external_identifiers : [];
      const updated = [...existing, { source: 'spotify', identifier: [matched.id] }];
      try {
        const { error: updateError } = await withTimeout(
          supabase.from('artists').update({ external_identifiers: updated }).eq('id', artist.id),
          15000,
          `update artist ${artist.id}`
        );
        if (updateError) {
          results[results.length - 1].write_error = String(updateError.message || updateError);
        } else {
          results[results.length - 1].written = true;
        }
      } catch (err) {
        results[results.length - 1].write_error = String(err.message || err);
      }
    }

    // Pace requests conservatively: ~950 cumulative requests today (dry runs +
    // earlier attempts at 300ms/req) already triggered a real ~78min Spotify
    // lockout, so this app's actual quota is much stricter than assumed for a
    // batch this size. 1/sec is a good-faith slowdown, but if the underlying
    // limit is a rolling total-request-count (not just per-second), this may
    // still hit it eventually -- that's what the RateLimitedError abort above
    // is for, so the run stops cleanly instead of blocking for hours either way.
    await new Promise((r) => setTimeout(r, 1000));
    if ((i + 1) % 25 === 0) {
      console.log(`  ...${i + 1}/${candidates.length} processed`);
    }
    // Checkpoint the report periodically so a long run's progress survives a
    // crash/interruption -- the DB writes above are already durable per-row
    // regardless, this is just so the report itself isn't all-or-nothing.
    if ((i + 1) % 200 === 0) {
      fs.writeFileSync(checkpointPath, JSON.stringify({ limit: LIMIT, write: WRITE, inProgress: true, processed: i + 1, total: candidates.length, results }, null, 2));
    }
  }

  const tally = results.reduce((acc, r) => {
    acc[r.tier] = (acc[r.tier] || 0) + 1;
    return acc;
  }, {});

  console.log('\n=== Summary ===');
  console.log(`Candidates processed: ${candidates.length}`);
  console.log(`Skipped as likely tribute/cover acts: ${skippedTributeCount}`);
  console.table(tally);
  console.log(`Tier A (auto-linkable, exact single match): ${tierACount}`);
  if (WRITE) {
    console.log(`Writes performed: ${results.filter((r) => r.written).length}`);
  } else {
    console.log('Dry run — no database writes performed. Re-run with --write to persist tier A matches.');
  }

  fs.writeFileSync(checkpointPath, JSON.stringify({ limit: LIMIT, write: WRITE, inProgress: false, tally, results }, null, 2));
  console.log(`\nFull report written to ${checkpointPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
