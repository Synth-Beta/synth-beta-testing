/**
 * Fetch genres for an artist from two free, no-auth sources:
 *   1. MusicBrainz — direct MBID lookup when known (via JamBase's
 *      external_identifiers), else a name search (score >= 80) using tags
 *      embedded in the search response itself.
 *   2. iTunes Search API — single `primaryGenreName` per artist, weaker than
 *      MusicBrainz's multi-genre tags but free coverage MusicBrainz doesn't
 *      have. Tried only when MusicBrainz didn't find a match. ON BY DEFAULT
 *      (set GENRE_ENRICH_USE_ITUNES=0 to disable and go MusicBrainz-only).
 *
 * Spotify was the original plan (and is what the deleted, Python-based
 * predecessor of this module used), but live testing during this rewrite
 * showed Spotify's Web API — under this app's current Client Credentials
 * access — no longer returns a `genres` field on artist objects at all,
 * neither via search nor direct id lookup (checked against known mainstream
 * artists and real Spotify ids already in the DB; genres was consistently
 * absent). Spotify was dropped from this pipeline rather than shipped as
 * dead weight that always returns nothing.
 *
 * Previously this shelled out to a Python script (process_artists_without_genres.py)
 * that was deleted from the repo in a cleanup commit without anyone noticing —
 * every call silently no-op'd (soft-fail -> empty genres) from that point on. This
 * is a from-scratch Node rewrite with no external process dependency.
 *
 * Each source has its OWN circuit breaker (a 429 or 503 from that source trips
 * only that source, not the other) — no retries into a rate-limit penalty on
 * either. `isGenreLookupCircuitTripped()` only reports true once BOTH sources
 * are down, since that's the point no further progress is possible; until
 * then, a tripped MusicBrainz still lets iTunes keep making progress.
 * (A prior Spotify lookup effort elsewhere in this project hit an escalating
 * 78min -> 21.5hr penalty from retrying through 429s; this module refuses to
 * repeat that pattern against any API.)
 */

const MUSICBRAINZ_API_BASE = 'https://musicbrainz.org/ws/2';
const MUSICBRAINZ_USER_AGENT = 'SynthApp/1.0 (+https://getsynth.app)';
// MusicBrainz's stated policy is 1 req/sec. Live testing tripped their 503
// throttle at 1.5s spacing too — twice: once during development, once during
// a real enrich-artist-genres.mjs run that only got through ~41 artists before
// tripping. Their real enforcement has meaningfully less slack than the
// stated number (or a burst-penalty window outlasts individual requests).
// Paced well under the stated limit as a result; runs will still trip the
// breaker periodically and need re-running later — that's expected, not a bug.
const MUSICBRAINZ_MIN_DELAY_MS = 3000;

// On by default — MusicBrainz alone wasn't finding enough (most of what's
// left is genuinely untagged anywhere, but iTunes catches some MusicBrainz
// misses). Set GENRE_ENRICH_USE_ITUNES=0 to go back to MusicBrainz-only.
const ITUNES_ENABLED = process.env.GENRE_ENRICH_USE_ITUNES !== '0';

const ITUNES_API_BASE = 'https://itunes.apple.com';
// No official published limit; ~20 req/min is the commonly cited informal
// ceiling for the public Search API and it isn't known for the kind of
// escalating penalty Spotify/MusicBrainz have shown in this project. Paced
// safely under that.
const ITUNES_MIN_DELAY_MS = 4000;

let lastMusicBrainzCallAt = 0;
let mbCircuitTripped = false;
let mbCircuitTripReason = null;

let lastItunesCallAt = 0;
let itunesCircuitTripped = false;
let itunesCircuitTripReason = null;

function tripMusicBrainzCircuit(reason) {
  if (mbCircuitTripped) return;
  mbCircuitTripped = true;
  mbCircuitTripReason = reason;
  console.error(`\n🛑 MusicBrainz circuit breaker tripped: ${reason}`);
  console.error('🛑 No further MusicBrainz calls will be made until reset.\n');
}

