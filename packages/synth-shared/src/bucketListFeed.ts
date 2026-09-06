/**
 * Turns a user's ranked bucket list into feed events — one implementation for
 * web and Expo mobile, so "#1 on your bucket list" means the same thing and
 * sorts the same way on both platforms.
 */
import type { SynthSupabaseClient } from './supabaseClientType';

/** One bucket-list artist, already in priority order (index 0 = #1). */
export interface RankedBucketArtist {
  /** artists.id. bucket_list.entity_id points at entities.id, so callers resolve it first. */
  id: string;
  name: string;
}

export interface BucketListFeedEvent {
  [key: string]: unknown;
  event_date: string;
  artist_name: string;
  venue_name: string;
  /** 0-based priority from the caller's ranked artist list (lower = higher priority). */
  bucket_rank: number;
  bucket_reason: string;
  bucket_source_artist: string;
}

export interface BucketListFeedOptions {
  limit?: number;
  /** Restrict to events near this point. Same bounding box as get_personalized_feed_v5. */
  near?: { lat: number; lng: number; radiusMiles?: number };
}

const MILES_PER_DEGREE_LAT = 69;
/** Only the top N ranked artists drive the feed — past that it stops being a priority list. */
const MAX_RANKED_ARTISTS = 10;
const MAX_EVENTS_PER_ARTIST = 5;

/**
 * Fetches upcoming events for artists already sorted by bucket-list priority
 * (rank_order asc, nulls last — callers resolve that ordering themselves since
 * entity enrichment differs slightly per platform's BucketListService).
 */
export async function getEventsFromRankedArtists(
  client: SynthSupabaseClient,
  rankedArtists: RankedBucketArtist[],
  options: BucketListFeedOptions = {}
): Promise<BucketListFeedEvent[]> {
  const { limit = 20, near } = options;
  const top = (rankedArtists || []).filter((a) => a && a.id).slice(0, MAX_RANKED_ARTISTS);
  if (top.length === 0) return [];

  let query = client
    .from('events')
    // events has NO artist_name / venue_name column — the JamBase sync destructures
    // both out of the row before insert. Matching on artist_id and reading the names
    // off the joined rows is the only thing that works here.
    .select('*, artists(name), venues(name)')
    .in(
      'artist_id',
      top.map((a) => a.id)
    )
    .gte('event_date', new Date().toISOString())
    .order('event_date', { ascending: true })
    .limit(top.length * MAX_EVENTS_PER_ARTIST);

  if (near) {
    const radius = near.radiusMiles ?? 50;
    const dLat = radius / MILES_PER_DEGREE_LAT;
    // cos() floors at 0.01 so a near-polar lat can't divide by ~0 and blow the box open.
    const dLng =
      radius / (MILES_PER_DEGREE_LAT * Math.max(Math.cos((near.lat * Math.PI) / 180), 0.01));
    query = query
      .gte('latitude', near.lat - dLat)
      .lte('latitude', near.lat + dLat)
      .gte('longitude', near.lng - dLng)
      .lte('longitude', near.lng + dLng);
  }

  const { data, error } = await query;
  if (error) {
    // Do not swallow: an empty bucket rail that is really a query failure is how
    // this feature stayed silently dead against a column that doesn't exist.
    console.error('Bucket list feed query failed:', error);
    return [];
  }

  const rankById = new Map(top.map((a, rank) => [a.id, rank]));
  const nameById = new Map(top.map((a) => [a.id, a.name]));

  const mapped: BucketListFeedEvent[] = ((data || []) as Record<string, any>[]).map(
    (e: Record<string, any>) => {
      const rank = rankById.get(e.artist_id) ?? top.length;
      const sourceArtist = nameById.get(e.artist_id) || '';
      return {
        ...e,
        artist_name: e.artists?.name || sourceArtist,
        venue_name: e.venues?.name || '',
        bucket_rank: rank,
        bucket_reason: `#${rank + 1} on your bucket list`,
        bucket_source_artist: sourceArtist,
      } as BucketListFeedEvent;
    }
  );

  return mapped
    .sort(
      (a, b) =>
        a.bucket_rank - b.bucket_rank ||
        new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
    )
    .slice(0, limit);
}
