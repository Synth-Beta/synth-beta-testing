const TRIM_SLASHES = /\/+$/;
const CAPACITOR_SCHEMES = ['capacitor://', 'file://'];

const normalizeUrl = (url: string): string => url.replace(TRIM_SLASHES, '');

export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  const publicSiteUrl = import.meta.env.VITE_PUBLIC_SITE_URL ?? import.meta.env.VITE_WEB_BASE_URL;

  if (typeof envUrl === 'string' && envUrl.trim()) {
    return normalizeUrl(envUrl.trim());
  }

  if (typeof publicSiteUrl === 'string' && publicSiteUrl.trim()) {
    return normalizeUrl(publicSiteUrl.trim());
  }

  if (typeof window === 'undefined') {
    return '';
  }

  const origin = window.location.origin ?? '';
  if (origin.startsWith('http')) {
    return normalizeUrl(origin);
  }

  if (CAPACITOR_SCHEMES.some((scheme) => origin.startsWith(scheme))) {
    return '';
  }

  return origin ? normalizeUrl(origin) : '';
}
