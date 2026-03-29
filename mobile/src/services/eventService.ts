import { supabase } from '../integrations/supabase/client';

export interface EventDetail {
    id: string;
    artist_id?: string | null;
    venue_id?: string | null;
    title: string;
    artist_name: string;
    venue_name: string;
    event_date: string;
    description?: string;
    image_url?: string;
    venue_city?: string;
    venue_address?: string;
    ticket_url?: string;
}

export interface FriendAttending {
    id: string;
    name: string;
    avatar_url?: string;
}

export class EventService {
    /**
     * Get detailed event info
     */
    static async getEventById(eventId: string): Promise<EventDetail | null> {
        try {
            const { data, error } = await supabase
                .from('events')
                .select(`
          *,
          artists(name, images),
          venues(name, city, address)
        `)
                .eq('id', eventId)
                .maybeSingle();

            if (error || !data) return null;

            return {
                id: data.id,
                artist_id: data.artist_id ?? data.artist_uuid ?? null,
                venue_id: data.venue_id ?? data.venue_uuid ?? null,
                title: data.title,
                artist_name: data.artists?.name || data.artist_name || '',
                venue_name: data.venues?.name || data.venue_name || '',
                event_date: data.event_date,
                description: data.description,
                image_url: data.images?.[0]?.url || data.artists?.images?.[0]?.url || undefined,
                venue_city: data.venues?.city || data.venue_city,
                venue_address: data.venues?.address || data.venue_address,
                ticket_url: data.ticket_urls?.[0],
            };
        } catch (error) {
            console.error('Error fetching event detail:', error);
            return null;
        }
    }

    /**
     * Get friends who are going to this event
     */
    static async getFriendsAttending(eventId: string, userId: string): Promise<FriendAttending[]> {
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

            // 2. Get subset of friends going to this event
            const { data: attending, error } = await supabase
                .from('user_event_relationships')
                .select(`
          user_id,
          users:user_id (
            name,
            avatar_url
          )
        `)
                .eq('event_id', eventId)
                .eq('relationship_type', 'going')
                .in('user_id', friendIds);

            if (error) throw error;

            return (attending || []).map((rel: any) => ({
                id: rel.user_id,
                name: rel.users?.name || 'Friend',
                avatar_url: rel.users?.avatar_url || undefined,
            }));
        } catch (error) {
            console.error('Error fetching friends attending:', error);
            return [];
        }
    }

    /**
     * Set user interaction (going/interested)
     */
    static async toggleInteraction(userId: string, eventId: string, type: 'going' | 'interested'): Promise<boolean> {
        try {
            // Check current
            const { data: existing } = await supabase
                .from('user_event_relationships')
                .select('*')
                .eq('user_id', userId)
                .eq('event_id', eventId)
                .maybeSingle();

            if (existing && existing.relationship_type === type) {
                // Remove if same
                const { error } = await supabase
                    .from('user_event_relationships')
                    .delete()
                    .eq('user_id', userId)
                    .eq('event_id', eventId);
                return !error;
            } else {
                // Upsert new
                const { error } = await supabase
                    .from('user_event_relationships')
                    .upsert({
                        user_id: userId,
                        event_id: eventId,
                        relationship_type: type,
                        updated_at: new Date().toISOString(),
                    }, { onConflict: 'user_id,event_id' });
                return !error;
            }
        } catch (error) {
            console.error('Error toggling event interaction:', error);
            return false;
        }
    }
}
