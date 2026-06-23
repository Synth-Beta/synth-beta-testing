import { supabase } from '../integrations/supabase/client';

/**
 * Toggle "helpful" (like) on a review — same `entities` + `engagements` flow as web `ReviewService`.
 */
export class ReviewEngagementService {
    /** Review UUIDs the viewer has marked helpful (via `engagements`). */
    static async getReviewIdsLikedByUser(viewerId: string, reviewIds: string[]): Promise<Set<string>> {
        if (!reviewIds.length) return new Set();
        const { data: entities, error: entErr } = await supabase
            .from('entities')
            .select('id, entity_uuid')
            .eq('entity_type', 'review')
            .in('entity_uuid', reviewIds);
        if (entErr || !entities?.length) return new Set();
        const reviewIdByEntityId = new Map<string, string>();
        const entityIds: string[] = [];
        for (const e of entities) {
            if (e.entity_uuid) {
                reviewIdByEntityId.set(e.id, e.entity_uuid);
                entityIds.push(e.id);
            }
        }
        if (!entityIds.length) return new Set();
        const { data: engagements, error: engErr } = await supabase
            .from('engagements')
            .select('entity_id')
            .eq('user_id', viewerId)
            .eq('engagement_type', 'like')
            .in('entity_id', entityIds);
        if (engErr) throw engErr;
        const liked = new Set<string>();
        for (const row of engagements || []) {
            const rid = reviewIdByEntityId.get(row.entity_id);
            if (rid) liked.add(rid);
        }
        return liked;
    }

    static async likeReview(userId: string, reviewId: string): Promise<void> {
        const { data: entityId, error: entityError } = await supabase.rpc('get_or_create_entity', {
            p_entity_type: 'review',
            p_entity_uuid: reviewId,
            p_entity_text_id: null,
        });

        if (entityError) throw entityError;
        if (entityId == null) throw new Error('get_or_create_entity returned no id');

        const { data: existingLike, error: checkError } = await supabase
            .from('engagements')
            .select('id')
            .eq('user_id', userId)
            .eq('entity_id', entityId)
            .eq('engagement_type', 'like')
            .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') throw checkError;
        if (existingLike) return;

        const { error } = await supabase.from('engagements').insert({
            user_id: userId,
            entity_id: entityId,
            engagement_type: 'like',
        });

        if (error) {
            if (error.code === '23505') return;
            throw error;
        }
    }

    static async unlikeReview(userId: string, reviewId: string): Promise<void> {
        const { data: entityData, error: entityError } = await supabase
            .from('entities')
            .select('id')
            .eq('entity_type', 'review')
            .eq('entity_uuid', reviewId)
            .maybeSingle();

        if (entityError && (entityError as { code?: string }).code !== 'PGRST116') throw entityError;
        if (!entityData?.id) return;

        const { error } = await supabase
            .from('engagements')
            .delete()
            .eq('user_id', userId)
            .eq('entity_id', entityData.id)
            .eq('engagement_type', 'like');

        if (error) throw error;
    }

    static async toggleHelpful(userId: string, reviewId: string, currentlyLiked: boolean): Promise<void> {
        if (currentlyLiked) {
            await ReviewEngagementService.unlikeReview(userId, reviewId);
        } else {
            await ReviewEngagementService.likeReview(userId, reviewId);
        }
    }
}
