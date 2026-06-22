export type ShareContentType = 'event' | 'review' | 'artist' | 'venue';

export interface PendingShareLink {
  type: ShareContentType;
  id: string;
  referrerId: string | null;
}

/** AsyncStorage / sessionStorage key for a share link awaiting auth + navigation. */
export const PENDING_SHARE_STORAGE_KEY = 'synth_pending_share_link';

function trimSiteUrl(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, '');
}

function shareQueryParam(type: ShareContentType): string {
  switch (type) {
    case 'event':
      return 'event';
    case 'review':
      return 'review';
    case 'artist':
      return 'artist';
    case 'venue':
      return 'venue';
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/**
 * Public HTTPS URL for external share (OG / iMessage). Format: /share?event= or ?review=
 */
export function buildShareLandingUrl(
  siteUrl: string,
  type: ShareContentType,
  id: string,
  referrerId?: string | null
): string {
  const base = trimSiteUrl(siteUrl);
  const param = shareQueryParam(type);
  let url = `${base}/share?${param}=${encodeURIComponent(id)}`;
  if (referrerId?.trim()) {
    url += `&ref=${encodeURIComponent(referrerId.trim())}`;
  }
  return url;
}

/**
 * In-app web SPA URL after OG landing ("Open in browser"). Format: /?event= or ?review=
 */
export function buildWebAppUrlFromShare(siteUrl: string, pending: PendingShareLink): string {
  const base = trimSiteUrl(siteUrl);
  const param = shareQueryParam(pending.type);
  let url = `${base}/?${param}=${encodeURIComponent(pending.id)}`;
  if (pending.referrerId?.trim()) {
    url += `&ref=${encodeURIComponent(pending.referrerId.trim())}`;
  }
  return url;
}

/** Build web SPA URL from a canonical /share?... URL (for api/share OG page CTA). */
export function buildWebAppUrlFromShareCanonical(siteUrl: string, canonicalShareUrl: string): string | null {
  const pending = parseShareUrl(canonicalShareUrl);
  if (!pending) return null;
  return buildWebAppUrlFromShare(siteUrl, pending);
}

/**
 * Parses a share URL (or URL search string) into a PendingShareLink.
 * Supports: ?event= / ?review= / ?artist= / ?venue= plus optional &ref=
 */
export function parseShareUrl(urlOrSearch: string): PendingShareLink | null {
  try {
    const params = urlOrSearch.startsWith('http')
      ? new URL(urlOrSearch).searchParams
      : new URLSearchParams(urlOrSearch);

    const ref = params.get('ref');

    if (params.get('event')) return { type: 'event', id: params.get('event')!, referrerId: ref };
    if (params.get('review')) return { type: 'review', id: params.get('review')!, referrerId: ref };
    if (params.get('artist')) return { type: 'artist', id: params.get('artist')!, referrerId: ref };
    if (params.get('venue')) return { type: 'venue', id: params.get('venue')!, referrerId: ref };
  } catch {
    // malformed URL
  }
  return null;
}
