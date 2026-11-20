import { supabase } from '@/integrations/supabase/client';
import type { LatLng } from '@synth/shared';

/**
 * The viewer's approximate location for "nearest first" ordering, without ever showing
 * the browser's location prompt: live position only if permission was already granted,
 * otherwise the saved users.latitude/longitude. Null when neither is available.
 * Cached for the page session once resolved.
 */
let cached: LatLng | null = null;

async function liveIfAlreadyGranted(): Promise<LatLng | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.permissions?.query) return null;
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    if (status.state !== 'granted') return null;
    return await new Promise<LatLng | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve(null),
        { maximumAge: 10 * 60 * 1000, timeout: 3000, enableHighAccuracy: false },
      );
    });
  } catch {
    return null;
  }
}

export async function getViewerLocationQuiet(userId?: string | null): Promise<LatLng | null> {
  if (cached) return cached;
  const live = await liveIfAlreadyGranted();
  if (live) return (cached = live);
  if (!userId) return null;
  try {
    const { data } = await supabase.from('users').select('latitude, longitude').eq('user_id', userId).maybeSingle();
    const lat = Number((data as any)?.latitude);
    const lng = Number((data as any)?.longitude);
    if (data && (data as any).latitude != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      return (cached = { latitude: lat, longitude: lng });
    }
  } catch {
    // no saved location
  }
  return null;
}
