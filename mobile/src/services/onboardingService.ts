import { supabase } from '../integrations/supabase/client';
import type { AcquisitionSource } from '@synth/shared';

export interface OnboardingData {
    genres: string[];
    artistIds: string[];
    venueIds: string[];
}

export class OnboardingService {
    private static async ensureUserExists(userId: string): Promise<void> {
        const {
            data: { user: authUser },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
            throw authError;
        }
        if (!authUser) {
            throw new Error('Authenticated user not found');
        }
        if (authUser.id !== userId) {
            throw new Error('Authenticated user does not match onboarding user');
        }

        const { data, error } = await supabase.rpc('ensure_public_user');
        if (error) {
            throw error;
        }

        const row = Array.isArray(data) ? data[0] : data;
        const reportedError = (row as { error?: string | null } | null)?.error;
        if (reportedError) {
            throw new Error(reportedError);
        }
    }

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
        await OnboardingService.ensureUserExists(userId);

        const now = new Date().toISOString();
        const { data, error } = await supabase
            .from('users')
            .upsert(
                {
                    user_id: userId,
                    onboarding_completed: true,
                    onboarding_skipped: false,
                    updated_at: now,
                },
                { onConflict: 'user_id' }
            )
            .select('onboarding_completed')
            .maybeSingle();

        if (error) {
            throw error;
        }
        if (!data || data.onboarding_completed !== true) {
            throw new Error('Failed to persist onboarding completion');
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
        acquisition_source?: AcquisitionSource | null;
        other_acquisition_source?: string | null;
        contact_email?: string | null;
    }): Promise<void> {
        await OnboardingService.ensureUserExists(userId);

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
            user_id: userId,
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
        if (data.acquisition_source !== undefined) update.acquisition_source = data.acquisition_source;
        if (data.other_acquisition_source !== undefined) update.other_acquisition_source = data.other_acquisition_source;
        if (data.contact_email !== undefined) update.contact_email = data.contact_email;

        const { error } = await supabase
            .from('users')
            .upsert(update, { onConflict: 'user_id' });

        if (error) {
            throw error;
        }
    }

    /**
     * Targeted update for the existing-user "contact email required" retrofit gate.
     * Does not touch any other profile field, unlike saveProfileSetup.
     */
    static async updateContactEmail(userId: string, email: string): Promise<boolean> {
        const { error } = await supabase
            .from('users')
            .update({ contact_email: email, updated_at: new Date().toISOString() })
            .eq('user_id', userId);
        if (error) {
            console.warn('Error updating contact email:', error);
            return false;
        }
        return true;
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
