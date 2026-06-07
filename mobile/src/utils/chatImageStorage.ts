/**
 * Security: chat-images bucket is private — signed URLs required for display.
 */
import { supabase } from '@/integrations/supabase/client';

const CHAT_IMAGES_BUCKET = 'chat-images';
const SIGNED_URL_TTL_SEC = 60 * 60;

export function extractChatImageStoragePath(imageUrlOrPath: string): string | null {
  const trimmed = imageUrlOrPath.trim();
  if (!trimmed) return null;
  if (!trimmed.includes('://') && !trimmed.startsWith('/')) return trimmed;

  try {
    const url = new URL(trimmed);
    for (const segment of ['public', 'sign', 'authenticated']) {
      const prefix = `/storage/v1/object/${segment}/${CHAT_IMAGES_BUCKET}/`;
      const idx = url.pathname.indexOf(prefix);
      if (idx >= 0) {
        return decodeURIComponent(url.pathname.slice(idx + prefix.length));
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export async function resolveChatImageDisplayUrl(
  imageUrlOrPath: string | null | undefined,
  storagePath?: string | null
): Promise<string | null> {
  const path =
    storagePath?.trim() ||
    (imageUrlOrPath ? extractChatImageStoragePath(imageUrlOrPath) : null) ||
    (imageUrlOrPath && !imageUrlOrPath.includes('://') ? imageUrlOrPath : null);

  if (!path) {
    return imageUrlOrPath?.includes('://') ? imageUrlOrPath : null;
  }

  const { data, error } = await supabase.storage
    .from(CHAT_IMAGES_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);

  if (error || !data?.signedUrl) {
    console.warn('[ChatService] createSignedUrl failed:', error?.message);
    return imageUrlOrPath?.includes('://') ? imageUrlOrPath : null;
  }

  return data.signedUrl;
}

export async function uploadChatImageAndGetMetadata(
  storagePath: string,
  body: Blob | File | ArrayBuffer,
  contentType: string
): Promise<{ storage_path: string; image_url: string } | null> {
  const { data, error } = await supabase.storage
    .from(CHAT_IMAGES_BUCKET)
    .upload(storagePath, body, { contentType, upsert: false });

  if (error || !data?.path) {
    console.error('[ChatService] upload failed:', error);
    return null;
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(CHAT_IMAGES_BUCKET)
    .createSignedUrl(data.path, SIGNED_URL_TTL_SEC);

  if (signError || !signed?.signedUrl) {
    console.error('[ChatService] signed URL failed:', signError);
    return { storage_path: data.path, image_url: '' };
  }

  return { storage_path: data.path, image_url: signed.signedUrl };
}
