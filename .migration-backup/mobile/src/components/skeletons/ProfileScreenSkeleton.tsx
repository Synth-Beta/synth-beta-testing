import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SynthTokens } from '../../tokens/SynthTokens';
import { SkeletonBox, SkeletonLine } from './SkeletonPrimitives';

function ReviewRowSkeleton() {
  return (
    <View style={styles.rowCard}>
      <SkeletonBox width={56} height={56} borderRadius={10} />
      <View style={{ flex: 1, gap: 8 }}>
        <SkeletonLine width="70%" height={14} />
        <SkeletonLine width="48%" height={12} />
      </View>
      <SkeletonLine width={36} height={12} />
    </View>
  );
}

export function ProfileScreenSkeleton() {
  return (
    <View style={styles.root} accessibilityRole="progressbar" accessibilityLabel="Loading profile">
      <View style={styles.profileCard}>
        <View style={styles.cardTop}>
          <SkeletonBox width={88} height={88} borderRadius={44} />
          <View style={{ flex: 1, gap: 8 }}>
            <SkeletonLine width="60%" height={18} />
            <SkeletonLine width="36%" height={12} />
            <SkeletonLine width="85%" height={12} />
          </View>
        </View>
      </View>

      <View style={styles.tabs}>
        <SkeletonBox width="33%" height={38} borderRadius={12} />
        <SkeletonBox width="33%" height={38} borderRadius={12} />
        <SkeletonBox width="33%" height={38} borderRadius={12} />
      </View>

      <View style={{ gap: 12 }}>
        {Array.from({ length: 5 }, (_, i) => (
          <ReviewRowSkeleton key={i} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    padding: SynthTokens.spacing.md,
    paddingBottom: 100,
    gap: SynthTokens.spacing.md,
    backgroundColor: SynthTokens.colors.neutral50,
    flex: 1,
  },
  profileCard: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 18,
    padding: SynthTokens.spacing.lg,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  tabs: {
    flexDirection: 'row',
    gap: 8,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
});

