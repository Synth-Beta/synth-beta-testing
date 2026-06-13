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
      return { items: rangeList.slice(0, limit), needsResync: false };
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
      needsResync: byRangeField === 'topTracksByTimeRange',
    };
  }

  return { items: [], needsResync: false };
}

export const SPOTIFY_TIME_RANGE_LABELS: Record<SpotifyTimeRange, string> = {
  short_term: '4 Weeks',
  medium_term: '6 Months',
  long_term: 'All Time',
};
