import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../integrations/supabase/client';

/**
 * Uploads straight from the file on disk to a signed URL. Photos go through
 * fetch(uri).blob(), but a video that size in JS memory can crash older phones.
 */
export async function uploadReviewVideoFromUri(
    userId: string,
    localUri: string,
    mimeType?: string | null
): Promise<string | null> {
    try {
        const ext = /\.(\w+)$/.exec(localUri)?.[1]?.toLowerCase() || 'mp4';
        const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
        const { data: signed, error: signError } = await supabase.storage
            .from('review-videos')
            .createSignedUploadUrl(path);
        if (signError || !signed) {
            console.warn('[reviewVideoUpload] sign', signError);
            return null;
        }

        const res = await FileSystem.uploadAsync(signed.signedUrl, localUri, {
            httpMethod: 'PUT',
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: { 'Content-Type': mimeType || (ext === 'mov' ? 'video/quicktime' : 'video/mp4') },
        });
        if (res.status < 200 || res.status >= 300) {
            console.warn('[reviewVideoUpload] upload', res.status, res.body);
            return null;
        }

        const { data: pub } = supabase.storage.from('review-videos').getPublicUrl(path);
        return pub?.publicUrl ?? null;
    } catch (e) {
        console.warn('[reviewVideoUpload]', e);
        return null;
    }
}
