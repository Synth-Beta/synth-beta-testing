/**
 * Turns a user's ranked bucket list into feed events — one implementation for
 * web and Expo mobile, so "#1 on your bucket list" means the same thing and
 * sorts the same way on both platforms.
 */
import type { SynthSupabaseClient } from './supabaseClientType';

export interface BucketListFeedEvent {
  [key: string]: unknown;
  event_date: string;
  /** 0-based priority from the caller's ranked artist list (lower = higher priority). */
  bucket_rank: number;
  bucket_reason: string;
  bucket_source_artist: string;
}

/**
 * Fetches upcoming events for artists already sorted by bucket-list priority
 * (rank_order asc, nulls last — callers resolve that ordering themselves since
 * entity enrichment differs slightly per platform's BucketListService).
 */
export async function getEventsFromRankedArtists(
  client: SynthSupabaseClient,
  rankedArtistNames: string[],
  limit: number = 20
): Promise<BucketListFeedEvent[]> {
  if (rankedArtistNames.length === 0) return [];

  const perArtist = await Promise.all(
    rankedArtistNames.slice(0, 10).map(async (name, rank) => {
      const { data: events } = await client
        .from('events')
        .select('*')
        .ilike('artist_name', `%${name}%`)
        .gte('event_date', new Date().toISOString())
        .order('event_date', { ascending: true })
        .limit(5);

      return (events || []).map((e: Record<string, unknown>) => ({
        ...e,
        bucket_rank: rank,
        bucket_reason: `#${rank + 1} on your bucket list`,
        bucket_source_artist: name,
      })) as BucketListFeedEvent[];
    })
  );

  return perArtist
    .flat()
    .sort(
      (a, b) =>
        a.bucket_rank - b.bucket_rank ||
        new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
    )
    .slice(0, limit);
}
