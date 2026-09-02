/**
 * Fetch genres for an artist from three free sources:
 *   1. MusicBrainz — direct MBID lookup when known (via JamBase's
 *      external_identifiers), else a name search (score >= 80) using tags
 *      embedded in the search response itself.
 *   2. Last.fm `artist.getTopTags` — crowd tags, by far the best coverage of
 *      the small/regional artists that make up most of this backlog, and the
 *      fastest of the three (see LASTFM_MIN_DELAY_MS). Needs a free API key in
 *      LASTFM_API_KEY; skipped entirely when that is unset, so nothing breaks
 *      without it. Tried BEFORE the MusicBrainz name search on purpose — the
 *      name search is the slow leg (3s spacing) and trips MusicBrainz's
 *      throttle constantly, so resolving artists on Last.fm first is what
 *      actually moves throughput.
 *   3. iTunes Search API — single `primaryGenreName` per artist, weaker than
 *      the other two's multi-genre tags but free coverage they don't have.
 *      Tried last. ON BY DEFAULT (set GENRE_ENRICH_USE_ITUNES=0 to disable).
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

const LASTFM_API_BASE = 'https://ws.audioscrobbler.com/2.0/';
// Last.fm's published guidance is "no more than 5 requests per second per
// originating IP, averaged over 5 minutes". 500ms (2/sec) sits well under it
// while still being 6x faster than the MusicBrainz leg.
const LASTFM_MIN_DELAY_MS = 500;
// Only the read methods are used, which take api_key alone. The shared secret
// is for authenticated/write methods (scrobbling, loving tracks) — this module
// never needs it, so it is deliberately not read here.
function lastfmApiKey() {
  // Read lazily, not at module load: callers (enrich-artist-genres.mjs) load
  // .env.local inside main(), which runs AFTER this module's top level.
  return process.env.LASTFM_API_KEY || null;
}

let lastMusicBrainzCallAt = 0;
let mbCircuitTripped = false;
let mbCircuitTripReason = null;

let lastItunesCallAt = 0;
let itunesCircuitTripped = false;
let itunesCircuitTripReason = null;

let lastLastfmCallAt = 0;
let lastfmCircuitTripped = false;
let lastfmCircuitTripReason = null;

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

function tripLastfmCircuit(reason) {
  if (lastfmCircuitTripped) return;
  lastfmCircuitTripped = true;
  lastfmCircuitTripReason = reason;
  console.error(`\n🛑 Last.fm circuit breaker tripped: ${reason}`);
  console.error('🛑 No further Last.fm calls will be made until reset.\n');
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

async function lastfmRequest(params) {
  const apiKey = lastfmApiKey();
  if (!apiKey || lastfmCircuitTripped) return null;
  const wait = lastLastfmCallAt + LASTFM_MIN_DELAY_MS - Date.now();
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  lastLastfmCallAt = Date.now();

  const url = new URL(LASTFM_API_BASE);
  for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('format', 'json');
  const response = await fetch(url, { headers: { 'User-Agent': MUSICBRAINZ_USER_AGENT } });

  if (response.status === 429 || response.status === 503) {
    tripLastfmCircuit(`Last.fm returned ${response.status} (Retry-After: ${response.headers.get('retry-after') || 'unknown'}s)`);
    return null;
  }
  if (!response.ok) return null;

  // Last.fm reports most failures as HTTP 200 with an `error` code in the JSON
  // body, so status alone is not enough. 29 = rate limit exceeded, 26 =
  // suspended API key, 10 = invalid API key — all permanent-until-fixed for
  // this run, so trip the breaker rather than burning the whole backlog on
  // requests that cannot succeed. Everything else (6 = artist not found, 8 =
  // transient operation failure) is just a miss for this one artist.
  const data = await response.json();
  if (data?.error) {
    if (data.error === 29 || data.error === 26 || data.error === 10) {
      tripLastfmCircuit(`Last.fm error ${data.error}: ${data.message || 'unknown'}`);
    }
    return null;
  }
  return data;
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

/**
 * Shared last step for every source: drop the too-generic tags, then collapse
 * case-only duplicates. Last.fm in particular returns the same genre under
 * different casing from different taggers ("Alt-country" and "alt-country"),
 * which would otherwise spend two of the five slots on one genre. Callers sort
 * by weight before calling, so the first spelling seen is the strongest one.
 */
