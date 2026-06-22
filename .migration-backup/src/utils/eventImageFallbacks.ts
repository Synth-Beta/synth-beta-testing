import synthPlaceholderImage from '@src/assets/Synth_Placeholder.png';

const SYNTH_PLACEHOLDER_PATH = synthPlaceholderImage;

/** Bundled placeholder - always works even when public/Generic Images aren't reachable (e.g. ERR_CONNECTION_REFUSED). */
export const getSynthPlaceholderImage = (): string => SYNTH_PLACEHOLDER_PATH;

const JAMBASE_PLACEHOLDER_SUBSTRINGS = [
  'jambase-default-band-image-bw-1480x832.png',
  'jambase.com/wp-content/uploads/2021/08/jambase-default-band-image-bw-1480x832.png',
] as const;

/** True for JamBase generic art or broken stored synth placeholder paths (not a real remote image). */
export function isPlaceholderImageUrl(imageUrl: string | null | undefined): boolean {
  if (imageUrl == null) return true;
  const u = String(imageUrl).trim();
  if (!u || u === 'null' || u === 'undefined') return true;
  if (JAMBASE_PLACEHOLDER_SUBSTRINGS.some((s) => u.includes(s))) return true;
  if (u === '/Synth_Placeholder.png' || u.includes('/Synth_Placeholder.png')) return true;
  return false;
}

/**
 * For DB writes and enrichment: return a usable remote URL or null.
 * Placeholders are not stored — display layer uses {@link getSynthPlaceholderImage} instead.
 */
export function resolveStoredImageUrl(imageUrl: string | null | undefined): string | null {
  if (imageUrl == null) return null;
  const trimmed = String(imageUrl).trim();
  if (!trimmed || isPlaceholderImageUrl(trimmed)) return null;
  return trimmed;
}

/**
 * Replace JamBase placeholder image URL with Synth placeholder for display only.
 */
export function replaceJambasePlaceholder(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) {
    return null;
  }

  if (isPlaceholderImageUrl(imageUrl)) {
    return SYNTH_PLACEHOLDER_PATH;
  }

  return imageUrl;
}

const EVENT_FALLBACK_IMAGES = [
  '/Generic Images/1.jpeg',
  '/Generic Images/2.jpeg',
  '/Generic Images/3.jpeg',
  '/Generic Images/4.jpeg',
  '/Generic Images/5.jpeg',
  '/Generic Images/6.jpg',
  '/Generic Images/7.jpg',
  '/Generic Images/8.jpg',
  '/Generic Images/9.webp',
  '/Generic Images/10.jpeg',
  '/Generic Images/11.jpeg',
  '/Generic Images/12.jpeg',
  '/Generic Images/13.jpeg',
  '/Generic Images/14.jpeg',
  '/Generic Images/15.jpeg',
  '/Generic Images/16.jpg',
  '/Generic Images/17.jpeg',
  '/Generic Images/18.jpeg',
  '/Generic Images/19.jpeg',
  '/Generic Images/20.jpeg'
] as const;

const fallbackImageCount = EVENT_FALLBACK_IMAGES.length;

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

export function getFallbackEventImage(seed?: string): string {
  if (fallbackImageCount === 0) {
    return SYNTH_PLACEHOLDER_PATH;
  }

  if (!seed) {
    const randomIndex = Math.floor(Math.random() * fallbackImageCount);
    return encodeURI(EVENT_FALLBACK_IMAGES[randomIndex]);
  }

  const index = hashString(seed) % fallbackImageCount;
  return encodeURI(EVENT_FALLBACK_IMAGES[index]);
}

export function getAllFallbackEventImages(): readonly string[] {
  return EVENT_FALLBACK_IMAGES.map((image) => encodeURI(image));
}

type EventImageSource = {
  id?: string;
  poster_image_url?: string | null;
  image_url?: string | null;
  event_media_url?: string | null;
  images?: unknown;
};

function pickFromImagesJson(images: unknown): string | null {
  if (!Array.isArray(images) || images.length === 0) return null;
  const withUrl = images.filter(
    (img): img is { url?: string; ratio?: string; width?: number } =>
      !!img && typeof img === 'object' && typeof (img as { url?: string }).url === 'string'
  );
  const best =
    withUrl.find(img => img.url && (img.ratio === '16_9' || (img.width && img.width > 1000))) ||
    withUrl.find(img => img.url);
  const url = best?.url?.trim();
  return url || null;
}

/**
 * Best event hero URL for feed cards — never returns null (uses bundled placeholder).
 */
export function resolveEventCardImageUrl(event: EventImageSource): string {
  const candidates = [
    event.event_media_url,
    pickFromImagesJson(event.images),
    event.poster_image_url,
    event.image_url,
  ];

  for (const raw of candidates) {
    const stored = resolveStoredImageUrl(raw);
    if (stored) return stored;
  }

  return getSynthPlaceholderImage();
}

