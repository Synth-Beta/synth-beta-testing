import { supabase } from '../integrations/supabase/client';

export interface NetworkEvent {
    id: string;
    title: string;
    artist_name: string;
    venue_name: string;
    event_date: string;
    image_url?: string;
    friend_id: string;
    friend_name: string;
    friend_avatar?: string;
    action_type: 'going' | 'interested' | 'reviewed';
}

export interface TrendingEvent {
    id: string;
    title: string;
    artist_name: string;
    venue_name: string;
    event_date: string;
    image_url?: string;
    trending_score: number;
    interest_count: number;
}

export class HomeFeedService {
    /**
     * Get events attended/interested by friends (1st degree)
     */
    static async getNetworkEvents(userId: string): Promise<NetworkEvent[]> {
        try {
            // 1. Get friends
            const { data: friends } = await supabase
                .from('user_relationships')
                .select('related_user_id')
                .eq('user_id', userId)
                .eq('status', 'accepted')
                .eq('relationship_type', 'friend');

            if (!friends || friends.length === 0) return [];

            const friendIds = friends.map(f => f.related_user_id);

            // 2. Get event relations for these friends
            const { data: relations, error } = await supabase
                .from('user_event_relationships')
                .select(`
          event_id,
          relationship_type,
          user_id,
          users:user_id (
            name,
            avatar_url
          ),
          events:event_id (
            title,
            artist_name,
            venue_name,
            event_date,
            images
          )
        `)
                .in('user_id', friendIds)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;

            return (relations || []).map((rel: any) => ({
                id: rel.event_id,
                title: rel.events?.title || '',
                artist_name: rel.events?.artist_name || '',
                venue_name: rel.events?.venue_name || '',
                event_date: rel.events?.event_date || '',
                image_url: rel.events?.images?.[0]?.url || undefined,
                friend_id: rel.user_id,
                friend_name: rel.users?.name || 'Someone',
                friend_avatar: rel.users?.avatar_url || undefined,
                action_type: rel.relationship_type === 'attending' ? 'going' : 'interested',
            }));
        } catch (error) {
            console.error('Error fetching network events:', error);
            return [];
        }
    }

    /**
     * Get trending events based on overall platform engagement
     */
    static async getTrendingEvents(): Promise<TrendingEvent[]> {
        try {
            const { data, error } = await supabase
                .from('events')
                .select('*, user_event_relationships(count)')
                .order('event_date', { ascending: true })
                .gte('event_date', new Date().toISOString())
                .limit(10);

            if (error) throw error;

            return (data || []).map((event: any) => ({
                id: event.id,
                title: event.title,
                artist_name: event.artist_name,
                venue_name: event.venue_name,
                event_date: event.event_date,
                image_url: event.images?.[0]?.url || undefined,
                trending_score: (event.user_event_relationships?.[0]?.count || 0) * 10,
                interest_count: (event.user_event_relationships?.[0]?.count || 0),
            }));
        } catch (error) {
            console.error('Error fetching trending events:', error);
            return [];
        }
    }
}
