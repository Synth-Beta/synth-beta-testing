import { supabase } from '../integrations/supabase/client';

type ReviewRatingRow = {
  id: string;
  rating: number | null;
  artist_performance_rating: number | null;
  production_rating: number | null;
  venue_rating: number | null;
  location_rating: number | null;
  value_rating: number | null;
};

function effectiveRatingForRow(review: ReviewRatingRow): number | null {
  const values = [
    review.artist_performance_rating,
    review.production_rating,
    review.venue_rating,
    review.location_rating,
    review.value_rating,
  ].filter((v): v is number => typeof v === 'number' && v > 0);

  if (values.length > 0) {
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    return Math.round(avg * 10) / 10;
  }

  if (review.rating != null && typeof review.rating === 'number' && Number.isFinite(review.rating)) {
    return Math.round(review.rating * 10) / 10;
  }
  return null;
}

/**
 * Mirrors web ReviewService.setRankOrderForRatingGroup for mobile Supabase client.
 */
export async function setRankOrderForRatingGroup(
  userId: string,
  rating: number,
  orderedReviewIds: string[]
): Promise<void> {
  const roundedRating = Math.round(rating * 10) / 10;
  const updates = orderedReviewIds.map((id, idx) => ({ id, rank_order: idx + 1 }));

  const { data: allReviewsWithRating, error: fetchError } = await supabase
    .from('reviews')
    .select(
      'id, rating, artist_performance_rating, production_rating, venue_rating, location_rating, value_rating'
    )
    .eq('user_id', userId)
    .eq('is_draft', false);

  if (fetchError) {
    console.warn('[reviewRankOrder] fetch reviews for clear:', fetchError.message);
  } else if (allReviewsWithRating) {
    const rows = allReviewsWithRating as unknown as ReviewRatingRow[];
    const reviewsToClear = rows.filter(review => {
      const eff = effectiveRatingForRow(review);
      return eff === roundedRating;
    });

    for (const review of reviewsToClear) {
      if (!orderedReviewIds.includes(review.id)) {
        const { error } = await supabase.from('reviews').update({ rank_order: null }).eq('id', review.id).eq('user_id', userId);
        if (error) console.warn('[reviewRankOrder] clear rank:', error.message);
      }
    }
  }

  for (const u of updates) {
    const { error } = await supabase.from('reviews').update({ rank_order: u.rank_order }).eq('id', u.id).eq('user_id', userId);
    if (error) {
      console.error('[reviewRankOrder] update rank:', error);
      throw new Error(error.message);
    }
  }
}
