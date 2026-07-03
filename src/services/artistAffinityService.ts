import { supabase } from '@/integrations/supabase/client';

/**
 * The personalized feed RPC ranks by genre affinity only (see
 * user_preferences.genre_preference_scores) — it has no concept of a specific artist
 * you listen to or reviewed. This adds that as a client-side boost on top of whatever
 * order the RPC already returned, without touching the RPC itself.
 */
export interface ArtistAffinity {
  /** Normalized (lowercase, trimmed) names of the user's top Spotify artists */
  topSpotifyArtistNames: Set<string>;
  /** artist_id of every artist the user has reviewed */
  reviewedArtistIds: Set<string>;
}

const EMPTY_AFFINITY: ArtistAffinity = {
  topSpotifyArtistNames: new Set(),
  reviewedArtistIds: new Set(),
};

function normalizeArtistName(name: string): string {
  return name.toLowerCase().trim();
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min — affinity doesn't need to be second-fresh
const cache = new Map<string, { value: ArtistAffinity; expiresAt: number }>();

async function fetchTopSpotifyArtistNames(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('streaming_profiles')
    .select('profile_data')
    .eq('user_id', userId)
    .eq('service_type', 'spotify')
    .maybeSingle();

  if (error || !data?.profile_data) return new Set();

  const topArtists = (data.profile_data as any)?.topArtists;
  if (!Array.isArray(topArtists)) return new Set();

  const names = topArtists
    .map((a: any) => a?.name)
    .filter((name: unknown): name is string => typeof name === 'string' && name.length > 0)
    .map(normalizeArtistName);

  return new Set(names);
}

async function fetchReviewedArtistIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('reviews')
    .select('artist_id')
    .eq('user_id', userId)
    .not('artist_id', 'is', null);

  if (error || !data) return new Set();

  return new Set(data.map((r: any) => r.artist_id).filter(Boolean));
}

export async function getUserArtistAffinity(userId: string): Promise<ArtistAffinity> {
  if (!userId) return EMPTY_AFFINITY;

  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const [topSpotifyArtistNames, reviewedArtistIds] = await Promise.all([
      fetchTopSpotifyArtistNames(userId),
      fetchReviewedArtistIds(userId),
    ]);
    const value: ArtistAffinity = { topSpotifyArtistNames, reviewedArtistIds };
    cache.set(userId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (error) {
    console.error('Error fetching artist affinity:', error);
    return EMPTY_AFFINITY;
  }
}

/**
 * Stable-partitions events so ones matching the user's top Spotify artists or reviewed
 * artists come first, preserving the RPC's relative ordering within each group. This is a
 * boost, not a full re-score — it doesn't touch genre-based ordering for everything else.
 */
export function boostEventsByArtistAffinity<
  T extends { artist_id?: string | null; artist_name?: string | null }
>(events: T[], affinity: ArtistAffinity): T[] {
  if (affinity.topSpotifyArtistNames.size === 0 && affinity.reviewedArtistIds.size === 0) {
    return events;
  }

  const matches: T[] = [];
  const rest: T[] = [];

  for (const event of events) {
    const artistIdMatch = !!event.artist_id && affinity.reviewedArtistIds.has(event.artist_id);
    const artistNameMatch =
      !!event.artist_name && affinity.topSpotifyArtistNames.has(normalizeArtistName(event.artist_name));

    if (artistIdMatch || artistNameMatch) {
      matches.push(event);
    } else {
      rest.push(event);
    }
  }

  return [...matches, ...rest];
}
