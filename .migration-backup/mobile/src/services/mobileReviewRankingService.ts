/**
 * Minimal review ranking service for mobile.
 * Mirrors PostSubmitRankingModal + ReviewService logic from the web.
 */
import { supabase } from '../integrations/supabase/client';

export interface ReviewForRanking {
    id: string;
    rating: number;
    artist_performance_rating?: number;
    production_rating?: number;
    venue_rating?: number;
    location_rating?: number;
    value_rating?: number;
    review_text?: string;
    rank_order?: number | null;
    artist_name?: string;
    venue_name?: string;
    event_date?: string;
}

function calcEffectiveRating(r: ReviewForRanking): number {
    const vals = [
        r.artist_performance_rating,
        r.production_rating,
        r.venue_rating,
        r.location_rating,
        r.value_rating,
    ].filter((v): v is number => typeof v === 'number' && v > 0);
    if (vals.length > 0) {
        const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
        return Math.round(avg * 10) / 10;
    }
    return Math.round((r.rating || 0) * 10) / 10;
}

/** Fetch all user reviews with the same effective rating (rounded to 1 decimal). */
export async function getReviewsForRating(
    userId: string,
    targetRating: number
): Promise<ReviewForRanking[]> {
    const rounded = Math.round(targetRating * 10) / 10;

    const { data, error } = await supabase
        .from('reviews')
        .select(
            'id, rating, artist_performance_rating, production_rating, venue_rating, location_rating, value_rating, review_text, rank_order'
        )
        .eq('user_id', userId)
        .eq('is_draft', false);

    if (error || !data) return [];

    // Filter to same effective rating
    const matching = (data as ReviewForRanking[]).filter(
        (r) => calcEffectiveRating(r) === rounded
    );

    // Enrich with artist/venue names from the events table via event_id
    const enriched = await Promise.all(
        matching.map(async (r) => {
            try {
                const { data: ev } = await supabase
                    .from('events_with_artist_venue')
                    .select('artist_name_normalized, venue_name_normalized, event_date')
                    .or(`artist_id.eq.${r.id},venue_id.eq.${r.id}`)
                    .limit(1)
                    .maybeSingle();
                // Also try joining through reviews → events
                const { data: revRow } = await supabase
                    .from('reviews')
                    .select('event_id')
                    .eq('id', r.id)
                    .maybeSingle();
                if (revRow?.event_id) {
                    const { data: evByReview } = await supabase
                        .from('events_with_artist_venue')
                        .select('artist_name_normalized, venue_name_normalized, event_date')
                        .eq('id', revRow.event_id)
                        .maybeSingle();
                    if (evByReview) {
                        return {
                            ...r,
                            artist_name: evByReview.artist_name_normalized ?? undefined,
                            venue_name: evByReview.venue_name_normalized ?? undefined,
                            event_date: evByReview.event_date ?? undefined,
                        };
                    }
                }
                if (ev) {
                    return {
                        ...r,
                        artist_name: ev.artist_name_normalized ?? undefined,
                        venue_name: ev.venue_name_normalized ?? undefined,
                        event_date: ev.event_date ?? undefined,
                    };
                }
            } catch {
                /* non-fatal */
            }
            return r;
        })
    );

    // Sort by rank_order then created_at
    enriched.sort((a, b) => {
        if (a.rank_order != null && b.rank_order != null) return a.rank_order - b.rank_order;
        if (a.rank_order != null) return -1;
        if (b.rank_order != null) return 1;
        return 0;
    });

    return enriched;
}

/** Persist rank_order for a rating group — identical logic to web ReviewService. */
export async function setRankOrder(
    userId: string,
    orderedIds: string[]
): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
        await (supabase as any)
            .from('reviews')
            .update({ rank_order: i + 1 })
            .eq('id', orderedIds[i])
            .eq('user_id', userId);
    }
}