function stripGenericGenres(genres) {
  if (!genres) return null;
  const seen = new Set();
  const kept = [];
  for (const g of genres) {
    const key = String(g).toLowerCase().trim();
    if (!key || TOO_GENERIC_GENRES.has(key) || seen.has(key)) continue;
    seen.add(key);
    kept.push(g);
  }
  return kept.length > 0 ? kept : null;
}

async function getGenresByMbid(mbid) {
  const detail = await musicBrainzRequest(`/artist/${mbid}`, { inc: 'genres', fmt: 'json' });
  const genres = (detail?.genres || []).map(g => g.name).filter(g => g && !isCrowdJunkTag(g));
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
    // MusicBrainz tags are community-submitted too, so they carry the same
    // non-genre noise Last.fm does — a live run returned "youtuber" as the
    // only tag for one artist. Same filter, applied to both crowd sources.
    .filter(t => t?.name && (t.count ?? 0) > 0 && !isCrowdJunkTag(t.name))
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

/**
 * Community-submitted tags — Last.fm's and MusicBrainz's alike — arrive mixed
 * with labels that would otherwise be written straight into artists.genres and
 * then into the user-facing genre chats. The recurring offenders: how someone
 * found the artist, how they feel about them, where the artist is from, what
 * they play, or when they were active — none of which describe a sound.
 *
 * Applied to both crowd-tag sources but deliberately NOT to iTunes, whose
 * `primaryGenreName` comes from a curated taxonomy where several of these
 * strings ("Vocal", "Brazilian", "Indian") are genuine genre labels rather
 * than stray user tags.
 *
 * Decades ("90s", "1980s") and listener-count buckets are matched by pattern
 * below rather than listed here.
 */
const CROWD_JUNK_TAGS = new Set([
  'seen live', 'seenlive', 'favorites', 'favourites', 'favorite', 'favourite',
  'favorite artists', 'favourite artists', 'my favorites', 'my favourites',
  'awesome', 'amazing', 'beautiful', 'love', 'loved', 'love at first listen',
  'sexy', 'cool', 'epic', 'great', 'good', 'best', 'the best', 'perfect',
  'genius', 'legend', 'legends', 'masterpiece', 'fun', 'catchy', 'chill',
  'chillout', 'relax', 'relaxing', 'mellow', 'melancholy', 'sad', 'happy',
  'party', 'summer', 'winter', 'driving', 'workout', 'study', 'sleep',
  'male vocalists', 'female vocalists', 'male vocalist', 'female vocalist',
  'female fronted', 'male fronted', 'female fronted metal', 'band', 'bands',
  'duo', 'trio', 'solo', 'live', 'albums i own', 'want to see live',
  'my music', 'music', 'artist', 'artists', 'radio', 'spotify', 'vinyl', 'mp3',
  'check out', 'to check out', 'discover', 'new', 'new music', 'unsigned',
  'underrated', 'overrated', 'mainstream', 'popular', 'classic', 'oldies',
  'american', 'america', 'usa', 'us', 'british', 'uk', 'england', 'english',
  'scottish', 'irish', 'welsh', 'canadian', 'canada', 'australian', 'australia',
  'german', 'germany', 'deutsch', 'french', 'france', 'italian', 'italy',
  'spanish', 'spain', 'swedish', 'sweden', 'norwegian', 'norway', 'finnish',
  'finland', 'danish', 'denmark', 'dutch', 'netherlands', 'russian', 'russia',
  'japanese', 'japan', 'korean', 'korea', 'chinese', 'china', 'brazilian',
  'brazil', 'mexican', 'mexico', 'polish', 'poland',
  // Nationalities are a closed set and Last.fm leans on them hard for artists
  // with little else tagged — "Czech" came back as a top tag for Yarrdesh on
  // the first real run. NOT listed on purpose: "latin", which is a real genre.
  'czech', 'czech republic', 'slovak', 'slovakia', 'austrian', 'austria',
  'belgian', 'belgium', 'swiss', 'switzerland', 'portuguese', 'portugal',
  'greek', 'greece', 'turkish', 'turkey', 'israeli', 'israel', 'indian',
  'india', 'icelandic', 'iceland', 'hungarian', 'hungary', 'romanian',
  'romania', 'ukrainian', 'ukraine', 'argentinian', 'argentina', 'chilean',
  'chile', 'colombian', 'colombia', 'cuban', 'cuba', 'jamaican', 'jamaica',
  'nigerian', 'nigeria', 'south african', 'south africa', 'new zealand',
  'kiwi', 'scandinavian', 'nordic', 'european', 'europe', 'asian',
  // Instruments and roles — what the artist plays, not what they sound like.
  // Bare "bass" only; compound genres ("drum and bass", "bass house") are
  // distinct strings and match none of these.
  'bass', 'guitar', 'guitarist', 'bassist', 'drums', 'drummer', 'piano',
  'pianist', 'vocals', 'vocal', 'vocalist', 'singer', 'violin', 'violinist',
  'cello', 'saxophone', 'sax', 'trumpet', 'banjo', 'harmonica', 'ukulele',
  'keyboard', 'keys', 'percussion', 'composer', 'producer', 'dj', 'rapper',
  'songwriter', 'multi-instrumentalist', 'instrumental music',
  // Where someone heard them, not what they sound like.
  'youtube', 'youtuber', 'soundcloud', 'bandcamp', 'tiktok', 'tiktoker',
  'instagram', 'twitch', 'influencer', 'internet', 'internet celebrity',
  'myspace', 'last.fm', 'lastfm', 'streaming', 'playlist', 'podcast',
  // NOT listed: "soundtrack", "video game music", "anime" — they read as
  // context rather than sound, but they are real programming categories for a
  // live-music app (touring video-game and anime score shows), and
  // over-filtering costs coverage: an artist whose tags are all stripped reads
  // as not-found and stays in the backlog.
  // US states are a closed set, and Last.fm applies them heavily to regional
  // acts — exactly the artists this backlog is made of ("North Carolina" came
  // back as a top-3 "genre" for Fust on the first live run).
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
  'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho',
  'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine',
  'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi',
  'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey',
  'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio',
  'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina',
  'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia',
  'washington', 'west virginia', 'wisconsin', 'wyoming',
  'washington dc', 'dc', 'midwest', 'the south', 'pacific northwest', 'pnw',
  // ponytail: cities are an open set — the big ones are listed, the long tail
  // gets through. Escalate to a gazetteer lookup only if it shows up as a real
  // problem in the genre chats.
  'nyc', 'chicago', 'seattle', 'london', 'los angeles', 'la', 'nashville',
  'austin', 'portland', 'atlanta', 'detroit', 'boston', 'philadelphia',
  'brooklyn', 'denver', 'minneapolis', 'san francisco', 'new orleans',
]);

// "90s", "1980s", "00s", "2010s" — an era, not a sound. Also Last.fm's
// auto-generated "under N listeners" buckets.
const CROWD_JUNK_PATTERNS = [/^(19|20)?\d0s$/, /^under \d+ listeners$/];

function isCrowdJunkTag(tag) {
  const t = String(tag).toLowerCase().trim();
  if (!t) return true;
  if (CROWD_JUNK_TAGS.has(t)) return true;
  return CROWD_JUNK_PATTERNS.some(re => re.test(t));
}

/**
 * Last.fm normalises tag `count` so the artist's top tag is always 100 and the
 * rest are relative to it — it is NOT a raw vote count. The floor below drops
 * the long tail of one-off tags a single listener applied, which is where most
 * of the noise the denylist doesn't already name lives.
 */
const LASTFM_MIN_TAG_WEIGHT = 15;

function genresFromLastfmTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return null;
  const names = tags
    .filter(t => t?.name && Number(t.count ?? 0) >= LASTFM_MIN_TAG_WEIGHT && !isCrowdJunkTag(t.name))
    .sort((a, b) => Number(b.count ?? 0) - Number(a.count ?? 0))
    .map(t => String(t.name).trim());
  const filtered = stripGenericGenres(names);
  return filtered ? filtered.slice(0, 5) : null;
}

