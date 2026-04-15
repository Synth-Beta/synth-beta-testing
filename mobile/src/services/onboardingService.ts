import { supabase } from '../integrations/supabase/client';

export interface OnboardingData {
    genres: string[];
    artistIds: string[];
    venueIds: string[];
}

export class OnboardingService {
    /**
     * Read onboarding flag from `users` (auth `user_id`). Used on cold start when
     * AsyncStorage was cleared but Supabase session remains (e.g. reinstall).
     */
    static async isOnboardingCompletedInProfile(userId: string): Promise<boolean> {
        const { data, error } = await supabase
            .from('users')
            .select('onboarding_completed')
            .eq('user_id', userId)
            .maybeSingle();

        if (error) throw error;
        return data?.onboarding_completed === true;
    }

    /**
     * Mark onboarding as complete in Supabase and AsyncStorage
     */
    static async completeOnboarding(userId: string): Promise<void> {
        try {
            const { error } = await supabase
                .from('users')
                .update({
                    onboarding_completed: true,
                    updated_at: new Date().toISOString(),
                })
                .eq('user_id', userId);

            if (error) console.warn('Failed to update onboarding_completed in Supabase:', error);
        } catch (error) {
            console.error('Error completing onboarding:', error);
        }
    }

    /**
     * Save genre preferences to user_preference_signals
     */
    static async saveGenres(userId: string, genres: string[]): Promise<void> {
        if (!genres.length) return;

        try {
            const now = new Date().toISOString();
            const signals = genres.map(genre => ({
                user_id: userId,
                signal_type: 'genre_manual_preference',
                entity_type: 'genre',
                genre: genre.toLowerCase().trim(),
                signal_weight: 1.0,
                context: { source: 'onboarding' },
                occurred_at: now,
            }));

            const { error } = await supabase.from('user_preference_signals').insert(signals);
            if (error) throw error;
        } catch (error) {
            console.warn('Silent fail: Error saving genres:', error);
        }
    }

    /**
     * Follow artists in artist_follows
     */
    static async followArtists(userId: string, artistIds: string[]): Promise<void> {
        if (!artistIds.length) return;

        try {
            const follows = artistIds.map(artistId => ({
                user_id: userId,
                artist_id: artistId,
            }));

            const { error } = await supabase.from('artist_follows').insert(follows);
            if (error && error.code !== '23505') throw error; // Ignore duplicates
        } catch (error) {
            console.warn('Silent fail: Error following artists:', error);
        }
    }

    /**
     * Save profile setup (username, birthday, city, gender, bio, name).
     * Also computes is_minor and auto-enables parental_controls for under-18.
     */
    static async saveProfileSetup(userId: string, data: {
        name?: string;
        username?: string;
        birthday?: string; // YYYY-MM-DD
        location_city?: string;
        gender?: string;
        bio?: string;
    }): Promise<void> {
        try {
            let isMinor = false;
            if (data.birthday) {
                const birthDate = new Date(data.birthday);
                const today = new Date();
                let age = today.getFullYear() - birthDate.getFullYear();
                const m = today.getMonth() - birthDate.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
                isMinor = age < 18;
            }

            const update: Record<string, unknown> = {
                updated_at: new Date().toISOString(),
            };
            if (data.name !== undefined) update.name = data.name;
            if (data.username !== undefined) update.username = data.username;
            if (data.birthday !== undefined) {
                update.birthday = data.birthday;
                update.age_verified = false;
                update.is_minor = isMinor;
                update.parental_controls_enabled = isMinor;
            }
            if (data.location_city !== undefined) update.location_city = data.location_city;
            if (data.gender !== undefined) update.gender = data.gender;
            if (data.bio !== undefined) update.bio = data.bio;

            const { error } = await supabase
                .from('users')
                .update(update)
                .eq('user_id', userId);

            if (error) console.warn('[OnboardingService] saveProfileSetup error:', error.message);
        } catch (e) {
            console.warn('[OnboardingService] saveProfileSetup failed:', e);
        }
    }

    /**
     * Follow venues in user_venue_relationships
     */
    static async followVenues(userId: string, venueIds: string[]): Promise<void> {
        if (!venueIds.length) return;

        try {
            const follows = venueIds.map(venueId => ({
                user_id: userId,
                venue_id: venueId,
            }));

            const { error } = await supabase.from('user_venue_relationships').insert(follows);
            if (error && error.code !== '23505') throw error; // Ignore duplicates
        } catch (error) {
            console.warn('Silent fail: Error following venues:', error);
        }
    }
}
