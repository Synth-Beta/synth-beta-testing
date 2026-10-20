import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchReviewHighlights, EMPTY_REVIEW_HIGHLIGHTS, type ReviewHighlights } from '@synth/shared';

export type { RatingHighlight, ReviewHighlights } from '@synth/shared';

/** Artist + venue averages and one good-rating quote each (rules in @synth/shared reviewHighlights). */
export function useReviewHighlights(artistIds: string[], venueIds: string[]): ReviewHighlights {
  const artists = [...new Set(artistIds)].sort();
  const venues = [...new Set(venueIds)].sort();

  const { data } = useQuery({
    queryKey: ['home', 'review-highlights', artists, venues],
    enabled: artists.length > 0 || venues.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: () => fetchReviewHighlights(supabase, artists, venues),
  });

  return data ?? EMPTY_REVIEW_HIGHLIGHTS;
}
