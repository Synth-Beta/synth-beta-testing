import { supabase } from '../integrations/supabase/client';

export class ReviewComposerService {
    static async submitEventReview(params: {
        userId: string;
        eventId: string;
        rating: number;
        reviewText: string;
        artistId?: string | null;
        venueId?: string | null;
    }): Promise<{ ok: boolean; error?: string }> {
        const text = params.reviewText.trim();
        if (text.length < 3) {
            return { ok: false, error: 'Review is too short.' };
        }
        if (params.rating < 1 || params.rating > 5) {
            return { ok: false, error: 'Rating must be between 1 and 5.' };
        }

        const row: Record<string, unknown> = {
            user_id: params.userId,
            event_id: params.eventId,
            rating: Math.round(params.rating * 10) / 10,
            review_text: text,
            is_public: true,
            is_draft: false,
            review_type: 'event',
            was_there: true,
        };
        if (params.artistId) row.artist_id = params.artistId;
        if (params.venueId) row.venue_id = params.venueId;

        const { error } = await supabase.from('reviews').insert(row as any);
        if (error) {
            console.warn('[reviewComposer]', error);
            return { ok: false, error: error.message };
        }
        return { ok: true };
    }
}
