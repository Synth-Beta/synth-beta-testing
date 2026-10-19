/** Hand-edited discovery picks. Album sources establish the recording, not a current release. */
export interface EditorialListen {
  artistName: string;
  trackName: string;
  url: string;
  sourceUrl: string;
  albumName: string;
  reason: string;
  genres: string[];
  evergreen: boolean;
}

export const EDITORIAL_LISTENS: EditorialListen[] = [
  {
    albumName: "Mordechai", artistName: "Khruangbin", trackName: "Time (You and I)",
    sourceUrl: "https://khruangbin.bandcamp.com/album/mordechai",
    reason: "Start with the bass line, then let the guitar take you somewhere else. A relaxed groove for the walk to your next show.",
    genres: ["funk", "soul", "psychedelic", "indie", "jam"],
  },
  {
    albumName: "Sound & Color", artistName: "Alabama Shakes", trackName: "Don't Wanna Fight",
    sourceUrl: "https://alabamashakes.bandcamp.com/album/sound-color",
    reason: "Brittany Howard's voice meets a taut guitar groove. Play this when you want the room to feel a little bigger.",
    genres: ["rock", "blues", "soul", "alternative"],
  },
  {
    albumName: "Collapsed in Sunbeams", artistName: "Arlo Parks", trackName: "Hope",
    sourceUrl: "https://arloparks.bandcamp.com/album/collapsed-in-sunbeams",
    reason: "A gentle vocal and an unhurried beat, with a chorus that makes room for someone having a hard day. Save it for the ride home.",
    genres: ["indie", "pop", "r&b", "alternative"],
  },
  {
    albumName: "Speaking in Tongues", artistName: "Talking Heads", trackName: "This Must Be the Place (Naive Melody)",
    sourceUrl: "https://en.wikipedia.org/wiki/This_Must_Be_the_Place_(Naive_Melody)",
    reason: "A small repeating melody becomes a song about finding home. Listen once for the rhythm, once for what David Byrne does with it.",
    genres: ["new wave", "rock", "pop", "post-punk"],
  },
  {
    albumName: "Let it Rattle", artistName: "Hiss Golden Messenger", trackName: "Saturday's Song",
    sourceUrl: "https://hissgoldenmessenger.bandcamp.com/album/poor-moon",
    reason: "A warm, road-worn groove with a melody that settles in after one chorus. Good for the drive between cities.",
    genres: ["folk", "americana", "rock", "indie"],
  },
  {
    albumName: "Crush", artistName: "Floating Points", trackName: "LesAlpx",
    sourceUrl: "https://floatingpoints.bandcamp.com/album/crush",
    reason: "A patient electronic build that keeps the drums human. Put this on when you want the night to stretch.",
    genres: ["electronic", "dance", "experimental", "ambient"],
  },
  {
    albumName: "Expanding Light", artistName: "Circles Around the Sun", trackName: "Money's No Thing",
    sourceUrl: "https://circlesaroundthesun.bandcamp.com/",
    reason: "Guitar lines that wander without losing the pocket. Built for long sets and longer walks.",
    genres: ["jam", "rock", "psychedelic", "funk"],
  },
  {
    albumName: "Elevate", artistName: "Lettuce", trackName: "Trapezoid",
    sourceUrl: "https://lettucefunk.bandcamp.com/",
    reason: "Tight horns over a deep funk pocket. Turn it up if you want the room to move before doors.",
    genres: ["funk", "jam", "soul", "jazz"],
  },
  {
    albumName: "The Crystal Ark", artistName: "Medeski Martin & Wood", trackName: "Chubb Sub",
    sourceUrl: "https://www.medeskimartinandwood.com/",
    reason: "Organ, bass, and drums locked in a hypnotic loop. A live-band energy that never needs a singer.",
    genres: ["jazz", "jam", "funk", "experimental"],
  },
  {
    albumName: "Yankee Hotel Foxtrot", artistName: "Wilco", trackName: "Heavy Metal Drummer",
    sourceUrl: "https://wilcoworld.net/",
    reason: "A bright guitar line that still sounds a little haunted. Easy to put on between heavier listens.",
    genres: ["rock", "indie", "alternative", "americana"],
  },
].map((pick) => ({
  ...pick,
  url: `https://open.spotify.com/search/${encodeURIComponent(`${pick.artistName} ${pick.trackName}`)}`,
  evergreen: true,
}));

/** Map logged or streamed artists onto taste genres when preferences are thin. */
const ARTIST_TASTE_GENRES: Record<string, string[]> = {
  goose: ["jam", "rock"],
  phish: ["jam", "rock"],
  "dead & company": ["jam", "rock"],
  "grateful dead": ["jam", "rock"],
  "billy strings": ["jam", "bluegrass", "americana"],
  "widespread panic": ["jam", "rock"],
  "string cheese incident": ["jam", "electronic"],
  "umphrey's mcgee": ["jam", "rock"],
  lettuce: ["funk", "jam"],
  "circles around the sun": ["jam", "rock"],
  khruangbin: ["funk", "psychedelic", "indie"],
  wilco: ["rock", "indie", "americana"],
  "jason isbell": ["americana", "rock", "folk"],
  "my morning jacket": ["rock", "jam", "psychedelic"],
  jungle: ["electronic", "funk", "dance"],
  "sylvan esso": ["electronic", "indie", "pop"],
  "arlo parks": ["indie", "pop", "r&b"],
  "alabama shakes": ["rock", "soul", "blues"],
  muse: ["rock", "alternative"],
  "talking heads": ["rock", "new wave"],
};

