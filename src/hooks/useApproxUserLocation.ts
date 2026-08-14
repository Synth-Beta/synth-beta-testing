import { supabase } from '@/integrations/supabase/client';
import { LocationService } from '@/services/locationService';
import { RadiusSearchService } from '@/services/radiusSearchService';

export interface ApproxLatLng {
  latitude: number;
  longitude: number;
}

let cachedLocation: ApproxLatLng | null = null;

// A resolved location belongs to one signed-in user. Clear it on any auth
// change (sign-in, sign-out, account switch) so the next call re-resolves
// instead of leaking the previous account's location.
supabase.auth.onAuthStateChange(() => {
  cachedLocation = null;
});

/**
 * Resolves the current user's approximate location for "near me" filtering.
 * Order: live device location -> saved users.latitude/longitude -> geocoded
 * users.location_city -> null. Only successful resolutions are memoized
 * in-memory for the session (so opening several genre chats doesn't
 * re-prompt geolocation each time) — a failure (denied permission, timeout,
 * network error) is never cached, so the next call retries the whole chain
 * instead of permanently forcing the no-location fallback for the rest of
 * the session.
 */
export async function resolveApproxUserLocation(): Promise<ApproxLatLng | null> {
  if (cachedLocation) return cachedLocation;

  try {
    const live = await LocationService.getCurrentLocation();
    cachedLocation = live;
    return live;
  } catch {
    // Permission denied, unsupported, or timed out — fall through.
  }

  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return null;

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
  } catch {
    // Auth lookup or DB read failed — fall through to null rather than reject.
  }

  return null;
}
