import * as Location from 'expo-location';

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Best-effort "current location" fetch for feed/calendar proximity queries.
 * Returns `null` when permission is denied or location lookup fails.
 */
export async function getCurrentLatLng(): Promise<LatLng | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const pos = await Location.getCurrentPositionAsync({});
    const { latitude, longitude } = pos.coords ?? {};

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  } catch {
    return null;
  }
}

