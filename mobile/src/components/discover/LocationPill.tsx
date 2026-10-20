import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { SynthTokens } from '../../tokens/SynthTokens';
import { useBrowseLocation } from '../../contexts/BrowseLocationContext';
import { LocationSheet } from './LocationSheet';

/**
 * Small "📍 City · 50 mi" pill (Home under search, Calendar). Opens the location sheet
 * and sets the app-wide browse location + radius. Mirrors web LocationFilterButton.
 */
export function LocationPill() {
  const { coords, label, radiusMiles, loading, setManualLocation, resetToCurrentLocation } = useBrowseLocation();
  const [open, setOpen] = useState(false);
  const text = loading ? 'Finding you…' : label || 'Set location';

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Location: ${text}, ${radiusMiles} miles. Change`}
      >
        <MapPin size={14} color={SynthTokens.colors.brandPink500} strokeWidth={2.4} />
        <Text style={styles.label} numberOfLines={1}>{text}</Text>
        <Text style={styles.radius}>· {radiusMiles} mi</Text>
      </Pressable>
      <LocationSheet
        visible={open}
        onClose={() => setOpen(false)}
        onApply={(newCoords, newLabel, newRadius) => {
          if (newCoords) setManualLocation(newCoords, newLabel ?? 'Custom location', newRadius);
          else resetToCurrentLocation();
          setOpen(false);
        }}
        initialCoords={coords}
        initialLabel={label}
        initialRadius={radiusMiles}
      />
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: 5,
    height: 30,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  pressed: { borderColor: SynthTokens.colors.brandPink500 },
  label: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: '#3f4650' },
  radius: { fontSize: 13, fontWeight: '500', color: SynthTokens.colors.neutral400 },
});
