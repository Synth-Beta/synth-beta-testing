import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SynthTokens } from '../../tokens/SynthTokens';
import { SkeletonBox, SkeletonLine } from './SkeletonPrimitives';

function NotificationRowSkeleton() {
  return (
    <View style={styles.row}>
      <SkeletonBox width={44} height={44} borderRadius={22} />
      <View style={styles.mid}>
        <SkeletonLine width="78%" height={14} />
        <SkeletonLine width="44%" height={12} />
      </View>
      <SkeletonBox width={36} height={36} borderRadius={18} />
    </View>
  );
}

export function NotificationsSkeleton({ count = 10 }: { count?: number }) {
  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel="Loading notifications">
      {Array.from({ length: count }, (_, i) => (
        <NotificationRowSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: SynthTokens.spacing.md, gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  mid: { flex: 1, gap: 8 },
});

