import { supabase } from '../integrations/supabase/client';

export interface MyReviewListItem {
    id: string;
    rating: number | null;
    review_text: string | null;
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

export class MyEventsService {
    static async getMyReviews(userId: string): Promise<MyReviewListItem[]> {
        const { data, error } = await supabase
            .from('reviews')
            .select(
                `
        id,
        rating,
        review_text,
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
            .not('review_text', 'is', null)
            .neq('review_text', 'ATTENDANCE_ONLY')
            .order('created_at', { ascending: false });

        if (error) {
            console.warn('[myEvents] getMyReviews', error);
            return [];
        }

        return (data || []).map((r: any) => {
            const ev = r.events;
            return {
                id: r.id,
                rating: r.rating,
                review_text: r.review_text,
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

    static async getUnreviewedPastAttended(userId: string): Promise<InterestedEventItem[]> {
        const { data: rel, error: relErr } = await supabase
            .from('user_event_relationships')
            .select('event_id')
            .eq('user_id', userId)
            .in('relationship_type', ['attending', 'maybe']);

        if (relErr || !rel?.length) return [];

        const eventIds = [...new Set(rel.map((r: { event_id: string }) => r.event_id))];

        const { data: revs } = await supabase
            .from('reviews')
            .select('event_id')
            .eq('user_id', userId)
            .eq('is_draft', false)
            .in('event_id', eventIds);

        const reviewed = new Set((revs || []).map((r: { event_id: string }) => r.event_id));
        const candidates = eventIds.filter(id => !reviewed.has(id));
        if (candidates.length === 0) return [];

        const { data: events, error } = await supabase
            .from('events')
            .select('id, title, artist_name, venue_name, event_date, images')
            .in('id', candidates)
            .lt('event_date', new Date().toISOString())
            .order('event_date', { ascending: false })
            .limit(40);

        if (error) return [];

        return (events || []).map((ev: any) => ({
            event_id: ev.id,
            title: ev.title || ev.artist_name || 'Event',
            artist_name: ev.artist_name || '',
            venue_name: ev.venue_name || '',
            event_date: ev.event_date || '',
            image_url: ev.images?.[0]?.url,
        }));
    }
}
