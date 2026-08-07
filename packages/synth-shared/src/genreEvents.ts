/**
 * Two ways to find "upcoming events matching genre X" — one implementation for
 * web and Expo mobile, in both cases.
 *
 * getUpcomingEventsForGenreChat (recommended for the 12 genre chats) matches
 * directly against the raw events.genres array using GENRE_CHAT_TAG_MAP, a
 * curated list built from the real distinct tag values in production. Reliable
 * by construction.
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

/** Upcoming events for one of the 12 genre-chat IDs (see GENRE_CHAT_TAG_MAP). */
export async function getUpcomingEventsForGenreChat(
  client: SynthSupabaseClient,
  genreChatId: string,
  limit: number = 20
): Promise<Record<string, unknown>[]> {
  const tags = GENRE_CHAT_TAG_MAP[genreChatId];
  if (!tags || tags.length === 0) return [];

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
