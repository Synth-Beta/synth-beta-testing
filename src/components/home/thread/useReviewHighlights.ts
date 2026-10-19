import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ReviewHighlight {
  count: number;
  avgRating: number;
  quote: string | null;
}

export interface ReviewHighlights {
  artists: Map<string, ReviewHighlight>;
  venues: Map<string, ReviewHighlight>;
}

const MIN_QUOTE_LENGTH = 24;
const MAX_QUOTE_LENGTH = 140;

const EMPTY: ReviewHighlights = { artists: new Map(), venues: new Map() };

const trimQuote = (text: string) =>
  text.length <= MAX_QUOTE_LENGTH ? text : `${text.slice(0, MAX_QUOTE_LENGTH).replace(/\s+\S*$/, '')}…`;

function summarize(rows: { key: string; rating: number; text: string | null }[]) {
  const acc = new Map<string, { sum: number; count: number; quote: string | null }>();
  for (const r of rows) {
    const entry = acc.get(r.key) ?? { sum: 0, count: 0, quote: null };
    entry.sum += r.rating;
    entry.count += 1;
    const text = r.text?.trim();
    // Rows arrive newest first, so the first usable quote is the freshest positive one.
    if (!entry.quote && text && text.length >= MIN_QUOTE_LENGTH && r.rating >= 3.5) entry.quote = trimQuote(text);
    acc.set(r.key, entry);
  }
  const out = new Map<string, ReviewHighlight>();
  acc.forEach((v, k) => out.set(k, { count: v.count, avgRating: Math.round((v.sum / v.count) * 10) / 10, quote: v.quote }));
  return out;
}

export function useReviewHighlights(artistIds: string[], venueIds: string[]): ReviewHighlights {
  const artists = [...new Set(artistIds)].sort();
  const venues = [...new Set(venueIds)].sort();

  const { data } = useQuery({
    queryKey: ['home', 'review-highlights', artists, venues],
    enabled: artists.length > 0 || venues.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<ReviewHighlights> => {
      const clauses = [
        artists.length ? `artist_id.in.(${artists.join(',')})` : null,
        venues.length ? `venue_id.in.(${venues.join(',')})` : null,
      ].filter(Boolean);
      const { data: rows, error } = await supabase
        .from('reviews')
        .select('artist_id, venue_id, rating, artist_performance_rating, venue_rating, review_text, created_at')
        .eq('is_public', true)
        .eq('is_draft', false)
        .or(clauses.join(','))
        .order('created_at', { ascending: false })
        .limit(800);
      if (error) throw error;

      const artistSet = new Set(artists);
      const venueSet = new Set(venues);
      const artistRows: { key: string; rating: number; text: string | null }[] = [];
      const venueRows: { key: string; rating: number; text: string | null }[] = [];
      for (const r of (rows ?? []) as any[]) {
        const artistRating = r.artist_performance_rating ?? r.rating;
        const venueRating = r.venue_rating ?? r.rating;
        if (r.artist_id && artistSet.has(r.artist_id) && artistRating != null) {
          artistRows.push({ key: r.artist_id, rating: Number(artistRating), text: r.review_text });
        }
        if (r.venue_id && venueSet.has(r.venue_id) && venueRating != null) {
          venueRows.push({ key: r.venue_id, rating: Number(venueRating), text: r.review_text });
        }
      }
      return { artists: summarize(artistRows), venues: summarize(venueRows) };
    },
  });

  return data ?? EMPTY;
}
