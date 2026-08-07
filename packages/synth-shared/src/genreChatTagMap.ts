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
 * they aren't genres and don't belong under any umbrella.
 */

export const GENRE_CHAT_TAG_MAP: Record<string, string[]> = {
  edm: [
    'edm', 'electronic', 'Electronic', 'electronica', 'dance', 'dance-pop',
    'techno', 'house', 'House', 'deep house', 'tech house', 'afro house',
    'organic house', 'melodic house', 'latin house', 'acid house', 'hard house',
    'tribal house', 'jazz house', 'nu disco', 'disco', 'Disco', 'post-disco',
    'italo disco', 'eurodance', 'europop', 'trance', 'drum and bass',
    'Drum and bass', 'dubstep', 'breakbeat', 'uk garage', 'jungle', 'footwork',
    'idm', 'glitch', 'downtempo', 'trip-hop', 'chillwave', 'vaporwave',
    'synthwave', 'electroclash', 'ebm', 'industrial', 'darkwave', 'cold wave',
    'liquid funk', 'bass music', 'hypertechno', 'livetronica', 'jamgrass',
    'lo-fi', 'lo-fi beats', 'lo-fi indie', 'electro swing', 'italo dance',
    'space music', 'dub',
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
    'hip-hop-rap', 'hip hop', 'Hip-Hop', 'rap', 'cloud rap', 'boom bap',
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
    'newgrass', 'jamgrass', 'folk', 'Folk', 'singer-songwriter',
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
};