function tripItunesCircuit(reason) {
  if (itunesCircuitTripped) return;
  itunesCircuitTripped = true;
  itunesCircuitTripReason = reason;
  console.error(`\n🛑 iTunes circuit breaker tripped: ${reason}`);
  console.error('🛑 No further iTunes calls will be made until reset.\n');
}

async function musicBrainzRequest(path, params) {
  if (mbCircuitTripped) return null;
  const wait = lastMusicBrainzCallAt + MUSICBRAINZ_MIN_DELAY_MS - Date.now();
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  lastMusicBrainzCallAt = Date.now();

  const url = new URL(`${MUSICBRAINZ_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { 'User-Agent': MUSICBRAINZ_USER_AGENT, Accept: 'application/json' },
  });

  // MusicBrainz throttles with 503 (not 429 — confirmed by hitting it live
  // during development). Treat both as the rate-limit signal so a real
  // throttle always trips the breaker instead of being silently swallowed
  // as "artist not found".
  if (response.status === 429 || response.status === 503) {
    tripMusicBrainzCircuit(`MusicBrainz returned ${response.status} (Retry-After: ${response.headers.get('retry-after') || 'unknown'}s)`);
    return null;
  }
  if (!response.ok) return null;
  return response.json();
}

async function itunesRequest(params) {
  if (itunesCircuitTripped) return null;
  const wait = lastItunesCallAt + ITUNES_MIN_DELAY_MS - Date.now();
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  lastItunesCallAt = Date.now();

  const url = new URL(`${ITUNES_API_BASE}/search`);
  for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { 'User-Agent': MUSICBRAINZ_USER_AGENT } });

  if (response.status === 429 || response.status === 503) {
    tripItunesCircuit(`iTunes returned ${response.status} (Retry-After: ${response.headers.get('retry-after') || 'unknown'}s)`);
    return null;
  }
  if (!response.ok) return null;
  return response.json();
}

function extractMusicBrainzId(externalIdentifiers) {
  if (!Array.isArray(externalIdentifiers)) return null;
  const entry = externalIdentifiers.find(
    e => e?.source === 'musicbrainz' && Array.isArray(e.identifier) && e.identifier.length > 0
  );
  return entry ? entry.identifier[0] : null;
}

function namesMatch(a, b) {
  const clean = s => s.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const cleanA = clean(a);
  const cleanB = clean(b);
  if (!cleanA || !cleanB) return false;
  if (cleanA === cleanB) return true;
  const shorter = Math.min(cleanA.length, cleanB.length);
  const longer = Math.max(cleanA.length, cleanB.length);
  if (shorter >= 3 && (cleanA.includes(cleanB) || cleanB.includes(cleanA)) && shorter / longer >= 0.7) {
    return true;
  }
  return false;
}

/**
 * Tags too generic to count as "found" on their own — real strings these
 * sources actually return, but describing a format/career rather than a
 * sound, and too broad to route into any single genre chat. Stripped out
 * wherever they co-occur with a real genre (keep the useful one); if it's
 * all an artist has, treated as not-found so they stay in the enrichment
 * backlog for a better source instead of permanently settling for this.
 */
const TOO_GENERIC_GENRES = new Set(['singer-songwriter', 'singer songwriter']);

function stripGenericGenres(genres) {
  if (!genres) return null;
  const kept = genres.filter(g => !TOO_GENERIC_GENRES.has(String(g).toLowerCase().trim()));
  return kept.length > 0 ? kept : null;
}

async function getGenresByMbid(mbid) {
  const detail = await musicBrainzRequest(`/artist/${mbid}`, { inc: 'genres', fmt: 'json' });
  const genres = (detail?.genres || []).map(g => g.name).filter(Boolean);
  const filtered = stripGenericGenres(genres);
  return filtered ? filtered.slice(0, 5) : null;
}

/**
 * MusicBrainz's search response already embeds each artist's community tags
 * (no extra request needed) — verified live that count>0 tags on a matched
 * artist are the same set MusicBrainz's own curated `genres` field returns
 * via a separate `inc=genres` lookup (e.g. Tedeschi Trucks Band: tags with
 * count>0 were exactly {blue-eyed soul, blues rock, rock}, identical to its
 * genres). Using tags directly skips a second request per match — halves
 * request volume for the majority case, which matters a lot given how easily
 * MusicBrainz throttles (see module docstring).
 */
function genresFromTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return null;
  const names = [...tags]
    .filter(t => t?.name && (t.count ?? 0) > 0)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .map(t => t.name);
  const filtered = stripGenericGenres(names);
  return filtered ? filtered.slice(0, 5) : null;
}

async function searchMusicBrainzGenres(name) {
  const searchData = await musicBrainzRequest('/artist/', {
    query: `artist:"${name}"`,
    fmt: 'json',
    limit: '5',
  });
  const candidates = searchData?.artists || [];
  const match = candidates.find(a => a?.name && namesMatch(name, a.name) && (a.score ?? 0) >= 80);
  if (!match) return null;
  return genresFromTags(match.tags);
}

async function searchItunesGenre(name) {
  const data = await itunesRequest({ term: name, entity: 'musicArtist', limit: '5' });
  const results = data?.results || [];
  const match = results.find(r => r?.artistName && r?.primaryGenreName && namesMatch(name, r.artistName));
  return match ? stripGenericGenres([match.primaryGenreName]) : null;
}

/**
 * Fetch genres for a single artist. Tries, in order: direct MusicBrainz id
 * (from JamBase external_identifiers) if known, MusicBrainz name search, then
 * iTunes name search. Returns { genres: [], source: 'None' } if nothing is
 * found or the artist genuinely has no genre data on either source.
 * @param {{name: string, external_identifiers?: Array<{source: string, identifier: string[]}>}} artistData
 * @returns {Promise<{genres: string[], source: string}>}
 */
export async function fetchGenresForArtist(artistData) {
  const { name, external_identifiers } = artistData || {};
  if (!name) return { genres: [], source: 'None' };

  try {
    if (!mbCircuitTripped) {
      const mbid = extractMusicBrainzId(external_identifiers);
      if (mbid) {
        const genres = await getGenresByMbid(mbid);
        if (genres) return { genres, source: 'MusicBrainz (id)' };
      }
      if (!mbCircuitTripped) {
        const genres = await searchMusicBrainzGenres(name);
        if (genres) return { genres, source: 'MusicBrainz (search)' };
      }
    }

    if (ITUNES_ENABLED && !itunesCircuitTripped) {
      const genres = await searchItunesGenre(name);
      if (genres) return { genres, source: 'iTunes' };
    }

    return { genres: [], source: 'None' };
  } catch (error) {
    console.warn(`  ⚠️  Genre lookup error for "${name}": ${error.message}`);
    return { genres: [], source: 'None' };
  }
}

/**
 * Check if genres array is empty or invalid
 */
export function isEmptyGenres(genres) {
  if (!genres) return true;
  if (!Array.isArray(genres)) return true;
  if (genres.length === 0) return true;
  // Check if all genres are empty strings or null
  return genres.every(g => !g || (typeof g === 'string' && g.trim() === ''));
}

/**
 * True once every ENABLED source is down — the point no further progress is
 * possible. iTunes counts as "already down" when disabled (GENRE_ENRICH_USE_ITUNES
 * unset), so with iTunes off this correctly reduces to "MusicBrainz tripped".
 */
export function isGenreLookupCircuitTripped() {
  const itunesDown = itunesCircuitTripped || !ITUNES_ENABLED;
  return mbCircuitTripped && itunesDown;
}

/** Human-readable reason(s) whichever source(s) tripped, or null if none have. */
export function getGenreLookupCircuitTripReason() {
  const reasons = [];
  if (mbCircuitTripped) reasons.push(`MusicBrainz: ${mbCircuitTripReason}`);
  if (itunesCircuitTripped) reasons.push(`iTunes: ${itunesCircuitTripReason}`);
  return reasons.length > 0 ? reasons.join('; ') : null;
}

/**
 * Clear both tripped circuit breakers so lookups can resume, e.g. after a
 * caller has waited out a cooldown period. Does not reset the request pacing
 * clocks.
 */
export function resetGenreLookupCircuit() {
  mbCircuitTripped = false;
  mbCircuitTripReason = null;
  itunesCircuitTripped = false;
  itunesCircuitTripReason = null;
}
