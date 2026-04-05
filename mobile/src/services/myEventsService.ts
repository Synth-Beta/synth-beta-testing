import { supabase } from '../integrations/supabase/client';

export interface MyReviewListItem {
    id: string;
    rating: number | null;
    review_text: string | null;
    was_there?: boolean | null;
    created_at: string;
    event_id: string | null;
    rank_order: number | null;
    title: string;
    artist_name: string;
    venue_name: string;
    event_date: string;
    image_url?: string;
}

export interface InterestedEventItem {
    event_id: string;
    title: string;
    artist_name: string;
    venue_name: string;
    event_date: string;
    image_url?: string;
}

/** Web-aligned unreviewed queue: attendance-marker reviews + eligible drafts. */
export type ProfileUnreviewedItem =
    | {
          kind: 'attendance_marker';
          reviewId: string;
          event_id: string;
          title: string;
          artist_name: string;
          venue_name: string;
          event_date: string;
          image_url?: string;
          sortDate: string;
      }
    | {
          kind: 'draft';
          reviewId: string;
          event_id: string | null;
          title: string;
          artist_name: string;
          venue_name: string;
          event_date: string;
          image_url?: string;
          sortDate: string;
      };

function includeInPublishedReviewsList(r: {
    was_there?: boolean | null;
    review_text?: string | null;
}): boolean {
    if (r.was_there === true) return true;
    if (r.review_text && r.review_text !== 'ATTENDANCE_ONLY') return true;
    return false;
}

export class MyEventsService {
    static async getMyReviews(userId: string): Promise<MyReviewListItem[]> {
        const { data, error } = await supabase
            .from('reviews')
            .select(
                `
        id,
        rating,
        review_text,
        was_there,
        created_at,
        event_id,
        rank_order,
        events (
          id,
          title,
          artist_name,
          venue_name,
          event_date,
          images
        )
      `
            )
            .eq('user_id', userId)
            .eq('is_draft', false)
            .order('created_at', { ascending: false });

        if (error) {
            console.warn('[myEvents] getMyReviews', error);
            return [];
        }

        return (data || [])
            .filter((r: any) => includeInPublishedReviewsList(r))
            .map((r: any) => {
                const ev = r.events;
                return {
                    id: r.id,
                    rating: r.rating,
                    review_text: r.review_text,
                    was_there: r.was_there ?? null,
                    created_at: r.created_at,
                    event_id: r.event_id,
                    rank_order: r.rank_order ?? null,
                    title: ev?.title || ev?.artist_name || 'Event',
                    artist_name: ev?.artist_name || '',
                    venue_name: ev?.venue_name || '',
                    event_date: ev?.event_date || '',
                    image_url: ev?.images?.[0]?.url,
                };
            });
    }

    static async countDraftReviews(userId: string): Promise<number> {
        const { count, error } = await supabase
            .from('reviews')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_draft', true);
        if (error) {
            console.warn('[myEvents] countDraftReviews', error.message);
            return 0;
        }
        return count ?? 0;
    }

    static async getInterestedEvents(userId: string): Promise<InterestedEventItem[]> {
        const { data, error } = await supabase
            .from('user_event_relationships')
            .select(
                `
        event_id,
        events (
          id,
          title,
          artist_name,
          venue_name,
          event_date,
          images
        )
      `
            )
            .eq('user_id', userId)
            .eq('relationship_type', 'interested')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            console.warn('[myEvents] getInterestedEvents', error);
            return [];
        }

        return (data || [])
            .map((row: any) => {
                const ev = row.events;
                if (!ev?.id) return null;
                return {
                    event_id: ev.id,
                    title: ev.title || ev.artist_name || 'Event',
                    artist_name: ev.artist_name || '',
                    venue_name: ev.venue_name || '',
                    event_date: ev.event_date || '',
                    image_url: ev.images?.[0]?.url,
                };
            })
            .filter(Boolean) as InterestedEventItem[];
    }

    /**
     * Matches web ProfileView “Unreviewed”: `review_text === 'ATTENDANCE_ONLY'` published rows
     * plus draft reviews without a completed review on the same `event_id`.
     */
    static async getProfileUnreviewedQueue(userId: string): Promise<ProfileUnreviewedItem[]> {
        const { data: completedRows } = await supabase
            .from('reviews')
            .select('event_id')
            .eq('user_id', userId)
            .eq('is_draft', false)
            .not('review_text', 'is', null)
            .neq('review_text', 'ATTENDANCE_ONLY');

        const completedEventIds = new Set(
            (completedRows || [])
                .map((r: { event_id: string | null }) => r.event_id)
                .filter(Boolean) as string[]
        );

        const [{ data: markers, error: mErr }, { data: draftRows, error: dErr }] = await Promise.all([
            supabase
                .from('reviews')
                .select(
                    `
          id,
          event_id,
          updated_at,
          events (
            id,
            title,
            artist_name,
            venue_name,
            event_date,
            images
          )
        `
                )
                .eq('user_id', userId)
                .eq('is_draft', false)
                .eq('review_text', 'ATTENDANCE_ONLY')
                .order('updated_at', { ascending: false })
                .limit(500),
            supabase
                .from('reviews')
                .select(
                    `
          id,
          event_id,
          updated_at,
          created_at,
          events (
            id,
            title,
            artist_name,
            venue_name,
            event_date,
            images
          )
        `
                )
                .eq('user_id', userId)
                .eq('is_draft', true)
                .order('updated_at', { ascending: false })
                .limit(500),
        ]);

        if (mErr) console.warn('[myEvents] attendance markers', mErr.message);
        if (dErr) console.warn('[myEvents] drafts', dErr.message);

        const items: ProfileUnreviewedItem[] = [];

        for (const r of markers || []) {
            const ev = (r as any).events;
            const eventId = (r as any).event_id as string | null;
            if (!eventId || !ev?.id) continue;
            const sortDate = String(ev.event_date || (r as any).updated_at || '');
            items.push({
                kind: 'attendance_marker',
                reviewId: (r as any).id,
                event_id: eventId,
                title: ev.title || ev.artist_name || 'Event',
                artist_name: ev.artist_name || '',
                venue_name: ev.venue_name || '',
                event_date: ev.event_date || '',
                image_url: ev.images?.[0]?.url,
                sortDate,
            });
        }

        for (const r of draftRows || []) {
            const ev = (r as any).events;
            const eventId = (r as any).event_id as string | null;
            if (eventId && completedEventIds.has(eventId)) continue;

            const sortDate = String(
                ev?.event_date || (r as any).updated_at || (r as any).created_at || ''
            );
            const title = ev?.title || ev?.artist_name || 'Continue review';
            items.push({
                kind: 'draft',
                reviewId: (r as any).id,
                event_id: eventId,
                title,
                artist_name: ev?.artist_name || '',
                venue_name: ev?.venue_name || '',
                event_date: ev?.event_date || '',
                image_url: ev?.images?.[0]?.url,
                sortDate,
            });
        }

        items.sort((a, b) => (b.sortDate || '').localeCompare(a.sortDate || ''));
        return items;
    }
}
