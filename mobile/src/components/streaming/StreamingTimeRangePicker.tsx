import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { SPOTIFY_TIME_RANGE_LABELS, type SpotifyTimeRange } from '@synth/shared';
import { SynthTokens } from '../../tokens/SynthTokens';

const TIME_RANGES: SpotifyTimeRange[] = ['short_term', 'medium_term', 'long_term'];

interface StreamingTimeRangePickerProps {
  value: SpotifyTimeRange;
  onChange: (range: SpotifyTimeRange) => void;
  accentColor: string;
}

export function StreamingTimeRangePicker({
  value,
  onChange,
  accentColor,
}: StreamingTimeRangePickerProps) {
  return (
    <View style={styles.row}>
      {TIME_RANGES.map((range) => {
        const selected = value === range;
        return (
          <Pressable
            key={range}
            style={[
              styles.btn,
              selected && { backgroundColor: accentColor, borderColor: accentColor },
            ]}
            onPress={() => onChange(range)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.label, selected && styles.labelOn]}>
              {SPOTIFY_TIME_RANGE_LABELS[range]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: SynthTokens.colors.neutral600,
  },
  labelOn: {
    color: SynthTokens.colors.neutral0,
  },
});
