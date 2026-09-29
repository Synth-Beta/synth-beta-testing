/**
 * Tribute/cover acts inherit the genres of the act they cover — from our OWN
 * artists table, no external API.
 *
 * WHY: `artists.genres` for these acts was written by the deleted Python/Spotify
 * enrichment, which name-matched with no verification. A tribute act does not
 * exist on Spotify, so it got the nearest unrelated artist's genres: "Almost
 * Queen" ended up ["afro house"] and therefore in the EDM chat's Upcoming Shows
 * (reported live 2026-09-27). Those rows are invisible to
 * scripts/enrich-artist-genres.mjs forever — its queue wants EMPTY genres, and
 * these are non-empty.
 *
 * Re-querying MusicBrainz/Last.fm/iTunes does NOT fix this class: measured over
 * the 28 highest-event offenders, 25% are unknown to all three sources (Sinatra
 * Live!, Harry Potter in Concert, The Simon & Garfunkel Story...) and a further
 * 6 came back WORSE (Salut Salon: contemporary classical -> cabaret). But the
 * act being covered is almost always already in our table with decent genres,
 * and it is the definitionally right answer for a cover band. So: read the
 * original out of the act's own name and copy.
 *
 * TRUST GATE: the original must not itself be in the same broken cohort.
 * "Ultimate Ozzy" resolves to an "Ozzy" row whose own genres are
 * ["hip-hop-rap"] — same legacy bug, one hop away. An original is trusted when
 * its genres came from JamBase (present in its own raw_jambase_data.genre) or
 * the current verified pipeline has processed it (genre_lookup_attempted_at).
 *
 * WRITES NOTHING. Emits review-only SQL to
 * supabase/genre-tribute-fix-<date>/01_fix_tribute_genres.sql, per this repo's
 * convention that schema/data changes are reviewed and run by hand.
 *
 * Usage:
 *   node scripts/fix-tribute-genres.mjs            # scan, write SQL
 *   node scripts/fix-tribute-genres.mjs --check     # self-check, no DB
 *   TRIBUTE_FIX_LIMIT=50 node scripts/fix-tribute-genres.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
// The real chat tag map, imported straight from the shared package — Node
// strips the TS types natively, so there is no second copy to drift.
import { GENRE_CHAT_TAG_MAP } from '../packages/synth-shared/src/genreChatTagMap.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** tag (lowercased) -> the genre chats it routes an event into. */
const CHATS_BY_TAG = new Map();
for (const [chat, tags] of Object.entries(GENRE_CHAT_TAG_MAP)) {
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (!CHATS_BY_TAG.has(key)) CHATS_BY_TAG.set(key, new Set());
    CHATS_BY_TAG.get(key).add(chat);
  }
}
const chatsForTag = tag => CHATS_BY_TAG.get(String(tag).toLowerCase()) || new Set();
export const chatsForGenres = genres =>
  new Set((genres || []).flatMap(g => [...chatsForTag(g)]));

/** Names that advertise themselves as covering someone else. */
const TRIBUTE_NAME = /tribute|salute|celebrat|songs of|music of|plays |performs |story|ultimate|experience|one night (?:of|with)/i;

