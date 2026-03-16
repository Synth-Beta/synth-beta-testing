import { supabase } from './supabase';

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
            .order('popularity', { ascending: false })
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
            .order('popularity', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error searching artists:', error);
            return [];
        }

        return data || [];
    }
}
