/**
 * Maps the 12 genre-chat IDs (see GENRE_CONFIGS in web/mobile genreChatService.ts)
 * to the real, raw JamBase event tag strings that should count as a match.
 *
 * Why this exists instead of using the genre_parent/genre_paths taxonomy: that
 * system is a genre-similarity graph (fed by genre_similarity_edges /
 * genre_cooccurrence_pairs), not a hierarchy — a single genre can have a dozen+
 * materialized paths through unrelated roots (e.g. "Big Room" has paths through
 * r&b, ambient, pop, punk, folk, and metal simultaneously), and ~69% of all
 * mapped genres route through "Pop" simply because it's the most densely
 * connected hub in the similarity network, not because they're pop music.
 * Walking that graph to answer "which events are hip-hop" is unreliable (the
 * single most common hip-hop tag, "hip-hop-rap" at 16k+ events, has zero path
 * through the "hip-hop" root at all).
 *
 * This list is instead built directly from the real distinct values in
 * events.genres (every tag with 50+ events, pulled 2026-08-06), matched to
 * chat scope using the chats' own stated descriptions (e.g. "country" chat is
 * "Country & Folk", "jazz" is "Jazz & Blues", "metal" is "Metal & Punk", "rnb"
 * is "R&B & Soul", "reggae" is "Reggae & Ska", "indie" is "Indie & Alternative").
 * Nationality/language/decade/meta tags ("USA", "80s", "small artist", "tribute",
 * "compilation", instrument-only tags like "guitar") are deliberately excluded —
 * they aren't genres and don't belong under any umbrella. "singer-songwriter" is
 * excluded for the same reason (2026-08-14) — a performance format, not a sound,
 * and too generic a catch-all to belong under any single chat's umbrella.
 */

const GENRE_CHAT_TAG_MAP_BASE: Record<string, string[]> = {
  // Pruned 2026-08-19: 'dance-pop'/'europop' (mainstream pop, already under
  // `pop`), 'disco'/'Disco'/'nu disco'/'post-disco'/'italo disco' (live/cover
  // bands keep surfacing here off a loose disco tag; disco stays represented
  // under `rnb`), 'downtempo'/'space music' (ambient, not club/dance music),
  // and 'lo-fi'/'lo-fi beats'/'lo-fi indie' ('lo-fi indie' already under
  // `indie`) were all removed after live data showed them matching clearly
  // non-EDM acts (e.g. a rock orchestra via "downtempo", a funk cover band via
  // "post-disco") into the EDM chat's upcoming-shows list.
  edm: [
    'edm', 'electronic', 'Electronic', 'electronica', 'dance',
    'techno', 'house', 'House', 'deep house', 'tech house', 'afro house',
    'organic house', 'melodic house', 'latin house', 'acid house', 'hard house',
    'tribal house', 'jazz house', 'eurodance', 'trance', 'drum and bass',
    'Drum and bass', 'dubstep', 'breakbeat', 'uk garage', 'jungle', 'footwork',
    'idm', 'glitch', 'trip-hop', 'chillwave', 'vaporwave',
    'synthwave', 'electroclash', 'ebm', 'industrial', 'darkwave', 'cold wave',
    'liquid funk', 'bass music', 'hypertechno',
    'electro swing', 'italo dance', 'dub',
  ],
  'jam-bands': ['jamband', 'jam band', 'livetronica', 'jamgrass'],
  rock: [
    'rock', 'classic rock', 'classic-rock', 'indie-rock', 'indie rock',
    'alternative rock', 'hard rock', 'pop rock', 'blues-rock', 'blues rock',
    'prog-rock', 'progressive rock', 'Progressive rock', 'soft rock',
    'psychedelic rock', 'Psychedelic Rock', 'folk rock', 'rockabilly',
    'art rock', 'new wave', 'rock and roll', 'grunge', 'Grunge', 'post-rock',
    'punk rock', 'noise rock', 'southern rock', 'glam rock', 'stoner rock',
    'surf rock', 'math rock', 'post-grunge', 'britpop', 'space rock',
    'gothic rock', 'garage rock', 'Garage Rock', 'country rock', 'yacht rock',
    'roots rock', 'arena rock', 'heartland rock', 'krautrock', 'proto-punk',
    'funk rock', 'reggae rock', 'aor', 'acid rock', 'psychobilly',
    'anatolian rock', 'indorock', 'madchester', 'power pop', 'jangle pop',
    'psychedelic pop', 'psychedelic', 'neo-psychedelic', 'honky tonk',
  ],
  'hip-hop': [
    // 'hip-hop/rap' is a separate upstream spelling (34 upcoming events) that no
    // amount of case-folding reaches — the separator differs, not the case.
    'hip-hop-rap', 'hip-hop/rap', 'hip hop', 'Hip-Hop', 'rap', 'cloud rap', 'boom bap',
    'french rap', 'k-rap', 'underground hip hop', 'west coast hip hop',
    'lo-fi hip hop', 'hardcore hip hop', 'christian hip hop', 'trip-hop',
    'rap metal',
  ],
  indie: [
    'indie', 'indie-rock', 'indie rock', 'indie pop', 'alternative',
    'alternative rock', 'alternative pop', 'alternative metal',
    'alternative/indie rock', 'dream pop', 'indie folk', 'shoegaze',
    'lo-fi indie', 'bedroom pop', 'art pop', 'midwest emo', 'emo', 'screamo',
    'post-hardcore', 'britpop', 'chillwave', 'slowcore', 'noise rock',
    'hyperpop',
  ],
  jazz: [
    'jazz', 'blues', 'Blues', 'blues-rock', 'blues rock', 'jazz funk',
    'jazz fusion', 'smooth jazz', 'nu jazz', 'vocal jazz', 'free jazz',
    'experimental jazz', 'ambient jazz', 'jazz house', 'jazz ballads',
    'acid jazz', 'swing music', 'big band', 'lounge', 'modern blues',
    'classic blues', 'soul blues', 'christian jazz',
  ],
  metal: [
    'metal', 'punk', 'heavy metal', 'black metal', 'death metal', 'deathcore',
    'thrash metal', 'nu metal', 'sludge metal', 'stoner metal',
    'progressive metal', 'speed metal', 'doom metal', 'metalcore',
    'industrial metal', 'symphonic metal', 'power metal', 'groove metal',
    'medieval metal', 'glam metal', 'djent', 'mathcore', 'grindcore',
    'post-punk', 'hardcore', 'hardcore punk', 'post-hardcore', 'pop punk',
    'ska punk', 'skate punk', 'folk punk', 'egg punk', 'queercore',
    'crust', 'crust-grind', 'deathrock', 'gothic rock', 'riot grrrl',
    'rap metal',
  ],
  pop: [
    'pop', 'pop rock', 'indie pop', 'kpop', 'k-pop', 'k-indie', 'j-pop',
    'p-pop', 'synthpop', 'electropop', 'dansk pop', 'norwegian pop',
    'swedish pop', 'french pop', 'dance-pop', 'europop', 'bedroom pop',
    'art pop', 'baroque pop', 'jangle pop', 'britpop', 'power pop',
    'psychedelic pop', 'folk pop', 'christian pop', 'turkish pop',
  ],
  rnb: [
    'rhythm-and-blues-soul', 'rnb', 'r&b', 'soul', 'funk', 'motown', 'disco',
    'Disco', 'quiet storm', 'northern soul', 'classic soul', 'retro soul',
    'pop soul', 'gospel', 'traditional gospel', 'southern gospel',
    'christian r&b', 'latin r&b', 'french r&b', 'new jack swing', 'doo-wop',
    'funk rock', 'jazz funk', 'hymns', 'worship',
  ],
  country: [
    'country-music', 'country', 'Country', 'americana', 'bluegrass',
    'newgrass', 'jamgrass', 'folk', 'Folk',
    'alt country', 'outlaw country', 'traditional country', 'classic country',
    'red dirt', 'texas country', 'country rock', 'country christian',
    'christian bluegrass', 'christian folk', 'cajun', 'zydeco', 'celtic',
    'traditional folk', 'folk rock', 'folk punk', 'indie folk',
  ],
  classical: [
    'classical', 'Classical', 'classical crossover', 'classical piano',
    'contemporary classical', 'neoclassical', 'orchestral', 'chamber music',
    'baroque', 'opera', 'concerto', 'choral', 'gregorian chant', 'minimalism',
    'medieval', 'ragtime',
  ],
  reggae: ['reggae', 'ska', 'ska punk', 'rocksteady', 'roots reggae', 'dub', 'calypso', 'ragga'],
  // Added 2026-08-20. 'latin' alone carries 1,182 upcoming events and was the
  // single largest unserved tag — 359 of those events were reachable by no
  // chat whatsoever. Sub-genres below were all confirmed present in live data.
  latin: [
    'latin', 'latin pop', 'latin rock', 'latin jazz', 'latin r&b', 'latino',
    'reggaeton', 'neoperreo', 'salsa', 'cumbia', 'bachata', 'merengue',
    'mariachi', 'banda', 'norteno', 'norteño', 'corridos', 'ranchera',
    'regional mexican', 'tango', 'flamenco', 'bossa nova', 'samba',
    'bolero', 'vallenato', 'tropical', 'musica mexicana',
  ],
};

