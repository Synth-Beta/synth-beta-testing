import { supabase } from '@/integrations/supabase/client';
import { LocationService } from '@/services/locationService';
import { RadiusSearchService } from '@/services/radiusSearchService';

export interface ApproxLatLng {
  latitude: number;
  longitude: number;
}

let cachedLocation: ApproxLatLng | null | undefined;

/**
 * Resolves the current user's approximate location for "near me" filtering.
 * Order: live device location -> saved users.latitude/longitude -> geocoded
 * users.location_city -> null. Memoized in-memory for the session so opening
 * several genre chats doesn't re-prompt geolocation each time.
 */
export async function resolveApproxUserLocation(): Promise<ApproxLatLng | null> {
  if (cachedLocation !== undefined) return cachedLocation;

  try {
    const live = await LocationService.getCurrentLocation();
    cachedLocation = live;
    return live;
  } catch {
    // Permission denied, unsupported, or timed out — fall through.
  }

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id;
  if (!userId) {
    cachedLocation = null;
    return null;
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('latitude, longitude, location_city, location_state')
    .eq('user_id', userId)
    .maybeSingle();

  if (userRow?.latitude != null && userRow?.longitude != null) {
    cachedLocation = { latitude: Number(userRow.latitude), longitude: Number(userRow.longitude) };
    return cachedLocation;
  }

  if (userRow?.location_city) {
    const coords = await RadiusSearchService.getCityCoordinates(
      userRow.location_city,
      userRow.location_state ?? undefined
    );
    if (coords) {
      cachedLocation = { latitude: coords.lat, longitude: coords.lng };
      return cachedLocation;
    }
  }

  cachedLocation = null;
  return null;
}
