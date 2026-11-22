/**
 * Calendar day list: put the shows a viewer is most likely to care about first, so a
 * 20-show night doesn't need scrolling. Taste comes from three things the app already
 * stores: followed artists, followed venues, and user_preferences.genre_preference_scores.
 *
 * Score = followed artist (100) + followed venue (30) + best genre match (0-20, scaled
 * against the viewer's strongest genre). Ties and no-taste viewers keep time order.
 */
import type { SynthSupabaseClient } from './supabaseClientType';

export type CalendarTaste = {
  artistIds: Set<string>;
  venueIds: Set<string>;
  /** Genre slug (e.g. "hip-hop-rap") -> preference score. */
  genreScores: Record<string, number>;
};

type RankableEvent = {
  event_date?: string | null;
  artist_id?: string | null;
  venue_id?: string | null;
  genres?: string[] | null;
};

export const EMPTY_CALENDAR_TASTE: CalendarTaste = { artistIds: new Set(), venueIds: new Set(), genreScores: {} };

/** "Hip-Hop/Rap" -> "hip-hop-rap", "R&B" -> "r-b": the key format genre_preference_scores uses. */
export function genreSlug(genre: string): string {
  return genre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function calendarTasteScore(event: RankableEvent, taste: CalendarTaste): number {
  let score = 0;
  if (event.artist_id && taste.artistIds.has(event.artist_id)) score += 100;
  if (event.venue_id && taste.venueIds.has(event.venue_id)) score += 30;
  const maxGenre = Math.max(0, ...Object.values(taste.genreScores));
  if (maxGenre > 0 && Array.isArray(event.genres)) {
    let best = 0;
    for (const g of event.genres) {
      if (typeof g === 'string') best = Math.max(best, taste.genreScores[genreSlug(g)] ?? 0);
    }
    score += (best / maxGenre) * 20;
  }
  return score;
}

/** Highest taste score first, then earliest start. Returns a new array. */
export function rankCalendarDayEvents<T extends RankableEvent>(events: T[], taste: CalendarTaste): T[] {
  const time = (e: T) => (e.event_date ? Date.parse(e.event_date) : Number.MAX_SAFE_INTEGER) || 0;
  return events
    .map((e) => ({ e, s: calendarTasteScore(e, taste), t: time(e) }))
    .sort((a, b) => b.s - a.s || a.t - b.t)
    .map((x) => x.e);
}

/** One round of three small reads; any failure just drops that signal. */
export async function loadCalendarTaste(client: SynthSupabaseClient, userId: string): Promise<CalendarTaste> {
  const [artists, venues, prefs] = await Promise.all([
    client.from('artist_follows').select('artist_id').eq('user_id', userId),
    client.from('user_venue_relationships').select('venue_id').eq('user_id', userId),
    client.from('user_preferences').select('genre_preference_scores').eq('user_id', userId).maybeSingle(),
  ]);
  const ids = (rows: unknown, key: string) =>
    new Set(((rows as Array<Record<string, unknown>> | null) ?? []).map((r) => String(r[key] ?? '')).filter(Boolean));
  const raw = (prefs.data as { genre_preference_scores?: Record<string, unknown> } | null)?.genre_preference_scores;
  const genreScores: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) genreScores[genreSlug(k)] = v;
  }
  return { artistIds: ids(artists.data, 'artist_id'), venueIds: ids(venues.data, 'venue_id'), genreScores };
}
