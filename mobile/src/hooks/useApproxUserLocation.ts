import * as Location from 'expo-location';
import { supabase } from '../integrations/supabase/client';
import { getCurrentLatLng } from '../services/locationService';

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
 * in-memory for the app session — a failure (denied permission, cold-GPS
 * timeout, network error) is never cached, so the next call retries the
 * whole chain instead of permanently forcing the no-location fallback for
 * the rest of the session.
 */
export async function resolveApproxUserLocation(): Promise<ApproxLatLng | null> {
  if (cachedLocation) return cachedLocation;

  const live = await getCurrentLatLng();
  if (live) {
    cachedLocation = live;
    return live;
  }

  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return null;

    const { data: userRow } = await supabase
      .from('users')
      .select('latitude, longitude, location_city')
      .eq('user_id', userId)
      .maybeSingle();

    if (userRow?.latitude != null && userRow?.longitude != null) {
      cachedLocation = { latitude: Number(userRow.latitude), longitude: Number(userRow.longitude) };
      return cachedLocation;
    }

    if (userRow?.location_city) {
      try {
        const geocoded = await Location.geocodeAsync(userRow.location_city);
        const first = geocoded?.[0];
        if (first) {
          cachedLocation = { latitude: first.latitude, longitude: first.longitude };
          return cachedLocation;
        }
      } catch {
        // Geocoding failed — fall through to null.
      }
    }
  } catch {
    // Auth lookup or DB read failed — fall through to null rather than reject.
  }

  return null;
}

/**
 * Like resolveApproxUserLocation, but never shows the OS location permission prompt.
 * Uses the device location only if permission was already granted, otherwise the saved
 * users.latitude/longitude. For screens that merely *prefer* a location (e.g. sorting an
 * artist's shows nearest-first) and shouldn't interrupt with a prompt.
 */
export async function resolveApproxUserLocationQuiet(): Promise<ApproxLatLng | null> {
  if (cachedLocation) return cachedLocation;
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status === 'granted') {
      const last = await Location.getLastKnownPositionAsync({}).catch(() => null);
      if (last?.coords) {
        cachedLocation = { latitude: last.coords.latitude, longitude: last.coords.longitude };
        return cachedLocation;
      }
    }
  } catch {
    // fall through to the saved location
  }
  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return null;
    const { data: userRow } = await supabase
      .from('users')
      .select('latitude, longitude')
      .eq('user_id', userId)
      .maybeSingle();
    if (userRow?.latitude != null && userRow?.longitude != null) {
      // Not cached: a saved location is a weaker answer than a live one, and the next
      // full resolveApproxUserLocation() call should still try the device first.
      return { latitude: Number(userRow.latitude), longitude: Number(userRow.longitude) };
    }
  } catch {
    // no location
  }
  return null;
}
