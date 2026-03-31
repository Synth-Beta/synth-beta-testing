import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SynthTokens } from '../../tokens/SynthTokens';
import { SkeletonBox, SkeletonLine } from './SkeletonPrimitives';

function FeedCardSkeleton() {
  return (
    <View style={styles.card}>
      <SkeletonBox width="100%" height={160} borderRadius={14} />
      <View style={styles.cardBody}>
        <SkeletonLine width="85%" height={18} />
        <SkeletonLine width="55%" height={14} />
        <SkeletonLine width="40%" height={12} />
      </View>
    </View>
  );
}

export function FeedListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.root} accessibilityRole="progressbar" accessibilityLabel="Loading feed">
      {Array.from({ length: count }, (_, i) => (
        <FeedCardSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: SynthTokens.spacing.md,
    paddingVertical: SynthTokens.spacing.md,
    gap: 16,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  cardBody: { padding: 12, gap: 8 },
});
