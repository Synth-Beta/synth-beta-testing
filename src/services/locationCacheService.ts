export interface LastKnownLocation {
  lat: number;
  lng: number;
  timestamp: number; // Unix ms timestamp
}

const STORAGE_KEY = 'synth_last_location_v1';

/**
 * Read the last known location from localStorage.
 * Optionally enforce a max age (in milliseconds).
 */
export function getLastKnownLocation(maxAgeMs?: number): LastKnownLocation | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<LastKnownLocation>;
    if (
      typeof parsed.lat !== 'number' ||
      typeof parsed.lng !== 'number' ||
      typeof parsed.timestamp !== 'number'
    ) {
      return null;
    }

    if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lng)) {
      return null;
    }

    // Guard against obviously bad values
    if (parsed.lat === 0 && parsed.lng === 0) {
      return null;
    }

    if (maxAgeMs && Date.now() - parsed.timestamp > maxAgeMs) {
      return null;
    }

    return {
      lat: parsed.lat,
      lng: parsed.lng,
      timestamp: parsed.timestamp,
    };
  } catch {
    return null;
  }
}

/**
 * Persist the last known location to localStorage.
 */
export function saveLastKnownLocation(lat: number, lng: number): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return;
  }

  const payload: LastKnownLocation = {
    lat,
    lng,
    timestamp: Date.now(),
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Swallow storage errors (e.g. Safari private mode, quota exceeded)
  }
}