/** Pull the covered act out of a tribute act's name, or null. */
export function referencedArtist(name) {
  const patterns = [
    /tribute to ([^)(\-–—:]+)/i,
    /([^)(\-–—:]+?)\s*tribute/i,
    /songs of ([^)(\-–—:]+)/i,
    /music of ([^)(\-–—:]+)/i,
    /the ([^)(\-–—:]+?) story/i,
    /ultimate ([^)(\-–—:]+)/i,
    // "One Night of Queen with Gary Mullen & The Works" — 49 upcoming events in
    // the EDM chat off a stray `darkwave` tag, and the shape this pass missed
    // on its first run. `with ...` is a performer credit, not part of the name.
    /one night (?:of|with) ([^)(\-–—:]+?)(?:\s+with\s+.*)?$/i,
    /celebrating ([^)(\-–—:]+)/i,
    /salute to ([^)(\-–—:]+)/i,
    /([^)(\-–—:]+?) experience/i,
    /performs? ([^)(\-–—:]+)/i,
    /plays ([^)(\-–—:]+)/i,
  ];
  for (const re of patterns) {
    const m = (name || '').match(re);
    if (!m) continue;
    // Strip the scaffolding words these names are built from, so what is left
    // is just the covered act.
    const stripped = m[1]
      // Curly apostrophes are the norm in these names, so match both forms.
      .replace(/\b(a|an|the|band|live|in concert|show|project|ultimate|greatest hits|music|world['’]?s|worlds|greatest|#\d+|no\.?\s*\d+)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (stripped.length >= 3) return stripped;
  }
  return null;
}

const norm = s => String(s || '').toLowerCase().replace(/^the\s+/, '').replace(/[^\w\s&]/g, '').replace(/\s+/g, ' ').trim();

/** Tags on `row` that its own JamBase payload never supplied. */
export function guessedTags(genres, jambaseGenres) {
  const jb = new Set((jambaseGenres || []).map(g => String(g).toLowerCase()));
  return (genres || []).filter(g => !jb.has(String(g).toLowerCase()));
}

/**
 * An original is only safe to copy from when its own genres have provenance:
 * JamBase supplied them, or the current verified pipeline has looked at it.
 * Anything else is the same unverified legacy guess one hop away.
 */
export function isTrustedOriginal(original) {
  const genres = original?.genres || [];
  if (genres.length === 0) return false;
  if (genres.length === 1 && String(genres[0]).toLowerCase() === 'small artist') return false;
  if (original.genre_lookup_attempted_at) return true;
  if (guessedTags(genres, original.genre).length === 0) return true;
  // Unverified, but self-corroborating: several tags that agree on where they
  // belong. Queen is ["classic rock","rock","glam rock"] — legacy-unverified yet
  // obviously right, and 149 acts were stuck behind it. A SINGLE unverified tag
  // stays refused, which is exactly the "Ozzy" -> ["hip-hop-rap"] case: one
  // stray value with nothing agreeing with it.
  const chats = chatsForGenres(genres);
  return genres.length >= 2 && chats.size > 0 && chats.size <= 2;
}

/**
 * Only ever remove a guess that MISROUTES, never one that merely adds detail.
 *
 * The first cut of this replaced the act's tags wholesale and that lost real
 * information: the AC/DC tribute's ["rock","hard rock","classic rock","rock and
 * roll"] would have collapsed to AC/DC's own coarse JamBase ["rock"]. So a
 * guessed tag survives unless it routes the act into a chat the covered act
 * reaches none of — which is exactly the reported bug and nothing else. Tags
 * that map to no chat at all (e.g. "Neue Deutsche Härte") can't misroute, so
 * they stay. JamBase's own tags for the act are never dropped.
 */
export function buildProposal(act, original) {
  const originalChats = chatsForGenres(original.genres);
  const keep = (act.genres || []).filter(g => {
    if (!guessedTags([g], act.genre).length) return true; // JamBase said it
    const chats = chatsForTag(g);
    return chats.size === 0 || [...chats].some(c => originalChats.has(c));
  });

  const out = [];
  const seen = new Set();
  for (const g of [...keep, ...(original.genres || [])]) {
    const key = String(g).toLowerCase().trim();
    if (!key || key === 'small artist' || seen.has(key)) continue;
    seen.add(key);
    out.push(g);
  }
  return out;
}

/**
 * When the act's own tags form a coherent cluster (3+ tags) and the covered act
 * drags it into a completely disjoint set of chats, the broken side might be the
 * ORIGINAL, not the act: our "Ozzy" row carries JamBase's own garbage
 * ["hip-hop-rap"], which would have rewritten two Ozzy tributes from
 * metal/glam metal/heavy metal/hard rock to hip-hop. The trust gate can't catch
 * that — JamBase supplied it, so it counts as provenance. These go to a review
 * file instead of the main SQL; a human decides.
 */
export function needsHumanReview(act, proposed) {
  const before = chatsForGenres(act.genres);
  const after = chatsForGenres(proposed);
  if (before.size === 0) return false;
  if ([...before].some(c => after.has(c))) return false;
  const kept = new Set(proposed.map(g => String(g).toLowerCase()));
  const dropped = (act.genres || []).filter(g => !kept.has(String(g).toLowerCase()));
  return dropped.length >= 3;
}

const sameSet = (a, b) =>
  JSON.stringify((a || []).map(x => String(x).toLowerCase()).sort()) ===
  JSON.stringify((b || []).map(x => String(x).toLowerCase()).sort());

const sqlArray = arr => `ARRAY[${arr.map(g => `'${String(g).replace(/'/g, "''")}'`).join(',')}]::text[]`;

async function loadEnv() {
  try {
    const dotenv = await import('dotenv');
    dotenv.default.config({ path: '.env.local' });
  } catch {
    // dotenv not installed — assume env vars are already set
  }
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url) throw new Error('Missing SUPABASE_URL (or VITE_SUPABASE_URL).');
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY. This script reads artists/events with service-role access.');
  if (key === anon) throw new Error('SECURITY ERROR: SUPABASE_SERVICE_ROLE_KEY cannot be the same as the anon key.');
  return createClient(url, key);
}

