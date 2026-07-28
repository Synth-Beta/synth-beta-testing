import { supabase } from '../integrations/supabase/client';

export interface Artist {
    id: string;
    name: string;
    image_url?: string;
    genres?: string[];
}

export class ArtistService {
    static async getSuggestedArtists(limit = 20): Promise<Artist[]> {
        const { data, error } = await supabase
            .from('artists')
            .select('id, name, image_url, genres')
            // `artists` has no `popularity` column — ordering by it made every
            // call here fail silently (caught below, returns []), which is why
            // onboarding's artist search showed no results for anything.
            // num_upcoming_events is the closest real signal for "worth
            // suggesting" in a concert app.
            .order('num_upcoming_events', { ascending: false, nullsFirst: false })
            .limit(limit);

        if (error) {
            console.error('Error fetching suggested artists:', error);
            return [];
        }

        return data || [];
    }

    static async searchArtists(query: string, limit = 20): Promise<Artist[]> {
        const { data, error } = await supabase
            .from('artists')
            .select('id, name, image_url, genres')
            .ilike('name', `%${query}%`)
            // `artists` has no `popularity` column — ordering by it made every
            // call here fail silently (caught below, returns []), which is why
            // onboarding's artist search showed no results for anything.
            // num_upcoming_events is the closest real signal for "worth
            // suggesting" in a concert app.
            .order('num_upcoming_events', { ascending: false, nullsFirst: false })
            .limit(limit);

        if (error) {
            console.error('Error searching artists:', error);
            return [];
        }

        return data || [];
    }
}
