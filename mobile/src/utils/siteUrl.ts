const TRIM_TRAILING = /\/+$/;

/** Web origin for deep links and API (e.g. delete-account, streaming OAuth). */
export function getExpoSiteUrl(): string {
    const raw = process.env.EXPO_PUBLIC_SITE_URL?.trim();
    if (raw) return raw.replace(TRIM_TRAILING, '');
    return 'https://synth-beta-testing.vercel.app';
}
