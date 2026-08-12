import * as Location from 'expo-location';
import { supabase } from '../integrations/supabase/client';
import { getCurrentLatLng } from '../services/locationService';

export interface ApproxLatLng {
  latitude: number;
  longitude: number;
}

let cachedLocation: ApproxLatLng | null | undefined;

/**
 * Resolves the current user's approximate location for "near me" filtering.
 * Order: live device location -> saved users.latitude/longitude -> geocoded
 * users.location_city -> null. Memoized in-memory for the app session.
 */
export async function resolveApproxUserLocation(): Promise<ApproxLatLng | null> {
  if (cachedLocation !== undefined) return cachedLocation;

  const live = await getCurrentLatLng();
  if (live) {
    cachedLocation = live;
    return live;
  }

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id;
  if (!userId) {
    cachedLocation = null;
    return null;
  }

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

  cachedLocation = null;
  return null;
}
