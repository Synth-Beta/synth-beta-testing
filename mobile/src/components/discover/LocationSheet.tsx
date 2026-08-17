import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Text,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { SynthButton } from '../SynthButton';
import {
  LatLng,
  getCurrentLatLng,
  reverseGeocode,
} from '../../services/locationService';
import { CityData, searchCities } from '../../services/cityService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bottomSafeContentPadding } from '../navigation/SynthTabBar';

interface Props {
  visible: boolean;
  onClose: () => void;
  onApply: (coords: LatLng | null, label: string | null, radiusMiles: number) => void;
  initialCoords: LatLng | null;
  initialLabel: string;
  initialRadius: number;
}

const RADIUS_STEP = 5;
const MIN_RADIUS = 5;
const MAX_RADIUS = 50;

export function LocationSheet({
  visible,
  onClose,
  onApply,
  initialCoords,
  initialLabel,
  initialRadius,
}: Props) {
  const insets = useSafeAreaInsets();

  const [previewCoords, setPreviewCoords] = useState<LatLng | null>(initialCoords);
  const [previewLabel, setPreviewLabel] = useState(initialLabel);
  const [radius, setRadius] = useState(initialRadius);
  const [searchQuery, setSearchQuery] = useState('');
  const [citySuggestions, setCitySuggestions] = useState<CityData[]>([]);
  const [searchingCities, setSearchingCities] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPreviewCoords(initialCoords);
    setPreviewLabel(initialLabel);
    setRadius(initialRadius);
    setSearchQuery('');
    setCitySuggestions([]);
    setError(null);
  }, [visible, initialCoords, initialLabel, initialRadius]);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setCitySuggestions([]);
      setSearchingCities(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearchingCities(true);
      try {
        const results = await searchCities(searchQuery, 12);
        if (!cancelled) {
          setCitySuggestions(results);
        }
      } catch (err) {
        console.error('[LocationSheet] city search error', err);
      } finally {
        if (!cancelled) setSearchingCities(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const handleUseCurrentLocation = async () => {
    setIsLocating(true);
    setError(null);
    try {
      const location = await getCurrentLatLng();
      if (!location) {
        setError('Unable to access your location. Make sure permissions are enabled.');
        return;
      }
      const label = (await reverseGeocode(location.latitude, location.longitude)) ?? 'Current location';
      setPreviewCoords(location);
      setPreviewLabel(label);
      onApply(location, label, radius);
      onClose();
    } catch (err) {
      console.error('[LocationSheet] useCurrentLocation error', err);
      setError('Could not determine your location right now.');
    } finally {
      setIsLocating(false);
    }
  };

  const handleCitySelect = (city: CityData) => {
    if (
      city.center_latitude == null ||
      city.center_longitude == null ||
      !city.name
    ) {
      return;
    }
    const label = [city.name, city.state].filter(Boolean).join(', ');
    const coords = {
      latitude: city.center_latitude,
      longitude: city.center_longitude,
    };
    setPreviewCoords(coords);
    setPreviewLabel(label);
    setSearchQuery('');
    setCitySuggestions([]);
    setError(null);
    onApply(coords, label, radius);
    onClose();
  };

  const changeRadius = (delta: number) => {
    setRadius(prev => {
      const next = prev + delta;
      return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, next));
    });
  };

  const locationLine = useMemo(() => {
    if (!previewCoords) {
      return 'No location selected';
    }
    return previewLabel ?? 'Custom location';
  }, [previewCoords, previewLabel]);

  if (!visible) return null;

  const sheetMarginBottom = bottomSafeContentPadding(insets.bottom);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { marginBottom: sheetMarginBottom }]}>
          <View style={styles.handle} />
          <SynthText variant="h2" style={styles.title}>
            Set Location
          </SynthText>
          <SynthText variant="meta" color="secondary" style={styles.subtitle}>
            Pin a city or use your current spot to shape the Discover calendar.
          </SynthText>
          <View style={styles.section}>
            <SynthText variant="meta" style={styles.sectionTitle}>
              Current selection
            </SynthText>
            <SynthText variant="meta" color="secondary">
              {locationLine}
            </SynthText>
          </View>
          <View style={styles.section}>
            <SynthText variant="meta" style={styles.sectionTitle}>
              Discover radius
            </SynthText>
            <View style={styles.radiusRow}>
              <Pressable onPress={() => changeRadius(-RADIUS_STEP)} style={styles.radiusButton}>
                <SynthText variant="meta">−</SynthText>
              </Pressable>
              <SynthText variant="meta" style={styles.radiusValue}>
                {radius} miles
              </SynthText>
              <Pressable onPress={() => changeRadius(RADIUS_STEP)} style={styles.radiusButton}>
                <SynthText variant="meta">+</SynthText>
              </Pressable>
            </View>
          </View>
          <View style={styles.section}>
            <SynthButton
              title={isLocating ? 'Finding location…' : 'Use my current location'}
              onPress={handleUseCurrentLocation}
              disabled={isLocating}
              style={styles.locationButton}
            />
            {isLocating && <ActivityIndicator style={styles.locator} color={SynthTokens.colors.brandPink500} />}
          </View>
          <View style={styles.section}>
            <SynthText variant="meta" style={styles.sectionTitle}>
              Search for a city
            </SynthText>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="e.g., New York or Los Angeles"
              placeholderTextColor={SynthTokens.colors.neutral400}
              style={styles.input}
            />
            {searchingCities ? (
              <ActivityIndicator style={styles.suggestionsLoader} color={SynthTokens.colors.brandPink500} />
            ) : null}
            {citySuggestions.length > 0 && (
              <ScrollView style={styles.suggestionList}>
                {citySuggestions.map(city => {
                  const label = [city.name, city.state].filter(Boolean).join(', ');
                  return (
                    <Pressable
                      key={`${city.name}-${city.state ?? 'us'}`}
                      style={styles.suggestionItem}
                      onPress={() => handleCitySelect(city)}
                    >
                      <SynthText variant="meta">{label}</SynthText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
          {error ? (
            <SynthText variant="meta" color="secondary" style={styles.error}>
              {error}
            </SynthText>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderTopLeftRadius: SynthTokens.radius.lg,
    borderTopRightRadius: SynthTokens.radius.lg,
    paddingHorizontal: SynthTokens.spacing.md,
    paddingTop: SynthTokens.spacing.sm,
    paddingBottom: SynthTokens.spacing.lg,
    maxHeight: '90%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: SynthTokens.colors.neutral200,
    alignSelf: 'center',
    marginBottom: SynthTokens.spacing.sm,
  },
  title: {
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 2,
  },
  section: {
    marginTop: SynthTokens.spacing.md,
    gap: 8,
  },
  sectionTitle: {
    fontWeight: '600',
  },
  radiusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radiusButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radiusValue: {
    fontWeight: '600',
  },
  locationButton: {
    marginTop: SynthTokens.spacing.xs,
  },
  locator: {
    marginTop: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    borderRadius: SynthTokens.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: SynthTokens.colors.neutral50,
    color: SynthTokens.colors.neutral900,
  },
  suggestionsLoader: {
    marginTop: 6,
  },
  suggestionList: {
    maxHeight: 160,
    marginTop: 8,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    borderRadius: SynthTokens.radius.md,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
  },
  error: {
    marginTop: SynthTokens.spacing.sm,
    color: SynthTokens.colors.brandPink500,
  },
});
