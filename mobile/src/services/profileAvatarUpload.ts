import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { supabase } from '../integrations/supabase/client';

const AVATAR_ALLOWED_MIME = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
]);

/** React Native file object accepted by supabase-js storage uploads. */
type ReactNativeUploadFile = {
    uri: string;
    name: string;
    type: string;
};

function decodeBase64ToBytes(b64: string): Uint8Array {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function resolveAvatarImageType(
    uri: string,
    meta?: { mimeType?: string | null; fileName?: string | null }
): { ext: string; contentType: string } {
    const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        heic: 'image/heic',
        heif: 'image/heif',
    };

    let contentType = meta?.mimeType?.trim().toLowerCase() || '';
    if (contentType === 'image/jpg') contentType = 'image/jpeg';

    const fromName = meta?.fileName?.split('.').pop()?.toLowerCase();
    const fromUri = uri.split('?')[0]?.split('.').pop()?.toLowerCase();
    const fromMime = contentType.split('/').pop()?.toLowerCase();
    const rawExt = fromName ?? fromUri ?? fromMime ?? 'jpg';
    let ext = rawExt === 'jpeg' ? 'jpg' : rawExt;

    // RN fetch→blob often reports application/octet-stream; never send that to
    // profile-avatars (bucket MIME whitelist rejects it).
    if (!contentType || !AVATAR_ALLOWED_MIME.has(contentType)) {
        contentType = mimeMap[ext] ?? 'image/jpeg';
    }

    if (contentType === 'image/heic' || contentType === 'image/heif') ext = 'heic';
    if (contentType === 'image/jpeg') ext = 'jpg';
    if (contentType === 'image/png') ext = 'png';
    if (contentType === 'image/webp') ext = 'webp';

    if (!mimeMap[ext]) {
        ext = 'jpg';
        contentType = 'image/jpeg';
    }

    return { ext, contentType };
}

/**
 * Uploads a profile avatar to Supabase storage and returns the public URL.
 * Uses the same RN-safe path as chat images (uri file object, then base64 bytes)
 * so Blob/octet-stream never hits the profile-avatars MIME whitelist.
 */
export async function uploadProfileAvatarFromUri(
    userId: string,
    localUri: string,
    meta?: { mimeType?: string | null; fileName?: string | null }
): Promise<string | null> {
    try {
        const { ext, contentType } = resolveAvatarImageType(localUri, meta);
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
        const path = `${userId}/${filename}`;

        if (Platform.OS !== 'web') {
            const rnFile: ReactNativeUploadFile = {
                uri: localUri,
                name: filename,
                type: contentType,
            };
            const { data, error } = await supabase.storage.from('profile-avatars').upload(
                path,
                rnFile as unknown as Blob,
                {
                    cacheControl: '3600',
                    contentType,
                    upsert: false,
                }
            );
            if (!error && data?.path) {
                const { data: publicData } = supabase.storage
                    .from('profile-avatars')
                    .getPublicUrl(data.path);
                return publicData?.publicUrl ?? null;
            }
            console.warn('[profileAvatarUpload] RN file upload failed, trying bytes', error);
        }

        let uploadBody: Blob | Uint8Array;
        let resolvedType = contentType;

        try {
            const base64 = await FileSystem.readAsStringAsync(localUri, {
                encoding: FileSystem.EncodingType.Base64,
            });
            if (!base64?.length) {
                throw new Error('empty base64 read');
            }
            uploadBody = decodeBase64ToBytes(base64);
        } catch (fsErr) {
            const res = await fetch(localUri);
            if (!res.ok) {
                throw new Error(`fetch status ${res.status}`);
            }
            const blob = await res.blob();
            if (!blob.size) {
                throw new Error('empty blob from fetch');
            }
            // Prefer bytes-with-explicit-type over a Blob whose .type may be
            // application/octet-stream (Blob.type wins over contentType in storage-js).
            if (blob.type && AVATAR_ALLOWED_MIME.has(blob.type)) {
                uploadBody = blob;
                resolvedType = blob.type === 'image/jpg' ? 'image/jpeg' : blob.type;
            } else {
                const buffer = await blob.arrayBuffer();
                uploadBody = new Uint8Array(buffer);
            }
            console.warn('[profileAvatarUpload] used fetch fallback', fsErr);
        }

        if (!AVATAR_ALLOWED_MIME.has(resolvedType)) {
            resolvedType = contentType;
        }

        const { data, error } = await supabase.storage.from('profile-avatars').upload(path, uploadBody, {
            cacheControl: '3600',
            contentType: resolvedType,
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
