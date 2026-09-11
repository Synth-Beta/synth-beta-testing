/**
 * Apple Music API items -> streaming_profiles payload.
 *
 * Apple has no "top items" endpoint and no play counts, so artists are ranked by how often
 * they show up in heavy rotation, recently played tracks and the library. Library *artist*
 * resources carry no genreNames, so genres come from the songs/albums instead.
 * Output matches the Spotify shape (artists { name, genres }, tracks { name, artists[],
 * album.images[] }) so the stats screens and the DB signal triggers need no Apple branch.
 */

type AppleMusicItem = {
  id?: string;
  attributes?: {
    name?: string;
    artistName?: string;
    albumName?: string;
    genreNames?: string[];
    artwork?: { url?: string };
  };
};

export type AppleMusicProfileArtist = { name: string; genres: string[] };

export type AppleMusicProfileTrack = {
  id?: string;
  name: string;
  artists: Array<{ name: string }>;
  album: { name?: string; images: Array<{ url: string }> };
};

// Apple tags nearly everything "Music" — it carries no taste signal.
const GENERIC_GENRES = new Set(['Music']);

export function buildAppleMusicProfile(
  input: {
    heavyRotation: AppleMusicItem[];
    recentlyPlayed: AppleMusicItem[];
    library: AppleMusicItem[];
  },
  limit = 50
): { topArtists: AppleMusicProfileArtist[]; topTracks: AppleMusicProfileTrack[] } {
  const artists = new Map<string, { name: string; score: number; genres: Map<string, number> }>();

  const addArtists = (items: AppleMusicItem[], weight: number) => {
    for (const item of items) {
      const name = item?.attributes?.artistName?.trim();
      if (!name) continue; // heavy-rotation playlists/stations have no artist
      const key = name.toLowerCase();
      const entry = artists.get(key) ?? { name, score: 0, genres: new Map<string, number>() };
      entry.score += weight;
      for (const genre of item.attributes?.genreNames ?? []) {
        if (!GENERIC_GENRES.has(genre)) entry.genres.set(genre, (entry.genres.get(genre) ?? 0) + 1);
      }
      artists.set(key, entry);
    }
  };
  addArtists(input.heavyRotation, 5);
  addArtists(input.recentlyPlayed, 3);
  addArtists(input.library, 1);

  const topArtists = [...artists.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((a) => ({
      name: a.name,
      genres: [...a.genres.entries()].sort((x, y) => y[1] - x[1]).map(([genre]) => genre),
    }));

  // Recent plays use catalog ids and library songs use library ids ("i.…"), so the same
  // song has two ids — dedupe on name + artist instead.
  const seen = new Set<string>();
  const topTracks: AppleMusicProfileTrack[] = [];
  for (const song of [...input.recentlyPlayed, ...input.library]) {
    const attrs = song?.attributes;
    if (!attrs?.name) continue;
    const key = `${attrs.name}|${attrs.artistName ?? ''}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const artwork = attrs.artwork?.url?.replace('{w}', '300').replace('{h}', '300');
    topTracks.push({
      id: song.id,
      name: attrs.name,
      artists: [{ name: attrs.artistName ?? '' }],
      album: { name: attrs.albumName, images: artwork ? [{ url: artwork }] : [] },
    });
    if (topTracks.length >= limit) break;
  }

  return { topArtists, topTracks };
}
