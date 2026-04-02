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
  if (!imageUrl || !String(imageUrl).trim()) return null;
  const u = String(imageUrl).trim();
  if (isJamBasePlaceholderUrl(u) || isBrokenSynthPlaceholderPath(u)) return null;
  return u;
}

/** Priority aligned with web `UnifiedEventsFeed.getImageUrl`: media, images[], poster. */
export function pickFeedImageUrlFromPayload(p: Record<string, unknown> | null | undefined): string | undefined {
  if (!p || typeof p !== 'object') return undefined;
  const po = p as any;

  const fromMedia = po.event_media_url ?? (Array.isArray(po.media_urls) ? po.media_urls[0] : undefined);
  if (typeof fromMedia === 'string' && fromMedia.trim()) return fromMedia.trim();

  const imgs = po.images;
  if (Array.isArray(imgs) && imgs.length > 0) {
    const best =
      imgs.find((img: any) => img?.url && (img?.ratio === '16_9' || (img?.width && img.width > 1000))) ||
      imgs.find((img: any) => img?.url);
    if (best?.url && String(best.url).trim()) return String(best.url).trim();
  }

  if (typeof po.poster_image_url === 'string' && po.poster_image_url.trim()) {
    return po.poster_image_url.trim();
  }
  return undefined;
}
