import { supabase } from '../integrations/supabase/client';

export interface UserSettingsPreferences {
    id: string;
    user_id: string;
    enable_push_notifications: boolean;
    enable_emails: boolean;
    is_public_profile: boolean;
    created_at: string;
    updated_at: string;
}

export interface UpdateUserSettingsPreferences {
    enable_push_notifications?: boolean;
    enable_emails?: boolean;
    is_public_profile?: boolean;
}

export async function getUserSettingsPreferences(userId: string): Promise<UserSettingsPreferences | null> {
    try {
        const { data, error } = await supabase.from('user_settings_preferences').select('*').eq('user_id', userId).single();

        if (error) {
            if (error.code === 'PGRST116') {
                return await createUserSettingsPreferences(userId);
            }
            console.error('Error fetching user settings preferences:', error);
            throw error;
        }

        return data;
    } catch (error) {
        console.error('Failed to get user settings preferences:', error);
        return null;
    }
}

export async function getCurrentUserSettingsPreferences(): Promise<UserSettingsPreferences | null> {
    try {
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            throw new Error('No authenticated user');
        }

        return await getUserSettingsPreferences(user.id);
    } catch (error) {
        console.error('Failed to get current user settings preferences:', error);
        return null;
    }
}

export async function updateUserSettingsPreferences(
    userId: string,
    preferences: UpdateUserSettingsPreferences
): Promise<UserSettingsPreferences | null> {
    try {
        await ensureUserSettingsPreferencesExist(userId);

        const { data, error } = await supabase
            .from('user_settings_preferences')
            .update(preferences)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) {
            console.error('Error updating user settings preferences:', error);
            throw error;
        }

        return data;
    } catch (error) {
        console.error('Failed to update user settings preferences:', error);
        return null;
    }
}

export async function updateCurrentUserSettingsPreferences(
    preferences: UpdateUserSettingsPreferences
): Promise<UserSettingsPreferences | null> {
    try {
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            throw new Error('No authenticated user');
        }

        return await updateUserSettingsPreferences(user.id, preferences);
    } catch (error) {
        console.error('Failed to update current user settings preferences:', error);
        return null;
    }
}

export async function createUserSettingsPreferences(userId: string): Promise<UserSettingsPreferences | null> {
    try {
        const { data, error } = await supabase
            .from('user_settings_preferences')
            .insert({
                user_id: userId,
                enable_push_notifications: true,
                enable_emails: true,
                is_public_profile: true,
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating user settings preferences:', error);
            throw error;
        }

        return data;
    } catch (error) {
        console.error('Failed to create user settings preferences:', error);
        return null;
    }
}

export async function ensureUserSettingsPreferencesExist(userId: string): Promise<UserSettingsPreferences | null> {
    try {
        let preferences = await getUserSettingsPreferences(userId);

        if (!preferences) {
            preferences = await createUserSettingsPreferences(userId);
        }

        return preferences;
    } catch (error) {
        console.error('Failed to ensure user settings preferences exist:', error);
        return null;
    }
}
