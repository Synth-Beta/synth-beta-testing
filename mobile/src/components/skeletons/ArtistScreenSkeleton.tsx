import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SynthTokens } from '../../tokens/SynthTokens';
import { SkeletonBox, SkeletonLine } from './SkeletonPrimitives';

export function ArtistScreenSkeleton() {
  return (
    <View style={styles.root} accessibilityRole="progressbar" accessibilityLabel="Loading artist">
      <View style={styles.header}>
        <SkeletonBox width={96} height={96} borderRadius={18} />
        <View style={{ flex: 1, gap: 10 }}>
          <SkeletonLine width="70%" height={18} />
          <SkeletonLine width="40%" height={12} />
          <SkeletonBox width="55%" height={36} borderRadius={999} />
        </View>
      </View>

      <View style={{ gap: 16 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <View key={i} style={styles.card}>
            <SkeletonBox width="100%" height={160} borderRadius={14} />
            <View style={{ padding: 12, gap: 8 }}>
              <SkeletonLine width="78%" height={16} />
              <SkeletonLine width="48%" height={12} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50, padding: SynthTokens.spacing.md, gap: 16 },
  header: {
    flexDirection: 'row',
    gap: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    alignItems: 'center',
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
});

