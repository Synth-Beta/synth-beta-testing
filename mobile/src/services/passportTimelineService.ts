import { supabase } from '../integrations/supabase/client';

/**
 * Pin / milestone metadata layered on top of the review-based timeline.
 * Same `passport_timeline` table and upsert semantics as web
 * `src/services/passportService.ts` (pinTimelineEvent / addTimelineMilestone).
 */
export interface TimelineMeta {
    timelineId: string;
    reviewId: string;
    isPinned: boolean;
    significance: string | null;
    description: string | null;
}

export const MAX_PINNED_TIMELINE_ITEMS = 5;

type PassportTimelineRow = {
    id: string;
    review_id: string | null;
    is_pinned: boolean | null;
    significance: string | null;
    description: string | null;
};

export class PassportTimelineService {
    /** All pin/milestone rows for a user, keyed by review_id. */
    static async getMetaByReview(userId: string): Promise<Map<string, TimelineMeta>> {
        const map = new Map<string, TimelineMeta>();
        const { data, error } = await supabase
            .from('passport_timeline')
            .select('id, review_id, is_pinned, significance, description')
            .eq('user_id', userId);

        if (error) {
            console.warn('[PassportTimelineService] getMetaByReview', error.message);
            return map;
        }

        for (const row of (data || []) as PassportTimelineRow[]) {
            if (!row.review_id) continue;
            map.set(row.review_id, {
                timelineId: row.id,
                reviewId: row.review_id,
                isPinned: !!row.is_pinned,
                significance: row.significance,
                description: row.description,
            });
        }
        return map;
    }

    /** Pin a review to the timeline (max 5 pinned). Throws with a user-readable message. */
    static async pin(userId: string, reviewId: string): Promise<void> {
        const { count } = await supabase
            .from('passport_timeline')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_pinned', true);

        if (count && count >= MAX_PINNED_TIMELINE_ITEMS) {
            throw new Error(`You can pin up to ${MAX_PINNED_TIMELINE_ITEMS} shows. Unpin one first.`);
        }

        const { error } = await supabase
            .from('passport_timeline')
            .upsert(
                {
                    user_id: userId,
                    review_id: reviewId,
                    is_pinned: true,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id,review_id' }
            );

        if (error) throw error;
    }

    static async unpin(userId: string, timelineId: string): Promise<void> {
        const { error } = await supabase
            .from('passport_timeline')
            .update({ is_pinned: false })
            .eq('id', timelineId)
            .eq('user_id', userId);

        if (error) throw error;
    }

    /**
     * Add or update a milestone (significance label + optional description).
     * `eventName` is stored so the milestone renders standalone, like web.
     */
    static async saveMilestone(
        userId: string,
        reviewId: string,
        significance: string,
        description: string | null,
        eventName: string | null
    ): Promise<void> {
        const { error } = await supabase
            .from('passport_timeline')
            .upsert(
                {
                    user_id: userId,
                    review_id: reviewId,
                    significance,
                    description,
                    Event_name: eventName,
                    is_auto_selected: false,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id,review_id' }
            );

        if (error) throw error;
    }

    /** Clear the milestone but keep the row (and its pin state) if pinned; delete otherwise. */
    static async removeMilestone(userId: string, meta: TimelineMeta): Promise<void> {
        if (meta.isPinned) {
            const { error } = await supabase
                .from('passport_timeline')
                .update({ significance: null, description: null, updated_at: new Date().toISOString() })
                .eq('id', meta.timelineId)
                .eq('user_id', userId);
            if (error) throw error;
            return;
        }

        const { error } = await supabase
            .from('passport_timeline')
            .delete()
            .eq('id', meta.timelineId)
            .eq('user_id', userId);
        if (error) throw error;
    }
}
