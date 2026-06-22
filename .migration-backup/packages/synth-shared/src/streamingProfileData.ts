export type SpotifyTimeRange = 'short_term' | 'medium_term' | 'long_term';

const SPOTIFY_TIME_RANGES: readonly SpotifyTimeRange[] = [
  'short_term',
  'medium_term',
  'long_term',
];

type ByRangeField = 'topArtistsByTimeRange' | 'topTracksByTimeRange';
type FlatField = 'topArtists' | 'topTracks';

export function hasPerRangeData(
  profileData: Record<string, unknown> | null | undefined,
  field: ByRangeField
): boolean {
  const byRange = profileData?.[field];
  if (!byRange || typeof byRange !== 'object') {
    return false;
  }
  const record = byRange as Record<string, unknown>;
  return SPOTIFY_TIME_RANGES.some((key) => Array.isArray(record[key]));
}

/** True when at least one time-range bucket has one or more items. */
export function hasNonEmptyPerRangeData(
  profileData: Record<string, unknown> | null | undefined,
  field: ByRangeField
): boolean {
  const byRange = profileData?.[field];
  if (!byRange || typeof byRange !== 'object') {
    return false;
  }
  const record = byRange as Record<string, unknown>;
  return SPOTIFY_TIME_RANGES.some(
    (key) => Array.isArray(record[key]) && (record[key] as unknown[]).length > 0
  );
}

/** Sum items across all time-range buckets for a field. */
export function countPerRangeItems(
  profileData: Record<string, unknown> | null | undefined,
  field: ByRangeField
): number {
  const byRange = profileData?.[field];
  if (!byRange || typeof byRange !== 'object') {
    return 0;
  }
  const record = byRange as Record<string, unknown>;
  return SPOTIFY_TIME_RANGES.reduce((sum, key) => {
    const list = record[key];
    return sum + (Array.isArray(list) ? list.length : 0);
  }, 0);
}

function hasNonEmptyFlatList(
  profileData: Record<string, unknown> | null | undefined,
  field: FlatField
): boolean {
  const flat = profileData?.[field];
  return Array.isArray(flat) && flat.length > 0;
}

/** Artists have per-range data but tracks do not (empty or missing buckets). */
export function streamingProfileNeedsTrackResync(
  profileData: Record<string, unknown> | null | undefined
): boolean {
  if (!profileData) return false;

  const artistsHaveData =
    hasNonEmptyPerRangeData(profileData, 'topArtistsByTimeRange') ||
    hasNonEmptyFlatList(profileData, 'topArtists');
  if (!artistsHaveData) return false;

  const tracksHaveData =
    hasNonEmptyPerRangeData(profileData, 'topTracksByTimeRange') ||
    hasNonEmptyFlatList(profileData, 'topTracks');

  return !tracksHaveData;
}

function rangeHasArtistData(
  profileData: Record<string, unknown> | null | undefined,
  timeRange: SpotifyTimeRange
): boolean {
  if (!profileData) return false;
  const byRange = profileData.topArtistsByTimeRange;
  if (byRange && typeof byRange === 'object') {
    const list = (byRange as Record<string, unknown>)[timeRange];
    if (Array.isArray(list) && list.length > 0) return true;
  }
  return hasNonEmptyFlatList(profileData, 'topArtists');
}

/**
 * Spotify top artists/tracks for a single time range.
 * Never falls back to the legacy flat merged list when per-range buckets exist for
 * the other entity (e.g. artists have ranges but songs do not → songs need resync).
 */
export function getSpotifyTimeRangeList(
  profileData: Record<string, unknown> | null | undefined,
  timeRange: SpotifyTimeRange,
  byRangeField: ByRangeField,
  flatField: FlatField,
  limit = 20
): { items: unknown[]; needsResync: boolean } {
  if (!profileData) {
    return { items: [], needsResync: false };
  }

  const byRange = profileData[byRangeField];
  if (byRange && typeof byRange === 'object') {
    const rangeList = (byRange as Record<string, unknown>)[timeRange];
    if (Array.isArray(rangeList)) {
      if (rangeList.length > 0) {
        return { items: rangeList.slice(0, limit), needsResync: false };
      }
      // Empty bucket: songs need resync when artists have data for this range or globally.
      if (
        byRangeField === 'topTracksByTimeRange' &&
        (rangeHasArtistData(profileData, timeRange) || streamingProfileNeedsTrackResync(profileData))
      ) {
        return { items: [], needsResync: true };
      }
      return { items: [], needsResync: false };
    }
    return { items: [], needsResync: false };
  }

  // Legacy row: flat merged list saved before per-range track buckets existed.
  if (byRangeField === 'topTracksByTimeRange' && hasPerRangeData(profileData, 'topArtistsByTimeRange')) {
    return { items: [], needsResync: true };
  }

  const flat = profileData[flatField];
  if (Array.isArray(flat)) {
    return {
      items: flat.slice(0, limit),
      needsResync: byRangeField === 'topTracksByTimeRange' && flat.length === 0,
    };
  }

  return { items: [], needsResync: false };
}

