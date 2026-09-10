import type { SynthSupabaseClient } from './supabaseClientType';

/**
 * Artist-level affinity boost, shared by web and Expo.
 *
 * get_personalized_feed_v5 ranks on `artist_preference_scores` (artists you have a
 * preference SIGNAL for) and `genre_preference_scores`. Two kinds of "artists you
 * actually listen to" never reach either map:
 *
 *   - Streaming top artists are stored as NAMES inside streaming_profiles.profile_data.
 *     They only become artist signals if the name was matched to an artists row, and the
 *     Spotify artist linker is rate-limit blocked, so most are unmatched.
 *   - Reviewed artists have no trigger writing preference signals at all (see
 *     supabase/feed-affinity-2026-09-10/01_review_signals.REVIEW.sql, which closes that
 *     gap server-side; this stays as the client-side belt to it).
 *
 * So this partitions the already-ranked feed: events by an artist you stream or have
 * reviewed move to the front, everything else keeps the RPC's order. It is a stable
 * partition, not a re-score — it cannot invent relevance, only surface it.
 *
 * Previously web-only (src/services/artistAffinityService.ts). Moved here so mobile gets
 * the same ordering; the two home feeds are supposed to be the same feed.
 */

export interface ArtistAffinity {
  /** Normalized (lowercase, trimmed) names of the user's top streaming artists. */
  topStreamingArtistNames: Set<string>;
  /** artist_id of every artist the user has reviewed. */
  reviewedArtistIds: Set<string>;
}

const EMPTY_AFFINITY: ArtistAffinity = {
  topStreamingArtistNames: new Set(),
  reviewedArtistIds: new Set(),
};

function normalizeArtistName(name: string): string {
  return name.toLowerCase().trim();
}

const CACHE_TTL_MS = 10 * 60 * 1000; // affinity doesn't need to be second-fresh
const cache = new Map<string, { value: ArtistAffinity; expiresAt: number }>();

function collectArtistNames(profileData: unknown, into: Set<string>): void {
  if (!profileData || typeof profileData !== 'object') return;
  const data = profileData as Record<string, unknown>;

  const addList = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const entry of list) {
      const name = (entry as { name?: unknown } | null)?.name;
      if (typeof name === 'string' && name.trim()) into.add(normalizeArtistName(name));
    }
  };

  // Spotify keeps per-time-range lists; Apple Music only ever writes the flat one.
  const byRange = data.topArtistsByTimeRange;
  if (byRange && typeof byRange === 'object') {
    for (const list of Object.values(byRange as Record<string, unknown>)) addList(list);
  }
  addList(data.topArtists);
}

/**
 * Every linked service, not just Spotify. The old web-only version filtered to
 * `service_type = 'spotify'`, so an Apple Music subscriber got no artist boost at all —
 * and Apple Music writes `service_type = 'apple-music'`, which that filter never saw.
 */
async function fetchTopStreamingArtistNames(
  client: SynthSupabaseClient,
  userId: string
): Promise<Set<string>> {
  const { data, error } = await client
    .from('streaming_profiles')
    .select('profile_data')
    .eq('user_id', userId);

  const names = new Set<string>();
  if (error || !Array.isArray(data)) return names;
  for (const row of data) collectArtistNames((row as { profile_data?: unknown }).profile_data, names);
  return names;
}

async function fetchReviewedArtistIds(
  client: SynthSupabaseClient,
  userId: string
): Promise<Set<string>> {
  const { data, error } = await client
    .from('reviews')
    .select('artist_id')
    .eq('user_id', userId)
    .not('artist_id', 'is', null);

  if (error || !Array.isArray(data)) return new Set();
  return new Set(
    data
      .map((r) => (r as { artist_id?: unknown }).artist_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );
}

export async function getUserArtistAffinity(
  client: SynthSupabaseClient,
  userId: string
): Promise<ArtistAffinity> {
  if (!userId) return EMPTY_AFFINITY;

  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const [topStreamingArtistNames, reviewedArtistIds] = await Promise.all([
      fetchTopStreamingArtistNames(client, userId),
      fetchReviewedArtistIds(client, userId),
    ]);
    const value: ArtistAffinity = { topStreamingArtistNames, reviewedArtistIds };
    cache.set(userId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (error) {
    console.error('Error fetching artist affinity:', error);
    return EMPTY_AFFINITY;
  }
}

/**
 * Stable-partitions events so ones by a streamed or reviewed artist come first,
 * preserving the RPC's relative ordering within each group.
 */
export function boostEventsByArtistAffinity<
  T extends { artist_id?: string | null; artist_name?: string | null }
>(events: T[], affinity: ArtistAffinity): T[] {
  if (affinity.topStreamingArtistNames.size === 0 && affinity.reviewedArtistIds.size === 0) {
    return events;
  }

  const matches: T[] = [];
  const rest: T[] = [];

  for (const event of events) {
    const artistIdMatch = !!event.artist_id && affinity.reviewedArtistIds.has(event.artist_id);
    const artistNameMatch =
      !!event.artist_name && affinity.topStreamingArtistNames.has(normalizeArtistName(event.artist_name));

    if (artistIdMatch || artistNameMatch) {
      matches.push(event);
    } else {
      rest.push(event);
    }
  }

  return [...matches, ...rest];
}

/** Test seam — the module-level cache would otherwise leak between cases. */
export function __resetArtistAffinityCache(): void {
  cache.clear();
}
