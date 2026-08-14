/**
 * Two ways to find "upcoming events matching genre X" — one implementation for
 * web and Expo mobile, in both cases.
 *
 * getUpcomingEventsForGenreChat (recommended for the 12 genre chats) matches
 * directly against the raw events.genres array using GENRE_CHAT_TAG_MAP, a
 * curated list built from the real distinct tag values in production. Reliable
 * by construction. Optionally location-aware: pass `near` to get nearby events
 * within radiusMiles, backfilled (if under `limit`) with a random selection from
 * the 1-week-to-1-month window (not sooner — not enough lead time for someone to
 * decide to go; not later — too far out to be a useful suggestion). The whole
 * list, nearby + backfill together, is always ordered closest-to-farthest —
 * only WHICH farther events get picked is randomized, not the display order.
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
  /** Default 40 miles. */
  radiusMiles?: number;
}

export interface GenreChatEventRow extends Record<string, unknown> {
  /** Distance from the `near` point in miles. `null` only when `near` was
   *  never provided, or the event itself has no coordinates on file. */
  distanceMiles: number | null;
}

/** Upcoming events for one of the 12 genre-chat IDs (see GENRE_CHAT_TAG_MAP).
 *  When `near` is omitted, behavior is unchanged: random pick nationwide from
 *  the 1-week-to-1-month window (see fetchRandomInWindow). */
export async function getUpcomingEventsForGenreChat(
  client: SynthSupabaseClient,
  genreChatId: string,
  limit: number = 20,
  near?: NearbyParams
): Promise<GenreChatEventRow[]> {
  const tags = GENRE_CHAT_TAG_MAP[genreChatId];
  if (!tags || tags.length === 0) return [];

  if (!near) {
    const rows = await fetchRandomInWindow(client, tags, new Set(), limit);
    return rows.map((row) => ({ ...row, distanceMiles: null }));
  }

  const radiusMiles = near.radiusMiles ?? 40;
  const { latDelta, lngDelta } = boundingBoxDeltas(near.latitude, radiusMiles);

  // No upper bound on limit-vs-sort-order bug: this used to sort by event_date
  // and cap at 50 BEFORE distance is computed, so a genuinely closer event
  // with a later date than 50 sooner-but-farther ones would get cut before
  // distance sorting ever saw it (reported live: the actual closest event was
  // missing from results). Order by distance isn't expressible in SQL here
  // (no PostGIS), so instead: no DB-side order, and a limit generous enough
  // that the true closest event is essentially never excluded by the cap.
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
    .limit(500);

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
  // Random SELECTION from the 1-week-to-1-month window, but still distance-
  // ordered for DISPLAY — the whole list should read as one continuous
  // closest-to-farthest sequence, just with the farther portion randomly
  // picked rather than picked by soonest date.
  const backfillPicks = await fetchRandomInWindow(client, tags, nearbyIds, limit - nearby.length);
  const backfill: GenreChatEventRow[] = backfillPicks
    .map(
      (row): GenreChatEventRow => ({
        ...row,
        distanceMiles:
          row.latitude != null && row.longitude != null
            ? calculateDistanceMiles(near.latitude, near.longitude, Number(row.latitude), Number(row.longitude))
            : null,
      })
    )
    .sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity));

  return [...nearby, ...backfill];
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Random pick from events 1 week to 1 month out — deliberately excludes
 * "this week" (not enough lead time for someone to actually decide to go)
 * and anything past a month (too far out to be a useful suggestion), then
 * shuffles rather than sorting by date so the same soonest handful doesn't
 * dominate every request.
 */
async function fetchRandomInWindow(
  client: SynthSupabaseClient,
  tags: string[],
  excludeIds: Set<string>,
  count: number
): Promise<Record<string, unknown>[]> {
  const now = Date.now();
  const from = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await client
    .from('events')
    .select('*')
    .overlaps('genres', tags)
    .gte('event_date', from)
    .lte('event_date', to)
    .limit(100);
  if (error || !data) return [];

  const pool = (data as Record<string, unknown>[]).filter(
    (row) => !excludeIds.has(row.id as string)
  );
  return shuffle(pool).slice(0, count);
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
