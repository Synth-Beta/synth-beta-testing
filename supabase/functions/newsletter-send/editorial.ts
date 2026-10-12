/** Hand-edited evergreen picks. Album sources establish the recording, not a current release. */
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
    genres: ["funk", "soul", "psychedelic", "indie"],
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
].map((pick) => ({
  ...pick,
  url: `https://open.spotify.com/search/${encodeURIComponent(`${pick.artistName} ${pick.trackName}`)}`,
  evergreen: true,
}));

/** Weekly rotation is shared by the whole edition; no pretend personalization for empty accounts. */
export const editorialListens = (editionDate: string, genres: string[] = []) => {
  const week = Math.floor(Date.parse(`${editionDate}T12:00:00Z`) / (7 * 86400000));
  const start = Number.isFinite(week) ? ((week % EDITORIAL_LISTENS.length) + EDITORIAL_LISTENS.length) % EDITORIAL_LISTENS.length : 0;
  const rotated = [...EDITORIAL_LISTENS.slice(start), ...EDITORIAL_LISTENS.slice(0, start)];
  const normalized = genres.map((genre) => genre.trim().toLowerCase());
  return rotated.sort((a, b) =>
    Number(b.genres.some((genre) => normalized.some((known) => known.includes(genre))))
    - Number(a.genres.some((genre) => normalized.some((known) => known.includes(genre))))
  );
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
