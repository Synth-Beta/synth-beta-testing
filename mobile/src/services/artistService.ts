import { supabase } from '../integrations/supabase/client';
import { searchArtistsFuzzy } from '@synth/shared';

export interface Artist {
    id: string;
    name: string;
    image_url?: string;
    genres?: string[];
    /** Onboarding: the server's pick to start checked (first 3). */
    preselected?: boolean;
}

export class ArtistService {
    /**
     * Artist step list (onboarding_suggested_artists): streaming top artists, then artists
     * playing nearby, then nationally; first 3 flagged preselected. Falls back to the plain
     * suggested list so the step always has something to offer.
     */
    static async getOnboardingSuggestions(limit = 12): Promise<Artist[]> {
        const { data, error } = await supabase.rpc('onboarding_suggested_artists', { p_limit: limit });
        if (!error && Array.isArray(data) && data.length > 0) {
            return data.map((a: { id: string; name: string; image_url: string | null; preselected: boolean }) => ({
                id: a.id,
                name: a.name,
                image_url: a.image_url ?? undefined,
                preselected: a.preselected,
            }));
        }
        if (error) console.warn('onboarding_suggested_artists failed, using fallback:', error.message);
        return ArtistService.getSuggestedArtists(limit);
    }

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
        try {
            const rows = await searchArtistsFuzzy(supabase, query, limit);
            return rows.map(row => ({
                id: row.id,
                name: row.name,
                image_url: row.image_url ?? undefined,
                genres: row.genres ?? undefined,
            }));
        } catch (error) {
            console.error('Error searching artists:', error);
            return [];
        }
    }
}
