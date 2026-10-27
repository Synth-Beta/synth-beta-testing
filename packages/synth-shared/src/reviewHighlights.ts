/**
 * Rating lines under a home-feed event card: the artist's average and the venue's
 * average from public reviews, each with at most one short quote. Shared so web and
 * Expo pick the same numbers and the same quote.
 *
 * Rules:
 *  - Artist average: artist_performance_rating (falls back to the overall rating, which
 *    is what older reviews stored). Venue average: venue_rating only, so how good the
 *    band was never moves a venue's score.
 *  - A quote only comes from a good rating (>= 4 on that dimension), newest first.
 *    Artist quote: artist_performance_feedback, else the review text (usually about the
 *    show). Venue quote: venue_feedback only, so a venue line never quotes band talk.
 *  - No review counts are exposed.
 */

import type { SynthSupabaseClient } from './supabaseClientType';

export interface RatingHighlight {
  avgRating: number;
  quote: string | null;
}

export interface ReviewHighlights {
  artists: Map<string, RatingHighlight>;
  venues: Map<string, RatingHighlight>;
}

export interface HighlightReviewRow {
  artist_id?: string | null;
  venue_id?: string | null;
  rating?: number | null;
  artist_performance_rating?: number | null;
  venue_rating?: number | null;
  review_text?: string | null;
  artist_performance_feedback?: string | null;
  venue_feedback?: string | null;
}

export const QUOTE_MIN_RATING = 4;
const MIN_QUOTE_LENGTH = 24;
const MAX_QUOTE_LENGTH = 140;

export const EMPTY_REVIEW_HIGHLIGHTS: ReviewHighlights = { artists: new Map(), venues: new Map() };

function usableQuote(text?: string | null): string | null {
  const t = text?.replace(/\s+/g, ' ').trim();
  if (!t || t.length < MIN_QUOTE_LENGTH) return null;
  return t.length <= MAX_QUOTE_LENGTH ? t : `${t.slice(0, MAX_QUOTE_LENGTH).replace(/\s+\S*$/, '')}…`;
}

type Acc = { sum: number; count: number; quote: string | null };

function add(map: Map<string, Acc>, key: string, rating: number, quote: string | null) {
  const a = map.get(key) ?? { sum: 0, count: 0, quote: null };
  a.sum += rating;
  a.count += 1;
  if (!a.quote && quote && rating >= QUOTE_MIN_RATING) a.quote = quote;
  map.set(key, a);
}

function finish(map: Map<string, Acc>): Map<string, RatingHighlight> {
  const out = new Map<string, RatingHighlight>();
  map.forEach((a, k) => out.set(k, { avgRating: Math.round((a.sum / a.count) * 10) / 10, quote: a.quote }));
  return out;
}

/** `rows` must be newest first (the first usable quote wins). */
export function summarizeReviewHighlights(
  rows: HighlightReviewRow[],
  artistIds: Iterable<string>,
  venueIds: Iterable<string>
): ReviewHighlights {
  const wantArtists = new Set(artistIds);
  const wantVenues = new Set(venueIds);
  const artists = new Map<string, Acc>();
  const venues = new Map<string, Acc>();

  for (const r of rows) {
    const artistRating = r.artist_performance_rating ?? r.rating;
    if (r.artist_id && wantArtists.has(r.artist_id) && artistRating != null) {
      add(
        artists,
        r.artist_id,
        Number(artistRating),
        usableQuote(r.artist_performance_feedback) ?? usableQuote(r.review_text)
      );
    }
    if (r.venue_id && wantVenues.has(r.venue_id) && r.venue_rating != null) {
      add(venues, r.venue_id, Number(r.venue_rating), usableQuote(r.venue_feedback));
    }
  }
  return { artists: finish(artists), venues: finish(venues) };
}

/** Public, published reviews for these artists/venues, summarized. Never throws. */
export async function fetchReviewHighlights(
  supabase: SynthSupabaseClient,
  artistIds: string[],
  venueIds: string[]
): Promise<ReviewHighlights> {
  const artists = [...new Set(artistIds)].filter(Boolean);
  const venues = [...new Set(venueIds)].filter(Boolean);
  if (artists.length === 0 && venues.length === 0) return EMPTY_REVIEW_HIGHLIGHTS;

  const clauses = [
    artists.length ? `artist_id.in.(${artists.join(',')})` : null,
    venues.length ? `venue_id.in.(${venues.join(',')})` : null,
  ].filter(Boolean);

  try {
    const { data, error } = await (supabase as any)
      .from('reviews')
      .select(
        'artist_id, venue_id, rating, artist_performance_rating, venue_rating, review_text, artist_performance_feedback, venue_feedback, created_at'
      )
      // NULL counts as public / published, same as the feed RPC.
      .not('is_public', 'is', false)
      .not('is_draft', 'is', true)
      .or(clauses.join(','))
      .order('created_at', { ascending: false })
      .limit(800);
    if (error) throw error;
    return summarizeReviewHighlights((data ?? []) as HighlightReviewRow[], artists, venues);
  } catch (e) {
    console.warn('Review highlights failed:', e);
    return EMPTY_REVIEW_HIGHLIGHTS;
  }
}
