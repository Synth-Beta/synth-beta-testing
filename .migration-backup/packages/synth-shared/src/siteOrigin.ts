const HTTP = /^https?:\/\//i;

/**
 * Normalizes a deploy URL for Supabase `emailRedirectTo` / OAuth (same logic as Vite `Auth.tsx` getSiteOrigin).
 * Pass env from each app: Vite `import.meta.env.VITE_SITE_URL`, Expo `process.env.EXPO_PUBLIC_SITE_URL`.
 */
export function getAuthRedirectOrigin(params: {
  /** e.g. EXPO_PUBLIC_SITE_URL or VITE_SITE_URL */
  siteUrlEnv?: string;
  /** Browser only: window.location.origin */
  windowOrigin?: string;
  fallback: string;
}): string {
  const envUrlRaw = params.siteUrlEnv?.trim();
  const envUrl = envUrlRaw
    ? HTTP.test(envUrlRaw)
      ? envUrlRaw
      : `https://${envUrlRaw}`
    : null;

  const win = params.windowOrigin?.trim();
  const windowOrigin = win && HTTP.test(win) ? win : null;

  const candidate = envUrl ?? windowOrigin ?? params.fallback;
  try {
    return new URL(candidate).origin;
  } catch {
    return params.fallback;
  }
}
