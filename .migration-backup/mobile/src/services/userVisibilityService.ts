import { supabase } from '../integrations/supabase/client';

export class UserVisibilityService {
    static async getUserVisibilitySettings(userId: string): Promise<{
        has_avatar: boolean;
        is_public_profile: boolean;
        last_active_at: string;
    } | null> {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('avatar_url, is_public_profile, last_active_at')
                .eq('user_id', userId)
                .single();

            if (error) {
                console.error('Error fetching visibility settings:', error);
                return null;
            }

            return {
                has_avatar: !!data?.avatar_url,
                is_public_profile: data?.is_public_profile ?? true,
                last_active_at: data?.last_active_at || new Date().toISOString(),
            };
        } catch (error) {
            console.error('Failed to fetch visibility settings:', error);
            return null;
        }
    }

    static async setProfileVisibility(userId: string, isPublic: boolean): Promise<boolean> {
        try {
            const { error } = await supabase.from('users').update({ is_public_profile: isPublic }).eq('user_id', userId);

            if (error) {
                console.error('Error updating profile visibility:', error);
                return false;
            }

            return true;
        } catch (error) {
            console.error('Failed to update profile visibility:', error);
            return false;
        }
    }

    static async hasProfilePicture(userId: string): Promise<boolean> {
        try {
            const { data, error } = await supabase.from('users').select('avatar_url').eq('user_id', userId).single();

            if (error) {
                console.error('Error checking profile picture:', error);
                return false;
            }

            return !!(data?.avatar_url && data.avatar_url.trim() !== '');
        } catch (error) {
            console.error('Failed to check profile picture:', error);
            return false;
        }
    }
}