/**
 * Last.fm top tags for one artist. Uses the MusicBrainz id when JamBase gave
 * us one (exact, no name ambiguity); otherwise queries by name with
 * autocorrect and verifies the artist Last.fm actually answered for is the one
 * asked about — autocorrect will happily redirect a name it half-recognises to
 * a completely different artist, which would silently write the wrong genres.
 */
async function searchLastfmGenres(name, mbid) {
  const params = mbid
    ? { method: 'artist.gettoptags', mbid }
    : { method: 'artist.gettoptags', artist: name, autocorrect: '1' };
  const data = await lastfmRequest(params);
  const resolvedName = data?.toptags?.['@attr']?.artist;
  if (!mbid && resolvedName && !namesMatch(name, resolvedName)) return null;

  // Single-tag responses come back as an object, not an array.
  const rawTags = data?.toptags?.tag;
  const tags = Array.isArray(rawTags) ? rawTags : rawTags ? [rawTags] : [];
  return genresFromLastfmTags(tags);
}

async function searchItunesGenre(name) {
  const data = await itunesRequest({ term: name, entity: 'musicArtist', limit: '5' });
  const results = data?.results || [];
  const match = results.find(r => r?.artistName && r?.primaryGenreName && namesMatch(name, r.artistName));
  return match ? stripGenericGenres([match.primaryGenreName]) : null;
}

