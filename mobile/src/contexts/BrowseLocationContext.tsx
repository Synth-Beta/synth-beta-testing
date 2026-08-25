import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentLatLng, reverseGeocode, type LatLng } from '../services/locationService';
import { resolveLocation } from '@synth/shared';
import { SYNTH_20_DEMO, SYNTH_20_DC } from '../config/synth20Demo';

/**
 * Shared "what location am I browsing" for Discover + Home feed.
 *
 * Deliberately NOT persisted to `public.users.location_city/location_state/
 * latitude/longitude` - those are profile identity fields (edited in
 * profile-edit.tsx, read by passportService.ts's home-city hint). Writing a
 * temporary browse pick there would silently corrupt the user's real home
 * city. This stores on-device only.
 */

const STORAGE_KEY = '@synth/browseLocation';
const DEFAULT_RADIUS_MILES = SYNTH_20_DEMO ? SYNTH_20_DC.radiusMiles : 30;

interface StoredBrowseLocation {
  coords: LatLng;
  label: string;
  radiusMiles: number;
}

interface BrowseLocationContextValue {
  coords: LatLng | null;
  label: string;
  radiusMiles: number;
  /** True when the user picked a location manually, false when using live GPS. */
  isManual: boolean;
  /** True only during the initial resolve (stored value or first GPS fetch). */
  loading: boolean;
  setManualLocation: (coords: LatLng, label: string, radiusMiles: number) => void;
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

export function BrowseLocationProvider({ children }: { children: React.ReactNode }) {
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [label, setLabel] = useState('Your Location');
  const [radiusMiles, setRadiusMiles] = useState(DEFAULT_RADIUS_MILES);
  const [isManual, setIsManual] = useState(false);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  const fetchGpsLocation = useCallback(async () => {
    const live = await getCurrentLatLng();
    // Precedence here is trivially "live or nothing" (expo-location's own
    // last-known-position fast path already covers the "cached" tier) - routed
    // through resolveLocation so the decision stays defined in one shared
    // place with web's BrowseLocationContext.
    const resolved = resolveLocation({ live });
    if (!resolved) {
      setCoords(null);
      setLabel('Your Location');
      return;
    }
    setCoords(resolved);
    const geo = await reverseGeocode(resolved.latitude, resolved.longitude);
    setLabel(geo ?? 'Current location');
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const stored: StoredBrowseLocation = JSON.parse(raw);
          if (stored?.coords) {
            setCoords(stored.coords);
            setLabel(stored.label ?? 'Custom location');
            setRadiusMiles(stored.radiusMiles ?? DEFAULT_RADIUS_MILES);
            setIsManual(true);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.error('[BrowseLocationContext] failed to read stored location', err);
      }
      // Synth 2.0 demo: default browse location to DC for denser rooms.
      if (SYNTH_20_DEMO) {
        setCoords({ latitude: SYNTH_20_DC.latitude, longitude: SYNTH_20_DC.longitude });
        setLabel(SYNTH_20_DC.name);
        setRadiusMiles(SYNTH_20_DC.radiusMiles);
        setIsManual(true);
        setLoading(false);
        return;
      }
      // No manual override stored - fall back to live GPS (today's default behavior).
      await fetchGpsLocation();
      setLoading(false);
    })();
  }, [fetchGpsLocation]);

  const setManualLocation = useCallback((newCoords: LatLng, newLabel: string, newRadiusMiles: number) => {
    setCoords(newCoords);
    setLabel(newLabel);
    setRadiusMiles(newRadiusMiles);
    setIsManual(true);
    const toStore: StoredBrowseLocation = { coords: newCoords, label: newLabel, radiusMiles: newRadiusMiles };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toStore)).catch(err => {
      console.error('[BrowseLocationContext] failed to persist location', err);
    });
  }, []);

  const resetToCurrentLocation = useCallback(() => {
    setIsManual(false);
    setLoading(true);
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
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
