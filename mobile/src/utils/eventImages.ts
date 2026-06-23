/**
 * JamBase / feed image handling for Expo (mirrors web `replaceJambasePlaceholder` intent;
 * local placeholder is used via `require()` in components when this returns null).
 */
const JAMBASE_PLACEHOLDER_SUBSTRINGS = [
  'jambase-default-band-image-bw-1480x832.png',
  'jambase.com/wp-content/uploads/2021/08/jambase-default-band-image-bw-1480x832.png',
];

function isJamBasePlaceholderUrl(imageUrl: string): boolean {
  return JAMBASE_PLACEHOLDER_SUBSTRINGS.some(s => imageUrl.includes(s));
}

function isBrokenSynthPlaceholderPath(imageUrl: string): boolean {
  return imageUrl === '/Synth_Placeholder.png' || imageUrl.includes('/Synth_Placeholder.png');
}

/** Returns remote URL for expo-image `uri`, or `null` to use bundled placeholder asset. */
export function resolveFeedImageUri(imageUrl: string | null | undefined): string | null {
  if (imageUrl == null) return null;
  const u = String(imageUrl).trim();
  if (!u || u === 'null' || u === 'undefined') return null;
  if (isJamBasePlaceholderUrl(u) || isBrokenSynthPlaceholderPath(u)) return null;
  return u;
}

/** True when a stored/feed image URL is a real remote image (not placeholder or sentinel). */
export function hasUsableFeedImageUrl(imageUrl: string | null | undefined): boolean {
  return resolveFeedImageUri(imageUrl) != null;
}

/** Best image from feed RPC payload fields (media, images[], poster). */
export function pickFeedImageUrlFromPayload(p: Record<string, unknown> | null | undefined): string | undefined {
  if (!p || typeof p !== 'object') return undefined;
  const po = p as any;

  const fromMedia = po.event_media_url ?? (Array.isArray(po.media_urls) ? po.media_urls[0] : undefined);
  if (typeof fromMedia === 'string') {
    const media = resolveFeedImageUri(fromMedia);
    if (media) return media;
  }

  const imgs = po.images;
  if (Array.isArray(imgs) && imgs.length > 0) {
    const best =
      imgs.find((img: any) => img?.url && (img?.ratio === '16_9' || (img?.width && img.width > 1000))) ||
      imgs.find((img: any) => img?.url);
    const fromImg = best?.url ? resolveFeedImageUri(String(best.url)) : null;
    if (fromImg) return fromImg;
  }

  if (typeof po.poster_image_url === 'string') {
    const poster = resolveFeedImageUri(po.poster_image_url);
    if (poster) return poster;
  }
  return undefined;
}
