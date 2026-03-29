import { supabase } from '../integrations/supabase/client';

export async function uploadReviewPhotoFromUri(userId: string, localUri: string): Promise<string | null> {
    try {
        const res = await fetch(localUri);
        const blob = await res.blob();
        const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
        const { data, error } = await supabase.storage.from('review-photos').upload(path, blob, {
            contentType: blob.type || 'image/jpeg',
            upsert: false,
        });
        if (error || !data) {
            console.warn('[reviewPhotoUpload]', error);
            return null;
        }
        const { data: pub } = supabase.storage.from('review-photos').getPublicUrl(data.path);
        return pub?.publicUrl ?? null;
    } catch (e) {
        console.warn('[reviewPhotoUpload]', e);
        return null;
    }
}
