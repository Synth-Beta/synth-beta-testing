import { supabase } from '../integrations/supabase/client';

export interface PassportEntry {
    id: string;
    type: 'review' | 'milestone' | 'unlock';
    title: string;
    subtitle: string;
    date: string;
    image_url?: string;
    rating?: number;
}

export interface ProfileStats {
    concert_count: number;
    artist_count: number;
    venue_count: number;
    friend_count: number;
}

export class PassportService {
    /**
     * Get user's concert timeline
     */
    static async getTimeline(userId: string): Promise<PassportEntry[]> {
        try {
            // 1. Get reviews as primary timeline events
            const { data: reviews, error } = await supabase
                .from('reviews')
                .select(`
          id,
          rating,
          review_text,
          created_at,
          entity_id,
          events:entity_id (
            title,
            artist_name,
            venue_name,
            event_date,
            images
          )
        `)
                .eq('user_id', userId)
                .eq('entity_type', 'event')
                .order('created_at', { ascending: false });

            if (error) throw error;

            return (reviews || []).map((rev: any) => ({
                id: rev.id,
                type: 'review',
                title: rev.events?.artist_name || 'Concert',
                subtitle: `${rev.events?.venue_name || 'Venue'} • ${rev.rating} stars`,
                date: rev.events?.event_date || rev.created_at,
                image_url: rev.events?.images?.[0]?.url || undefined,
                rating: rev.rating,
            }));
        } catch (error) {
            console.error('Error fetching timeline:', error);
            return [];
        }
    }

    /**
     * Get summary stats for profile
     */
    static async getProfileStats(userId: string): Promise<ProfileStats> {
        try {
            const { count: concertCount } = await supabase
                .from('user_event_relationships')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('relationship_type', 'going');

            const { count: friendCount } = await supabase
                .from('user_relationships')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('status', 'accepted');

            // Simplified for demo - in real app would use RPC or dedicated summary table
            return {
                concert_count: concertCount || 0,
                artist_count: 0,
                venue_count: 0,
                friend_count: friendCount || 0,
            };
        } catch (error) {
            console.error('Error fetching profile stats:', error);
            return { concert_count: 0, artist_count: 0, venue_count: 0, friend_count: 0 };
        }
    }
}
