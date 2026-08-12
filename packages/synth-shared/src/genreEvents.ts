/**
 * Two ways to find "upcoming events matching genre X" — one implementation for
 * web and Expo mobile, in both cases.
 *
 * getUpcomingEventsForGenreChat (recommended for the 12 genre chats) matches
 * directly against the raw events.genres array using GENRE_CHAT_TAG_MAP, a
 * curated list built from the real distinct tag values in production. Reliable
 * by construction. Optionally location-aware: pass `near` to get nearby events
 * first (closest first, within radiusMiles), backfilled with the next-soonest
 * nationwide events (excluding duplicates) up to `limit`.
 *
 * getUpcomingEventsForGenreUmbrella walks the genre_parent/genre_paths taxonomy
 * graph via get_genres_under_umbrella. Kept for other potential uses, but it's
 * NOT reliable for "which events belong in this genre chat": that graph is a
 * genre-similarity network (fed by genre_similarity_edges/genre_cooccurrence_pairs),
 * not a hierarchy — single genres can have a dozen+ materialized paths through
 * unrelated roots, and ~69% of all mapped genres route through "Pop" simply
 * because it's the most densely-connected hub, not because they're pop music.
 * The single most common hip-hop tag ("hip-hop-rap", 16k+ events) has zero path
 * through the "hip-hop" root at all under this graph.
 */
import type { SynthSupabaseClient } from './supabaseClientType';
import { GENRE_CHAT_TAG_MAP } from './genreChatTagMap';
import { calculateDistanceMiles, boundingBoxDeltas } from './geo';

export interface NearbyParams {
  latitude: number;
  longitude: number;
  /** Default 25 miles. */
  radiusMiles?: number;
}

export interface GenreChatEventRow extends Record<string, unknown> {
  /** Distance from the `near` point in miles, or `null` if this row was
   *  backfilled from the nationwide query rather than matched nearby. */
  distanceMiles: number | null;
}

/** Upcoming events for one of the 12 genre-chat IDs (see GENRE_CHAT_TAG_MAP).
 *  When `near` is omitted, behavior is unchanged: soonest events nationwide. */
export async function getUpcomingEventsForGenreChat(
  client: SynthSupabaseClient,
  genreChatId: string,
  limit: number = 20,
  near?: NearbyParams
): Promise<GenreChatEventRow[]> {
  const tags = GENRE_CHAT_TAG_MAP[genreChatId];
  if (!tags || tags.length === 0) return [];

  if (!near) {
    const rows = await fetchByDate(client, tags, limit);
    return rows.map((row) => ({ ...row, distanceMiles: null }));
  }

  const radiusMiles = near.radiusMiles ?? 25;
  const { latDelta, lngDelta } = boundingBoxDeltas(near.latitude, radiusMiles);

  const { data: nearbyCandidates, error: nearbyError } = await client
    .from('events')
    .select('*')
    .overlaps('genres', tags)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .gte('latitude', near.latitude - latDelta)
    .lte('latitude', near.latitude + latDelta)
    .gte('longitude', near.longitude - lngDelta)
    .lte('longitude', near.longitude + lngDelta)
    .gte('event_date', new Date().toISOString())
    .order('event_date', { ascending: true })
    .limit(50);

  const candidateRows: Record<string, unknown>[] =
    nearbyError || !nearbyCandidates ? [] : (nearbyCandidates as Record<string, unknown>[]);

  const nearby: GenreChatEventRow[] = candidateRows
    .map(
      (row): GenreChatEventRow => ({
        ...row,
        distanceMiles: calculateDistanceMiles(
          near.latitude,
          near.longitude,
          Number(row.latitude),
          Number(row.longitude)
        ),
      })
    )
    .filter((row: GenreChatEventRow) => (row.distanceMiles as number) <= radiusMiles)
    .sort((a: GenreChatEventRow, b: GenreChatEventRow) => (a.distanceMiles as number) - (b.distanceMiles as number))
    .slice(0, limit);

  if (nearby.length >= limit) return nearby;

  const nearbyIds = new Set(nearby.map((row) => row.id as string));
  const backfillCandidates = await fetchByDate(client, tags, 50);
  const backfill: GenreChatEventRow[] = backfillCandidates
    .filter((row) => !nearbyIds.has(row.id as string))
    .slice(0, limit - nearby.length)
    .map((row) => ({ ...row, distanceMiles: null }));

  return [...nearby, ...backfill];
}

async function fetchByDate(
  client: SynthSupabaseClient,
  tags: string[],
  limit: number
): Promise<Record<string, unknown>[]> {
  const { data, error } = await client
    .from('events')
    .select('*')
    .overlaps('genres', tags)
    .gte('event_date', new Date().toISOString())
    .order('event_date', { ascending: true })
    .limit(limit);
  if (error || !data) return [];
  return data;
}

export async function getUpcomingEventsForGenreUmbrella(
  client: SynthSupabaseClient,
  umbrellaSlug: string,
  limit: number = 20
): Promise<Record<string, unknown>[]> {
  const { data: genreIdRows, error: umbrellaError } = await client.rpc(
    'get_genres_under_umbrella',
    { p_slug: umbrellaSlug }
  );
  if (umbrellaError || !genreIdRows || genreIdRows.length === 0) return [];

  const genreIds = (genreIdRows as unknown[])
    .map((row) => (typeof row === 'string' ? row : Object.values(row as object)[0]))
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (genreIds.length === 0) return [];

  // Overfetch: an event tagged with >1 genre under this umbrella produces one row
  // per matching genre_id (inner join), so dedupe by event id after fetching.
  const { data: rows, error } = await client
    .from('events')
    .select('*, events_genres!inner(genre_id)')
    .in('events_genres.genre_id', genreIds)
    .gte('event_date', new Date().toISOString())
    .order('event_date', { ascending: true })
    .limit(limit * 3);
  if (error || !rows) return [];

  const seen = new Set<string>();
  const deduped: Record<string, unknown>[] = [];
  for (const row of rows as Array<Record<string, unknown>>) {
    const { events_genres: _eventsGenres, ...event } = row;
    const id = event.id as string;
    if (seen.has(id)) continue;
    seen.add(id);
    deduped.push(event);
    if (deduped.length >= limit) break;
  }
  return deduped;
}
