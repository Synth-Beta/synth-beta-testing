import { supabase } from '../integrations/supabase/client';

/**
 * Uploads a profile avatar to Supabase storage and returns the public URL.
 */
export async function uploadProfileAvatarFromUri(userId: string, localUri: string): Promise<string | null> {
    try {
        const response = await fetch(localUri);
        const blob = await response.blob();
        const extension = blob.type?.split('/')[1]?.split(';')[0] || 'jpg';
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
        const path = `${userId}/${filename}`;

        const { data, error } = await supabase.storage.from('profile-avatars').upload(path, blob, {
            cacheControl: '3600',
            contentType: blob.type || 'image/jpeg',
            upsert: false,
        });

        if (error || !data) {
            console.warn('[profileAvatarUpload] upload failed', error);
            return null;
        }

        const { data: publicData } = supabase.storage.from('profile-avatars').getPublicUrl(data.path);
        return publicData?.publicUrl ?? null;
    } catch (error) {
        console.warn('[profileAvatarUpload] error', error);
        return null;
    }
}
