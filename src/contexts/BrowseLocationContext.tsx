import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { LocationService } from '@/services/locationService';
import { getLastKnownLocation, saveLastKnownLocation } from '@/services/locationCacheService';
import { resolveLocation, type Coordinates } from '@synth/shared';

/**
 * Shared "what location am I browsing" for Home + Discover feeds.
 *
 * Deliberately NOT persisted to `public.users.location_city/latitude/longitude` -
 * those are profile identity fields (edited in Settings). Writing a temporary
 * browse pick there would silently corrupt the user's real home city. This
 * stores on-device only, mirroring the mobile app's BrowseLocationContext.
 */

const STORAGE_KEY = 'synth_browse_location_v1';
const DEFAULT_RADIUS_MILES = 50;
const CACHE_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

interface StoredBrowseLocation {
  coords: Coordinates;
  label: string;
  radiusMiles: number;
}

interface BrowseLocationContextValue {
  coords: Coordinates | null;
  label: string;
  radiusMiles: number;
  /** True when the user picked a location manually, false when using live GPS. */
  isManual: boolean;
  /** True only during the initial resolve (stored value or first GPS fetch). */
  loading: boolean;
  setManualLocation: (coords: Coordinates, label: string, radiusMiles: number) => void;
  resetToCurrentLocation: () => void;
}

const BrowseLocationContext = createContext<BrowseLocationContextValue>({
  coords: null,
  label: 'Your Location',
  radiusMiles: DEFAULT_RADIUS_MILES,
  isManual: false,
  loading: true,
  setManualLocation: () => {},
  resetToCurrentLocation: () => {},
});

function readStored(): StoredBrowseLocation | null {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<StoredBrowseLocation>;
    if (!stored?.coords || typeof stored.coords.latitude !== 'number' || typeof stored.coords.longitude !== 'number') {
      return null;
    }
    return {
      coords: stored.coords,
      label: stored.label || 'Custom location',
      radiusMiles: stored.radiusMiles || DEFAULT_RADIUS_MILES,
    };
  } catch {
    return null;
  }
}

export function BrowseLocationProvider({ children }: { children: React.ReactNode }) {
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [label, setLabel] = useState('Your Location');
  const [radiusMiles, setRadiusMiles] = useState(DEFAULT_RADIUS_MILES);
  const [isManual, setIsManual] = useState(false);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  // Live GPS -> cached last-known GPS -> null. Never falls back to the
  // profile's `location_city` - see resolveLocation() for why.
  const fetchGpsLocation = useCallback(async () => {
    const cached = getLastKnownLocation(CACHE_MAX_AGE_MS);
    const cachedCoords: Coordinates | null = cached
      ? { latitude: cached.lat, longitude: cached.lng }
      : null;

    // Seed with the cached value immediately so first paint isn't empty while
    // live GPS resolves.
    const seeded = resolveLocation({ cached: cachedCoords });
    if (seeded) {
      setCoords(seeded);
    }

    try {
      const live = await LocationService.getCurrentLocation();
      const resolved = resolveLocation({ live, cached: cachedCoords });
      if (resolved) {
        setCoords(resolved);
        saveLastKnownLocation(live.latitude, live.longitude);
        const cityName = await LocationService.reverseGeocode(live.latitude, live.longitude);
        setLabel(cityName ?? 'Current location');
      }
    } catch (geoError: any) {
      // Only log unexpected errors, not permission denials
      if (geoError?.code !== 1) { // 1 = PERMISSION_DENIED
        console.error('[BrowseLocationContext] Error getting current location:', geoError);
      }
      if (!seeded) {
        setLabel('Not found');
      }
      // Otherwise keep the cache-seeded coords/label already set above.
    }
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    (async () => {
      const stored = readStored();
      if (stored) {
        const resolved = resolveLocation({ manual: stored.coords });
        setCoords(resolved);
        setLabel(stored.label);
        setRadiusMiles(stored.radiusMiles);
        setIsManual(true);
        setLoading(false);
        return;
      }

      // No manual override stored - fall back to live/cached GPS.
      await fetchGpsLocation();
      setLoading(false);
    })();
  }, [fetchGpsLocation]);

  const setManualLocation = useCallback((newCoords: Coordinates, newLabel: string, newRadiusMiles: number) => {
    setCoords(newCoords);
    setLabel(newLabel);
    setRadiusMiles(newRadiusMiles);
    setIsManual(true);
    const toStore: StoredBrowseLocation = { coords: newCoords, label: newLabel, radiusMiles: newRadiusMiles };
    try {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch {
      // Swallow storage errors (e.g. Safari private mode, quota exceeded)
    }
  }, []);

  const resetToCurrentLocation = useCallback(() => {
    setIsManual(false);
    setLoading(true);
    try {
      window.localStorage?.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
    void fetchGpsLocation().finally(() => setLoading(false));
  }, [fetchGpsLocation]);

  return (
    <BrowseLocationContext.Provider
      value={{ coords, label, radiusMiles, isManual, loading, setManualLocation, resetToCurrentLocation }}
    >
      {children}
    </BrowseLocationContext.Provider>
  );
}

export function useBrowseLocation() {
  return useContext(BrowseLocationContext);
}
