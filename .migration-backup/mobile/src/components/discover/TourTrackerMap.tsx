import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, type LatLng, PROVIDER_GOOGLE } from 'react-native-maps';
import { SynthTokens } from '../../tokens/SynthTokens';
import type { TourEvent } from '../../services/tourTrackerService';
import { SynthText } from '../SynthText';
import { SynthMap } from '../maps/SynthMap';

type Stop = {
  id: string;
  number: number;
  latitude: number;
  longitude: number;
  cityLabel: string;
  venueKey: string;
  representativeEventId: string;
};

function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function toLatLng(s: Stop): LatLng {
  return { latitude: s.latitude, longitude: s.longitude };
}

function stopCityLabel(e: TourEvent): string {
  const city = String(e.venue_city ?? '').trim();
  const state = String(e.venue_state ?? '').trim();
  return city && state ? `${city}, ${state}` : city || state || 'Stop';
}

function stopKey(e: TourEvent): string {
  return `${String(e.venue_name ?? '').trim()}|${String(e.venue_city ?? '').trim()}|${String(e.venue_state ?? '').trim()}`.toLowerCase();
}

/**
 * Matches the web “numbered stops” behavior: consecutive events at the same venue share a stop,
 * but a return visit creates a new stop number.
 */
export function groupTourStops(events: TourEvent[]): { stops: Stop[]; eventIdToStopNumber: Record<string, number> } {
  const sorted = [...events].sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
  const stops: Stop[] = [];
  const eventIdToStopNumber: Record<string, number> = {};

  let currentNumber = 1;
  let lastVenueKey: string | null = null;
  for (const e of sorted) {
    if (!isFiniteNum(e.latitude) || !isFiniteNum(e.longitude)) continue;
    const venueKey = stopKey(e);

    // Consecutive events at same venue share a stop.
    const sameAsLast = lastVenueKey != null && venueKey === lastVenueKey;
    if (!sameAsLast) {
      stops.push({
        id: `${venueKey}#${currentNumber}`,
        number: currentNumber++,
        latitude: e.latitude,
        longitude: e.longitude,
        cityLabel: stopCityLabel(e),
        venueKey,
        representativeEventId: e.id,
      });
      lastVenueKey = venueKey;
    }
    const lastNumber = stops[stops.length - 1]?.number;
    if (lastNumber != null) eventIdToStopNumber[e.id] = lastNumber;
  }

  return { stops, eventIdToStopNumber };
}

export function TourTrackerMap({
  events,
  height = 260,
  selectedStopNumber,
  onSelectStopNumber,
}: {
  events: TourEvent[];
  height?: number;
  selectedStopNumber: number | null;
  onSelectStopNumber: (stopNumber: number) => void;
}) {
  const mapRef = useRef<MapView | null>(null);

  const { stops } = useMemo(() => groupTourStops(events), [events]);
  const polylineCoords = useMemo(() => stops.map(toLatLng), [stops]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (polylineCoords.length === 0) return;
    // Slight delay helps on initial mount.
    const t = setTimeout(() => {
      m.fitToCoordinates(polylineCoords, {
        edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
        animated: false,
      });
    }, 50);
    return () => clearTimeout(t);
  }, [polylineCoords]);

  const selectedStop = useMemo(() => {
    if (selectedStopNumber == null) return null;
    return stops.find(s => s.number === selectedStopNumber) ?? null;
  }, [selectedStopNumber, stops]);

  // Web fallback: react-native-maps is limited on web; use static Mapbox card.
  if (Platform.OS === 'web') {
    const first = selectedStop ?? stops[0] ?? null;
    if (!first) return null;
    return (
      <View style={{ height }}>
        <SynthMap
          latitude={first.latitude}
          longitude={first.longitude}
          title="Tour map"
          subtitle={first.cityLabel}
          height={height}
          zoom={2}
        />
      </View>
    );
  }

  const initial = stops[0];
  if (!initial) return null;

  return (
    <View style={[styles.shell, { height }]}>
      <MapView
        ref={(r) => {
          mapRef.current = r;
        }}
        style={StyleSheet.absoluteFillObject}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={{
          latitude: initial.latitude,
          longitude: initial.longitude,
          latitudeDelta: 20,
          longitudeDelta: 20,
        }}
      >
        {polylineCoords.length >= 2 ? (
          <Polyline coordinates={polylineCoords} strokeColor={SynthTokens.colors.brandPink500} strokeWidth={3} />
        ) : null}

        {stops.map(s => {
          const isSelected = selectedStopNumber != null && s.number === selectedStopNumber;
          return (
            <Marker
              key={`${s.id}-${s.number}`}
              coordinate={toLatLng(s)}
              onPress={() => onSelectStopNumber(s.number)}
              tracksViewChanges={false}
            >
              <View style={[styles.marker, isSelected && styles.markerSelected]}>
                <SynthText variant="meta" style={styles.markerText}>
                  {s.number}
                </SynthText>
              </View>
            </Marker>
          );
        })}
      </MapView>
      <View style={styles.attrib}>
        <SynthText variant="meta" color="secondary" style={{ fontSize: 12 }}>
          Tour map
        </SynthText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  marker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: SynthTokens.colors.brandPink500,
    borderWidth: 2,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerSelected: {
    backgroundColor: SynthTokens.colors.brandPink600,
    transform: [{ scale: 1.1 }],
  },
  markerText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 12,
  },
  attrib: {
    position: 'absolute',
    left: 10,
    bottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
});

