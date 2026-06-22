/**
 * Security: chat-images bucket is private — use signed URLs instead of getPublicUrl.
 */
import { supabase } from '@/integrations/supabase/client';

const CHAT_IMAGES_BUCKET = 'chat-images';
const SIGNED_URL_TTL_SEC = 60 * 60; // 1 hour

/** Extract storage object path from a legacy public URL or return path if already a path. */
export function extractChatImageStoragePath(imageUrlOrPath: string): string | null {
  const trimmed = imageUrlOrPath.trim();
  if (!trimmed) return null;

  if (!trimmed.includes('://') && !trimmed.startsWith('/')) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const marker = `/storage/v1/object/public/${CHAT_IMAGES_BUCKET}/`;
    const signedMarker = `/storage/v1/object/sign/${CHAT_IMAGES_BUCKET}/`;
    const authMarker = `/storage/v1/object/authenticated/${CHAT_IMAGES_BUCKET}/`;

    for (const prefix of [marker, signedMarker, authMarker]) {
      const idx = url.pathname.indexOf(prefix);
      if (idx >= 0) {
        return decodeURIComponent(url.pathname.slice(idx + prefix.length));
      }
    }
  } catch {
    // not a URL
  }

  return null;
}

/** Resolve a chat image for display — signed URL when bucket is private. */
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
    console.warn('[chat-images] createSignedUrl failed:', error?.message);
    return imageUrlOrPath?.includes('://') ? imageUrlOrPath : null;
  }

  return data.signedUrl;
}

export function buildChatImageStoragePath(userId: string, ext: string): string {
  return `${userId}/${Date.now()}.${ext}`;
}
