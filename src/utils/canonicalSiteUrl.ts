/** Production site URL — never use dead preview deployments as fallback. */
export const CANONICAL_SITE_URL = 'https://join.getsynth.app';

const TRIM_SLASHES = /\/+$/;

export function getCanonicalSiteUrl(): string {
  const candidates = [
    import.meta.env.VITE_PUBLIC_SITE_URL,
    import.meta.env.VITE_SITE_URL,
    import.meta.env.VITE_WEB_BASE_URL,
  ];

  for (const raw of candidates) {
    if (typeof raw === 'string' && raw.trim()) {
      const normalized = raw.trim().replace(TRIM_SLASHES, '');
      if (/^https?:\/\//i.test(normalized)) {
        return normalized;
      }
      return `https://${normalized}`;
    }
  }

  return CANONICAL_SITE_URL;
}

/** Spotify OAuth callback — always on the canonical site, never window.location.origin. */
export function getSpotifyRedirectUri(): string {
  const explicit = import.meta.env.VITE_SPOTIFY_REDIRECT_URI;
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim();
  }
  return `${getCanonicalSiteUrl()}/auth/spotify/callback`;
}
