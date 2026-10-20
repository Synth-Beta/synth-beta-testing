import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { LocationService } from '@/services/locationService';
import { RadiusSearchService } from '@/services/radiusSearchService';
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
  /** Change only the radius; keeps the current (GPS or manual) location. */
  setRadiusMiles: (radiusMiles: number) => void;
  resetToCurrentLocation: () => void;
}

const BrowseLocationContext = createContext<BrowseLocationContextValue>({
  coords: null,
  label: 'Your Location',
  radiusMiles: DEFAULT_RADIUS_MILES,
  isManual: false,
  loading: true,
  setManualLocation: () => {},
  setRadiusMiles: () => {},
  resetToCurrentLocation: () => {},
});

// Radius chosen while on GPS location (no manual override stored).
const RADIUS_KEY = 'synth_browse_radius_v1';

function readStoredRadius(): number | null {
  try {
    const n = Number(window.localStorage?.getItem(RADIUS_KEY));
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

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
  const coordsRef = useRef<Coordinates | null>(null);
  coordsRef.current = coords;

  // Last resort when GPS is denied/unavailable and nothing is cached: the
  // profile's saved coords or home city. Without it the feed has no location
  // at all and shows events from anywhere.
  const fetchProfileLocation = useCallback(async (): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return false;
      const { data: row } = await supabase
        .from('users')
        .select('latitude, longitude, location_city, location_state')
        .eq('user_id', userId)
        .maybeSingle();
      let profileCoords: Coordinates | null = null;
      if (row?.latitude != null && row?.longitude != null) {
        profileCoords = { latitude: Number(row.latitude), longitude: Number(row.longitude) };
      } else if (row?.location_city) {
        const c = await RadiusSearchService.getCityCoordinates(row.location_city, row.location_state ?? undefined);
        if (c) profileCoords = { latitude: c.lat, longitude: c.lng };
      }
      if (!profileCoords) return false;
      setCoords(profileCoords);
      setLabel(row?.location_city || 'Home city');
      return true;
    } catch {
      return false;
    }
  }, []);

  // Live GPS -> cached last-known GPS -> profile location -> null.
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
      if (!seeded && !(await fetchProfileLocation())) {
        setLabel('Not found');
      }
      // Otherwise keep the cache-seeded coords/label already set above.
    }
  }, [fetchProfileLocation]);

  // The provider mounts before sign-in, so the profile fallback above can miss
  // the user. Retry it once a session appears if we still have no location.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' && !coordsRef.current) void fetchProfileLocation();
    });
    return () => data.subscription.unsubscribe();
  }, [fetchProfileLocation]);

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
      const storedRadius = readStoredRadius();
      if (storedRadius) setRadiusMiles(storedRadius);
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

  const updateRadiusMiles = useCallback((newRadiusMiles: number) => {
    setRadiusMiles(newRadiusMiles);
    try {
      window.localStorage?.setItem(RADIUS_KEY, String(newRadiusMiles));
      const stored = readStored();
      if (stored) {
        window.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ ...stored, radiusMiles: newRadiusMiles }));
      }
    } catch {
      // Ignore storage errors
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
      value={{ coords, label, radiusMiles, isManual, loading, setManualLocation, setRadiusMiles: updateRadiusMiles, resetToCurrentLocation }}
    >
      {children}
    </BrowseLocationContext.Provider>
  );
}

export function useBrowseLocation() {
  return useContext(BrowseLocationContext);
}
