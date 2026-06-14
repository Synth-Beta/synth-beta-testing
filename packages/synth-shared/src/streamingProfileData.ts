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