/**
 * Fetch genres for a single artist. Tries, in order: direct MusicBrainz id
 * (from JamBase external_identifiers) if known, Last.fm top tags (skipped
 * without LASTFM_API_KEY), MusicBrainz name search, then iTunes name search.
 * Returns { genres: [], source: 'None' } if nothing is found or the artist
 * genuinely has no genre data on any source.
 * @param {{name: string, external_identifiers?: Array<{source: string, identifier: string[]}>}} artistData
 * @returns {Promise<{genres: string[], source: string}>}
 */
export async function fetchGenresForArtist(artistData) {
  const { name, external_identifiers } = artistData || {};
  if (!name) return { genres: [], source: 'None' };
  const mbid = extractMusicBrainzId(external_identifiers);

  try {
    if (!mbCircuitTripped && mbid) {
      const genres = await getGenresByMbid(mbid);
      if (genres) return { genres, source: 'MusicBrainz (id)' };
    }

    if (lastfmApiKey() && !lastfmCircuitTripped) {
      const genres = await searchLastfmGenres(name, mbid);
      if (genres) return { genres, source: mbid ? 'Last.fm (id)' : 'Last.fm' };
    }

    if (!mbCircuitTripped) {
      const genres = await searchMusicBrainzGenres(name);
      if (genres) return { genres, source: 'MusicBrainz (search)' };
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
 * possible. A source that is switched off counts as "already down": iTunes
 * when GENRE_ENRICH_USE_ITUNES=0, Last.fm when LASTFM_API_KEY is unset. So
 * with both off this correctly reduces to "MusicBrainz tripped".
 */
export function isGenreLookupCircuitTripped() {
  const itunesDown = itunesCircuitTripped || !ITUNES_ENABLED;
  const lastfmDown = lastfmCircuitTripped || !lastfmApiKey();
  return mbCircuitTripped && lastfmDown && itunesDown;
}

/** Human-readable reason(s) whichever source(s) tripped, or null if none have. */
export function getGenreLookupCircuitTripReason() {
  const reasons = [];
  if (mbCircuitTripped) reasons.push(`MusicBrainz: ${mbCircuitTripReason}`);
  if (lastfmCircuitTripped) reasons.push(`Last.fm: ${lastfmCircuitTripReason}`);
  if (itunesCircuitTripped) reasons.push(`iTunes: ${itunesCircuitTripReason}`);
  return reasons.length > 0 ? reasons.join('; ') : null;
}

/**
 * Clear every tripped circuit breaker so lookups can resume, e.g. after a
 * caller has waited out a cooldown period. Does not reset the request pacing
 * clocks.
 */
export function resetGenreLookupCircuit() {
  mbCircuitTripped = false;
  mbCircuitTripReason = null;
  itunesCircuitTripped = false;
  itunesCircuitTripReason = null;
  lastfmCircuitTripped = false;
  lastfmCircuitTripReason = null;
}

// Run directly to verify the tag filter and, with a name argument, to smoke-test
// a live lookup against the configured keys:
//   node scripts/fetch-artist-genres.mjs
//   node scripts/fetch-artist-genres.mjs "Turnstile"
// (pathToFileURL, not string-building a file:// URL — Windows paths differ in
// both slash direction and the drive-letter authority, so a hand-built URL
// never matches and the check silently no-ops.)
const { pathToFileURL } = await import('url');
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const assert = (await import('assert')).default;

  // The whole point of the Last.fm leg: keep sounds, drop everything else.
  assert.deepStrictEqual(
    genresFromLastfmTags([
      { name: 'seen live', count: 100 },
      { name: 'hardcore punk', count: 92 },
      { name: 'american', count: 61 },
      { name: '2010s', count: 44 },
      { name: 'post-hardcore', count: 30 },
      { name: 'under 2000 listeners', count: 25 },
      { name: 'noise', count: 3 },
    ]),
    ['hardcore punk', 'post-hardcore']
  );
  // Regional tags are the other big class of noise on small artists, and
  // case-only duplicates must not eat a second slot.
  assert.deepStrictEqual(
    genresFromLastfmTags([
      { name: 'Alt-country', count: 100 },
      { name: 'North Carolina', count: 80 },
      { name: 'alt-country', count: 55 },
      { name: 'americana', count: 40 },
    ]),
    ['Alt-country', 'americana']
  );
  // Real junk seen in the first production run: a nationality, an instrument,
  // and the platform someone found the artist on, all outranking the genre.
  assert.deepStrictEqual(
    genresFromLastfmTags([
      { name: 'Czech', count: 100 },
      { name: 'noisecore', count: 70 },
    ]),
    ['noisecore']
  );
  assert.deepStrictEqual(
    genresFromLastfmTags([
      { name: 'bass', count: 100 },
      { name: 'youtube', count: 90 },
      { name: 'drum and bass', count: 50 },
    ]),
    ['drum and bass']
  );
  // Nothing but junk must read as not-found, so the artist stays in the
  // backlog for a better source instead of being written off with bad data.
  assert.strictEqual(genresFromLastfmTags([{ name: 'seen live', count: 100 }]), null);
  assert.strictEqual(genresFromLastfmTags([]), null);
  console.log('✅ Last.fm tag filter checks passed.');

  const name = process.argv[2];
  if (name) {
    try {
      const dotenv = await import('dotenv');
      dotenv.default.config({ path: '.env.local' });
    } catch {
      // dotenv not installed — assume env vars are already set
    }
    console.log(`LASTFM_API_KEY: ${lastfmApiKey() ? 'set' : 'MISSING (Last.fm will be skipped)'}`);
    console.log(await fetchGenresForArtist({ name }));
  }
}
