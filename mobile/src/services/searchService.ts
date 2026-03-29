import { supabase } from '../integrations/supabase/client';

export interface SearchResult {
    id: string;
    title: string;
    artist_name: string;
    venue_name: string;
    event_date: string;
    image_url?: string;
}

export type SearchScope = 'events' | 'artists' | 'venues' | 'users';

export interface ArtistSearchRow {
    id: string;
    name: string;
    image_url?: string;
}

export interface VenueSearchRow {
    id: string;
    name: string;
    city?: string | null;
}

export interface UserSearchRow {
    user_id: string;
    name: string | null;
    username: string | null;
    avatar_url?: string | null;
}

export class SearchService {
    static async searchEvents(keyword: string): Promise<SearchResult[]> {
        try {
            if (!keyword) return [];

            const { data, error } = await supabase
                .from('events')
                .select('*')
                .or(`artist_name.ilike.%${keyword}%,title.ilike.%${keyword}%,venue_name.ilike.%${keyword}%`)
                .gte('event_date', new Date().toISOString())
                .order('event_date', { ascending: true })
                .limit(20);

            if (error) throw error;

            return (data || []).map(event => ({
                id: event.id,
                title: event.title,
                artist_name: event.artist_name,
                venue_name: event.venue_name,
                event_date: event.event_date,
                image_url: event.images?.[0]?.url || undefined,
            }));
        } catch (error) {
            console.error('Error searching events:', error);
            return [];
        }
    }

    static async getEventsByDateRange(start: string, end: string): Promise<SearchResult[]> {
        try {
            const { data, error } = await supabase
                .from('events')
                .select('*')
                .gte('event_date', start)
                .lte('event_date', end)
                .order('event_date', { ascending: true });

            if (error) throw error;

            return (data || []).map(event => ({
                id: event.id,
                title: event.title,
                artist_name: event.artist_name,
                venue_name: event.venue_name,
                event_date: event.event_date,
                image_url: event.images?.[0]?.url || undefined,
            }));
        } catch (error) {
            console.error('Error fetching calendar events:', error);
            return [];
        }
    }

    static async searchArtists(keyword: string, limit = 20): Promise<ArtistSearchRow[]> {
        if (!keyword.trim()) return [];
        try {
            const q = keyword.trim();
            const { data, error } = await supabase
                .from('artists')
                .select('id, name, image_url')
                .ilike('name', `%${q}%`)
                .limit(limit);
            if (error) throw error;
            return (data || []) as ArtistSearchRow[];
        } catch (e) {
            console.error('searchArtists', e);
            return [];
        }
    }

    static async searchVenues(keyword: string, limit = 20): Promise<VenueSearchRow[]> {
        if (!keyword.trim()) return [];
        try {
            const q = keyword.trim();
            const { data, error } = await supabase
                .from('venues')
                .select('id, name, city')
                .ilike('name', `%${q}%`)
                .limit(limit);
            if (error) throw error;
            return (data || []) as VenueSearchRow[];
        } catch (e) {
            console.error('searchVenues', e);
            return [];
        }
    }

    static async searchUsers(keyword: string, limit = 20): Promise<UserSearchRow[]> {
        if (!keyword.trim()) return [];
        try {
            const q = keyword.trim();
            const { data, error } = await supabase
                .from('users')
                .select('user_id, name, username, avatar_url')
                .or(`name.ilike.%${q}%,username.ilike.%${q}%`)
                .limit(limit);
            if (error) throw error;
            return (data || []) as UserSearchRow[];
        } catch (e) {
            console.error('searchUsers', e);
            return [];
        }
    }
}