const SELECT = 'id,name,genres,num_upcoming_events,genre_lookup_attempted_at,raw_jambase_data->genre';

/** Candidate acts: unverified legacy genres + a name that names someone else. */
async function* suspectActs(supabase) {
  let cursor = null;
  for (;;) {
    let query = supabase
      .from('artists')
      .select(SELECT)
      .gt('num_upcoming_events', 0)
      .is('genre_lookup_attempted_at', null)
      .not('genres', 'is', null)
      .not('genres', 'eq', '{small artist}')
      .not('genres', 'eq', '{}')
      .order('id')
      .limit(1000);
    if (cursor) query = query.gt('id', cursor);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) return;

    for (const act of data) {
      if (!TRIBUTE_NAME.test(act.name || '')) continue;
      if (guessedTags(act.genres, act.genre).length === 0) continue;
      yield act;
    }
    cursor = data[data.length - 1].id;
  }
}

/**
 * Resolve the covered act. Exact-name match only (with/without a leading
 * "The") — no substring matching: "Kings Of Floyd" must not resolve off a bare
 * "Floyd", which is how this whole mess started.
 */
async function resolveOriginal(supabase, refName, actId) {
  const wanted = norm(refName);
  const { data, error } = await supabase
    .from('artists')
    .select(SELECT)
    .or(`name.ilike.${refName.replace(/[,()]/g, ' ')},name.ilike.the ${refName.replace(/[,()]/g, ' ')}`)
    .not('genres', 'is', null)
    .order('num_upcoming_events', { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data || []).find(row => row.id !== actId && norm(row.name) === wanted) || null;
}

async function main() {
  if (process.argv.includes('--check')) return selfCheck();

  await loadEnv();
  const supabase = getSupabase();
  const limit = Number(process.env.TRIBUTE_FIX_LIMIT) || Infinity;

  const fixes = [];
  const review = [];
  const unresolved = [];
  let scanned = 0;

  for await (const act of suspectActs(supabase)) {
    if (fixes.length >= limit) break;
    scanned++;
    const ref = referencedArtist(act.name);
    if (!ref) { unresolved.push(`${act.name} — no original extractable from name`); continue; }

    const original = await resolveOriginal(supabase, ref, act.id);
    if (!original) { unresolved.push(`${act.name} — looked for "${ref}", no exact match in artists`); continue; }
    if (!isTrustedOriginal(original)) {
      unresolved.push(`${act.name} — "${original.name}" found but its own genres are unverified (${JSON.stringify(original.genres)})`);
      continue;
    }
    // Nothing to correct with: if the covered act reaches no chat either (e.g.
    // Tina Turner carries the unmapped spelling "R&B/Soul"), copying it would
    // drop the act out of every chat instead of into the right one.
    if (chatsForGenres(original.genres).size === 0) {
      unresolved.push(`${act.name} — "${original.name}" genres reach no genre chat (${JSON.stringify(original.genres)})`);
      continue;
    }

    const proposed = buildProposal(act, original);
    if (proposed.length === 0 || sameSet(proposed, act.genres)) continue;

    if (needsHumanReview(act, proposed)) {
      review.push({ act, original, proposed });
      console.log(`⚠ REVIEW ${act.name} (${act.num_upcoming_events}ev)\n    ${JSON.stringify(act.genres)} -> ${JSON.stringify(proposed)}   [from "${original.name}" — is the original right?]`);
      continue;
    }

    fixes.push({ act, original, proposed });
    console.log(`✓ ${act.name} (${act.num_upcoming_events}ev)\n    ${JSON.stringify(act.genres)} -> ${JSON.stringify(proposed)}   [from "${original.name}"]`);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const outDir = path.join(__dirname, '..', 'supabase', `genre-tribute-fix-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  const header = `-- ============================================================================
-- Tribute/cover acts: adopt the covered act's genres (${stamp})
-- ============================================================================
-- REVIEW THIS, THEN RUN IT YOURSELF. Nothing here is auto-applied.
-- Generated by scripts/fix-tribute-genres.mjs — see that file for why the
-- stored values are wrong and why an API re-query cannot fix this class.
--
-- ONE statement. Artists and their INHERITED events (events whose array still
-- equals the artist's old one) are updated together; events carrying their own
-- JamBase genres are left alone. Earlier revisions of this file were ~80 separate
-- statements and a partial selection in the SQL editor silently applied only
-- some of them while still reporting success — a single statement cannot do that.
--
-- No backup table: the old value of every row is right here in the VALUES list,
-- and the ROLLBACK at the bottom is the same statement with the columns swapped.
--
-- ${fixes.length} act(s), ${fixes.reduce((n, f) => n + (f.act.num_upcoming_events || 0), 0)} upcoming event(s).
-- ============================================================================
`;

  const valuesList = fixes
    .map(({ act, original, proposed }, i) =>
      `    ('${act.id}'::uuid, ${sqlArray(act.genres || [])}, ${sqlArray(proposed)})${i === fixes.length - 1 ? '' : ','}` +
      `  -- ${act.name} (covers "${original.name}", ${act.num_upcoming_events} upcoming)`
    )
    .join('\n');

  const statement = (oldCol, newCol) => `WITH v(artist_id, old_genres, new_genres) AS (
  VALUES
${valuesList}
),
updated_artists AS (
  UPDATE public.artists a
     SET genres = v.${newCol}, updated_at = now()
    FROM v
   WHERE a.id = v.artist_id
  RETURNING a.id
)
UPDATE public.events e
   SET genres = v.${newCol}, updated_at = now()
  FROM v
 WHERE e.artist_id = v.artist_id
   -- "contained by", not equality: events rarely hold the artist's array
   -- verbatim. One Night of Queen's 49 upcoming events held ["darkwave"] (6) and
   -- ["tribute"] (43) — both subsets of its old ["darkwave","tribute"] — so an
   -- equality test updated none of them and 6 stayed in the EDM chat. Anything
   -- built only from tags the artist itself carried is inherited; an event with
   -- a tag from outside that set is its own data and is left alone.
   AND e.genres <@ v.${oldCol}
   AND e.genres <> v.${newCol};`;

  const body = [statement('old_genres', 'new_genres')];

  const footer = `
-- ── VERIFY ──────────────────────────────────────────────────────────────────
-- The UPDATE reports the number of EVENT rows it touched, not artists, so it is
-- not a useful check on its own. Instead re-run the generator afterwards:
--   node scripts/fix-tribute-genres.mjs
-- It rescans the live table and skips rows already matching, so a run that
-- reports "0 fixable" means this file is fully applied.

-- ── ROLLBACK (same statement, old and new swapped) ──────────────────────────
${statement('new_genres', 'old_genres')
  .split('\n')
  .map(l => `-- ${l}`)
  .join('\n')}
`;

  // A rerun is a NEW batch (the queue grows as originals get fixed and unblock
  // acts behind the trust gate), so never reuse a filename — an earlier file is
  // the record of what was already run. Empty batch: write nothing at all, since
  // an empty VALUES list isn't valid SQL either.
  const nextIndex = String(
    fs
      .readdirSync(outDir)
      .filter(f => /^\d+_fix_tribute_genres\.sql$/.test(f))
      .reduce((max, f) => Math.max(max, Number(f.slice(0, f.indexOf('_')))), 0) + 1
  ).padStart(2, '0');
  const sqlPath = path.join(outDir, `${nextIndex}_fix_tribute_genres.sql`);
  if (fixes.length > 0) fs.writeFileSync(sqlPath, [header, ...body, footer].join('\n\n'));
  fs.writeFileSync(path.join(outDir, 'unresolved.txt'), unresolved.join('\n') + '\n');

  const reviewPath = path.join(outDir, 'needs-review.txt');
  fs.writeFileSync(
    reviewPath,
    review.length
      ? `Not in the SQL: the covered act's own genres may be the broken side.\nDecide per act, then hand-write the UPDATE.\n\n` +
          review
            .map(({ act, original, proposed }) =>
              `${act.name}  (${act.num_upcoming_events} upcoming, id ${act.id})\n` +
              `  currently: ${JSON.stringify(act.genres)}\n` +
              `  would become: ${JSON.stringify(proposed)}\n` +
              `  because "${original.name}" is ${JSON.stringify(original.genres)}\n`
            )
            .join('\n')
      : 'none\n'
  );

  console.log(`\n📊 ${scanned} tribute-ish suspects scanned, ${fixes.length} fixable, ${review.length} need review, ${unresolved.length} unresolved.`);
  console.log(
    fixes.length > 0
      ? `   SQL (review, then run):  ${path.relative(process.cwd(), sqlPath)}`
      : `   Nothing to fix — SQL left untouched (every resolvable act already matches).`
  );
  console.log(`   Needs a human decision:  ${path.relative(process.cwd(), reviewPath)}`);
  console.log(`   Unresolved list:         ${path.relative(process.cwd(), path.join(outDir, 'unresolved.txt'))}`);
}

async function selfCheck() {
  const assert = (await import('assert')).default;
  // Name extraction across the shapes these acts actually use in prod.
  assert.strictEqual(referencedArtist('Bounce (Bon Jovi Tribute)'), 'Bon Jovi');
  assert.strictEqual(referencedArtist('Queen Legacy – A Tribute to Queen'), 'Queen');
  assert.strictEqual(referencedArtist('RAEL – The Music of Genesis'), 'Genesis');
  assert.strictEqual(referencedArtist('The Simon & Garfunkel Story'), 'Simon & Garfunkel');
  assert.strictEqual(referencedArtist('Eaglemania: The World’s Greatest Eagles Tribute Band'), 'Eagles');
  assert.strictEqual(referencedArtist('Radiohead'), null);

  // Trust gate: an original carrying the same unverified legacy guess is refused.
  const ozzy = { genres: ['hip-hop-rap'], genre: [], genre_lookup_attempted_at: null };
  assert.strictEqual(isTrustedOriginal(ozzy), false);
  assert.strictEqual(isTrustedOriginal({ genres: ['rock'], genre: ['rock'], genre_lookup_attempted_at: null }), true);
  assert.strictEqual(isTrustedOriginal({ genres: ['pop'], genre: [], genre_lookup_attempted_at: '2026-09-01T00:00:00Z' }), true);
  assert.strictEqual(isTrustedOriginal({ genres: ['small artist'], genre: [], genre_lookup_attempted_at: '2026-09-01T00:00:00Z' }), false);
  // Self-corroborating unverified genres are trusted; a lone unverified tag is not.
  assert.strictEqual(
    isTrustedOriginal({ genres: ['classic rock', 'rock', 'glam rock'], genre: [], genre_lookup_attempted_at: null }),
    true
  );
  assert.strictEqual(isTrustedOriginal({ genres: ['hip-hop-rap'], genre: [], genre_lookup_attempted_at: null }), false);
  // Tags scattered across many chats corroborate nothing.
  assert.strictEqual(
    isTrustedOriginal({ genres: ['techno', 'bluegrass', 'opera', 'reggae'], genre: [], genre_lookup_attempted_at: null }),
    false
  );
  // Also the name shape that was missed the first time round.
  assert.strictEqual(referencedArtist('One Night of Queen with Gary Mullen & The Works'), 'Queen');

  // The reported bug: a guess routing to a chat the covered act never reaches
  // is dropped. The act's own JamBase tag survives; dedupe is case-insensitive.
  assert.deepStrictEqual(
    buildProposal({ genres: ['tribute', 'afro house'], genre: ['tribute'] }, { genres: ['classic rock', 'Rock'] }),
    ['tribute', 'classic rock', 'Rock']
  );
  assert.deepStrictEqual(
    buildProposal({ genres: ['reggae', 'dub'], genre: [] }, { genres: ['classic rock', 'glam rock'] }),
    ['classic rock', 'glam rock']
  );
  // Detail must NOT be flattened: every one of these routes to `rock`, which
  // the covered act reaches too, so all of them stay and the row is unchanged.
  assert.deepStrictEqual(
    buildProposal({ genres: ['rock', 'hard rock', 'classic rock', 'rock and roll'], genre: [] }, { genres: ['rock'] }),
    ['rock', 'hard rock', 'classic rock', 'rock and roll']
  );
  // A tag that maps to no chat can't misroute, so it is kept as extra detail;
  // "techno" alongside it would put a Rammstein tribute in the EDM chat, so it
  // goes. ("gabber" is unmapped today — kept for the same reason as the NDH tag.)
  assert.deepStrictEqual(
    buildProposal({ genres: ['Neue Deutsche Härte', 'gabber', 'techno'], genre: [] }, { genres: ['metal', 'pop'] }),
    ['Neue Deutsche Härte', 'gabber', 'metal', 'pop']
  );
  // Chat reachability is what the fix is judged on.
  assert.deepStrictEqual([...chatsForGenres(['afro house'])], ['edm']);
  assert.strictEqual(chatsForGenres(['R&B/Soul']).size, 0);

  // The live Ozzy case: 4 coherent metal tags vs a covered act our DB thinks is
  // hip-hop. Too suspect to auto-write — a human looks at it.
  assert.strictEqual(
    needsHumanReview({ genres: ['metal', 'glam metal', 'heavy metal', 'hard rock'], genre: [] }, ['hip-hop-rap']),
    true
  );
  // One wrong tag replaced by a plausible original is the normal fix, not review.
  assert.strictEqual(needsHumanReview({ genres: ['afro house'], genre: [] }, ['classic rock', 'rock']), false);
  // Overlapping chats before and after is never suspect.
  assert.strictEqual(needsHumanReview({ genres: ['rock', 'hard rock', 'arena rock'], genre: [] }, ['rock']), false);
  console.log('✅ fix-tribute-genres self-check passed.');
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
