import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SynthTokens } from '../../tokens/SynthTokens';
import { SkeletonBox, SkeletonLine } from './SkeletonPrimitives';

export function DiscoverCalEventsSkeleton() {
  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel="Loading calendar events">
      {[0, 1, 2].map(i => (
        <View key={i} style={styles.row}>
          <SkeletonBox width={72} height={72} borderRadius={12} />
          <View style={styles.mid}>
            <SkeletonLine width="75%" height={16} />
            <SkeletonLine width="50%" height={14} />
            <SkeletonLine width="35%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, marginTop: 8 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  mid: { flex: 1, gap: 8 },
});
