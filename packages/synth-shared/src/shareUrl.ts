export type ShareContentType = 'event' | 'review' | 'artist' | 'venue';

export interface PendingShareLink {
  type: ShareContentType;
  id: string;
  referrerId: string | null;
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
