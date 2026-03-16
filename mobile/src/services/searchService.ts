import { supabase } from '../integrations/supabase/client';

export interface SearchResult {
    id: string;
    title: string;
    artist_name: string;
    venue_name: string;
    event_date: string;
    image_url?: string;
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
}
