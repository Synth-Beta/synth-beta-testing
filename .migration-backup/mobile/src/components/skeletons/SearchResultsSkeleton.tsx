import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SynthTokens } from '../../tokens/SynthTokens';
import { SkeletonBox, SkeletonLine } from './SkeletonPrimitives';

function RowSkeleton() {
  return (
    <View style={styles.row}>
      <SkeletonBox width={48} height={48} borderRadius={24} />
      <View style={styles.mid}>
        <SkeletonLine width="68%" height={14} />
        <SkeletonLine width="42%" height={12} />
      </View>
    </View>
  );
}

export function SearchResultsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel="Loading search results">
      {Array.from({ length: count }, (_, i) => (
        <RowSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: SynthTokens.spacing.md, gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: SynthTokens.spacing.md,
    padding: 12,
    borderRadius: SynthTokens.radius.medium,
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  mid: { flex: 1, gap: 8 },
});