export const SPOTIFY_TIME_RANGE_LABELS: Record<SpotifyTimeRange, string> = {
  short_term: '4 Weeks',
  medium_term: '6 Months',
  long_term: 'All Time',
};

export type TopGenreEntry = { genre: string; count: number };

function countGenresFromArtists(artists: unknown[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const artist of artists) {
    if (!artist || typeof artist !== 'object') continue;
    const record = artist as {
      genres?: string[];
      attributes?: { genreNames?: string[] };
    };
    const genres =
      record.genres ??
      (Array.isArray(record.attributes?.genreNames) ? record.attributes.genreNames : []);
    if (!Array.isArray(genres)) continue;
    for (const raw of genres) {
      const genre = String(raw).trim();
      if (genre) counts[genre] = (counts[genre] || 0) + 1;
    }
  }

  return counts;
}

function topGenreEntriesFromCounts(
  counts: Record<string, number>,
  limit = 12
): TopGenreEntry[] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([genre, count]) => ({ genre, count }));
}

/** Aggregate genre tags from a list of artist objects (Spotify/Apple shape). */
export function computeTopGenresFromArtistList(
  artists: unknown[],
  limit = 12
): TopGenreEntry[] {
  return topGenreEntriesFromCounts(countGenresFromArtists(artists), limit);
}

/** Genres for one Spotify time range — same artist bucket as the Artists tab. */
export function computeTopGenresForTimeRange(
  profileData: Record<string, unknown> | null | undefined,
  timeRange: SpotifyTimeRange,
  limit = 12
): TopGenreEntry[] {
  if (!profileData) return [];
  const { items } = getSpotifyTimeRangeList(
    profileData,
    timeRange,
    'topArtistsByTimeRange',
    'topArtists',
    50
  );
  return computeTopGenresFromArtistList(items, limit);
}

/** Aggregate genre tags from all saved artist lists (all time ranges + flat). */
export function computeTopGenresFromArtists(
  profileData: Record<string, unknown> | null | undefined,
  limit = 12
): TopGenreEntry[] {
  if (!profileData) return [];

  const counts: Record<string, number> = {};

  const addArtist = (artist: unknown) => {
    for (const [genre, count] of Object.entries(countGenresFromArtists([artist]))) {
      counts[genre] = (counts[genre] || 0) + count;
    }
  };

  const byRange = profileData.topArtistsByTimeRange;
  if (byRange && typeof byRange === 'object') {
    for (const range of SPOTIFY_TIME_RANGES) {
      const list = (byRange as Record<string, unknown>)[range];
      if (Array.isArray(list)) list.forEach(addArtist);
    }
  }

  const flat = profileData.topArtists;
  if (Array.isArray(flat)) flat.forEach(addArtist);

  return topGenreEntriesFromCounts(counts, limit);
}

function normalizeGenreEntries(
  raw: unknown,
  limit = 12
): TopGenreEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: TopGenreEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const genre = String((item as { genre?: string }).genre ?? '').trim();
    const count = Number((item as { count?: number }).count ?? 0);
    if (genre) entries.push({ genre, count: Number.isFinite(count) ? count : 0 });
  }
  return entries.slice(0, limit);
}

/** Prefer prefs-derived genres, then artist tags, then any prior snapshot. */
export function pickTopGenresSnapshot(
  ...sources: Array<TopGenreEntry[] | null | undefined>
): TopGenreEntry[] {
  for (const src of sources) {
    if (Array.isArray(src) && src.length > 0) return src;
  }
  return [];
}

export function enrichProfileDataWithGenres(
  profileData: Record<string, unknown>,
  options?: {
    prefsGenres?: TopGenreEntry[] | null;
    preserveSnapshot?: TopGenreEntry[] | null;
  }
): Record<string, unknown> {
  const topGenresSnapshot = pickTopGenresSnapshot(
    options?.prefsGenres,
    computeTopGenresFromArtists(profileData),
    options?.preserveSnapshot,
    normalizeGenreEntries(profileData.topGenresSnapshot)
  );
  return { ...profileData, topGenresSnapshot };
}

export function formatTopGenresForDisplay(
  entries: TopGenreEntry[] | undefined,
  limit = 12
): Array<{ name: string; count: number; pct: number }> {
  if (!entries?.length) return [];
  const max = entries[0]?.count || 1;
  return entries.slice(0, limit).map((entry) => ({
    name: entry.genre,
    count: entry.count,
    pct: Math.round((entry.count / max) * 100),
  }));
}
