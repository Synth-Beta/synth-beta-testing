/**
 * Security: Mapbox tokens must come from env — no hardcoded fallbacks in the client bundle.
 */
export function getMapboxToken(): string {
  const token =
    (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined)?.trim() ||
    (import.meta.env.VITE_MAPBOX_KEY as string | undefined)?.trim() ||
    '';
  if (!token && import.meta.env.DEV) {
    console.warn('[mapbox] VITE_MAPBOX_TOKEN is not set — maps will not load.');
  }
  return token;
}
