import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SynthTokens } from '../../tokens/SynthTokens';

interface StreamingGenreRowProps {
  name: string;
  count: number;
  pct: number;
  accentColor: string;
}

export function StreamingGenreRow({ name, count, pct, accentColor }: StreamingGenreRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.count}>
          {count} artist{count !== 1 ? 's' : ''}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: accentColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral100,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: SynthTokens.colors.neutral900,
    textTransform: 'capitalize',
  },
  count: {
    fontSize: 11,
    color: SynthTokens.colors.neutral600,
  },
  track: {
    height: 6,
    backgroundColor: SynthTokens.colors.neutral100,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});