/**
 * events.genres is written from several upstream APIs with no shared casing
 * convention, so the same genre arrives as "pop", "Pop", and occasionally
 * "POP". `.overlaps()` is a Postgres array operator and is case-SENSITIVE, so
 * every variant has to be listed explicitly or the events silently fall through
 * to no chat at all.
 *
 * Hand-listing them was the old approach and it drifted: a live audit on
 * 2026-08-20 found 'Rock' (52 events), 'Alternative' (48), 'Pop' (35) and
 * 'Hip-Hop/Rap' (34) among the top orphan tags — reachable by nothing, purely
 * because of capitalisation. Generating the variants removes that whole class
 * of bug instead of patching it one tag at a time.
 *
 * Separator variants (e.g. "Hip-Hop/Rap" vs "hip-hop-rap") are NOT derivable
 * and remain listed explicitly in the base map above.
 */
function expandCaseVariants(tags: string[]): string[] {
  const out = new Set<string>();
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    out.add(tag);
    out.add(lower);
    // Title Case every word, hyphen- and slash-aware: "hip-hop-rap" -> "Hip-Hop-Rap"
    out.add(lower.replace(/(^|[^a-z0-9])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase()));
    // Sentence case: "alternative rock" -> "Alternative rock"
    out.add(lower.charAt(0).toUpperCase() + lower.slice(1));
    // Short tags are usually acronyms in the wild: edm -> EDM, idm -> IDM
    if (lower.length <= 4) out.add(lower.toUpperCase());
  }
  return [...out];
}

export const GENRE_CHAT_TAG_MAP: Record<string, string[]> = Object.fromEntries(
  Object.entries(GENRE_CHAT_TAG_MAP_BASE).map(([chatId, tags]) => [chatId, expandCaseVariants(tags)])
);