/** Terms that make a news story relevant to a taste genre. */
const GENRE_STORY_TERMS: Record<string, string[]> = {
  jam: [
    "jam band", "jamband", "improvis", "goose", "phish", "dead & company", "grateful dead",
    "billy strings", "widespread panic", "string cheese", "umphrey", "moe.", "disco biscuits",
    "circles around the sun", "lettuce", "my morning jacket", "twiddle", "lotus",
  ],
  rock: ["rock band", "guitar", "arena rock", "indie rock", "alt-rock", "alternative rock"],
  indie: ["indie", "independent label", "diy scene"],
  pop: ["pop star", "chart", "top 40", "pop single"],
  electronic: ["electronic", "edm", "techno", "house music", "dance music", "dj set"],
  funk: ["funk", "groove", "horn section"],
  soul: ["soul", "r&b", "motown"],
  "r&b": ["r&b", "rnb", "soul"],
  jazz: ["jazz", "improvis"],
  folk: ["folk", "singer-songwriter", "acoustic"],
  americana: ["americana", "roots music", "alt-country", "country-rock"],
  blues: ["blues"],
  psychedelic: ["psychedelic", "psych-rock"],
  alternative: ["alternative", "alt-rock"],
  dance: ["dance music", "club track", "dj"],
  ambient: ["ambient"],
  experimental: ["experimental"],
  bluegrass: ["bluegrass", "banjo"],
  "new wave": ["new wave"],
  "post-punk": ["post-punk", "post punk"],
};

const normalizeGenre = (value: string) => value.trim().toLowerCase().replace(/[_-]+/g, " ");

const termInText = (text: string, term: string) => {
  const cleaned = term.trim().toLowerCase();
  if (cleaned.length < 3) return false;
  const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(text);
};

const hashSeed = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const rotate = <T>(items: T[], offset: number) => {
  if (!items.length) return items;
  const start = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
};

/** Expand saved genres with genres inferred from artists the reader already knows. */
export const inferTasteGenres = (input: {
  genres?: string[];
  topArtists?: string[];
  reviews?: Array<{ artistName?: string | null }>;
}) => {
  const found = new Set<string>();
  for (const genre of input.genres ?? []) {
    const normalized = normalizeGenre(genre);
    if (normalized) found.add(normalized);
  }
  const artists = [
    ...(input.topArtists ?? []),
    ...(input.reviews ?? []).map((review) => review.artistName ?? ""),
  ];
  for (const artist of artists) {
    const key = String(artist).trim().toLowerCase();
    if (!key) continue;
    const mapped = ARTIST_TASTE_GENRES[key];
    if (mapped) {
      mapped.forEach((genre) => found.add(genre));
      continue;
    }
    for (const [name, genres] of Object.entries(ARTIST_TASTE_GENRES)) {
      if (key === name) genres.forEach((genre) => found.add(genre));
    }
  }
  return [...found];
};

/** Higher means the story fits the reader's taste genres. */
export const storyTasteScore = (
  item: { title: string; summary?: string | null },
  tasteGenres: string[],
) => {
  if (!tasteGenres.length) return 0;
  const text = `${item.title} ${item.summary ?? ""}`;
  let score = 0;
  for (const genre of tasteGenres) {
    const terms = GENRE_STORY_TERMS[genre] ?? [genre];
    for (const term of terms) {
      if (!termInText(text, term)) continue;
      score += term.includes(" ") || term.length > 8 ? 3 : 2;
    }
  }
  return score;
};

/**
 * Rank discovery listens for a reader.
 * Taste matches come first; empty-taste readers share the weekly rotation.
 * A seed (usually user id) keeps two jam fans from always getting the same pair.
 */
export const editorialListens = (editionDate: string, genres: string[] = [], seed = "") => {
  const week = Math.floor(Date.parse(`${editionDate}T12:00:00Z`) / (7 * 86400000));
  const weekOffset = Number.isFinite(week) ? week : 0;
  const normalized = genres.map(normalizeGenre).filter(Boolean);
  const scored = EDITORIAL_LISTENS.map((pick) => ({
    pick,
    score: pick.genres.reduce((total, genre) => {
      const pickGenre = normalizeGenre(genre);
      return total + (normalized.some((known) => known === pickGenre || known.includes(pickGenre) || pickGenre.includes(known)) ? 1 : 0);
    }, 0),
  }));
  const matched = scored.filter((item) => item.score > 0).sort((left, right) => right.score - left.score || left.pick.artistName.localeCompare(right.pick.artistName));
  if (matched.length) {
    const ordered = matched.map((item) => item.pick);
    return rotate(ordered, hashSeed(`${seed}:${editionDate}`));
  }
  return rotate(EDITORIAL_LISTENS, weekOffset);
};

/** Search across meaningful history, rather than just the last two concerts. */
export const historyArtists = (reviews: Array<{ artistName?: string; artists?: { name?: string }; rating?: number; review_text?: string }>) => {
  const scores = new Map<string, { name: string; score: number }>();
  for (const review of reviews) {
    const name = String(review.artistName ?? review.artists?.name ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const score = Number(review.rating ?? 0) * 2 + (String(review.review_text ?? "").length >= 40 ? 2 : 0);
    const prior = scores.get(key);
    scores.set(key, { name, score: Math.max(prior?.score ?? 0, score) + (prior ? 1 : 0) });
  }
  return [...scores.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 8).map((artist) => artist.name);
};
