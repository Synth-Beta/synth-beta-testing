import * as Location from 'expo-location';

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Best-effort "current location" fetch for feed/calendar proximity queries.
 * Returns `null` when permission is denied or location lookup fails.
 *
 * Strategy (fast-path first):
 *  1. Return the last-known position immediately if available (< 1 ms).
 *  2. Race a fresh GPS fix against a 4-second timeout so the feed is never
 *     blocked waiting for a cold GPS cold start.
 */
export async function getCurrentLatLng(): Promise<LatLng | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    // Fast path: last-known position (instant, no GPS warm-up needed)
    const last = await Location.getLastKnownPositionAsync({}).catch(() => null);
    if (last?.coords) {
      const { latitude, longitude } = last.coords;
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return { latitude, longitude };
      }
    }

    // Slow path: wait for fresh GPS, but give up after 4 seconds so the feed
    // isn't blocked on a cold GPS start. Returns null — feed still loads fine.
    const pos = await Promise.race<Location.LocationObject | null>([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 4000)),
    ]);

    if (!pos) return null;
    const { latitude, longitude } = pos.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  } catch {
    return null;
  }
}

