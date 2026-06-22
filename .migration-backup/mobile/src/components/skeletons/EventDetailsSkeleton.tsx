import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { SynthTokens } from '../../tokens/SynthTokens';
import { SkeletonBox, SkeletonLine } from './SkeletonPrimitives';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const HERO_HEIGHT = SCREEN_HEIGHT * 0.45;

export function EventDetailsSkeleton() {
  return (
    <View style={styles.root} accessibilityRole="progressbar" accessibilityLabel="Loading event details">
      <SkeletonBox width="100%" height={HERO_HEIGHT} borderRadius={0} />
      <View style={styles.body}>
        <SkeletonLine width="70%" height={20} />
        <SkeletonLine width="48%" height={14} />
        <SkeletonLine width="56%" height={14} />

        <View style={styles.actions}>
          <SkeletonBox width="48%" height={46} borderRadius={14} />
          <SkeletonBox width="48%" height={46} borderRadius={14} />
        </View>

        <View style={styles.section}>
          <SkeletonLine width="28%" height={14} />
          <SkeletonLine width="92%" height={14} />
          <SkeletonLine width="76%" height={14} />
        </View>

        <View style={styles.section}>
          <SkeletonLine width="34%" height={14} />
          {Array.from({ length: 3 }, (_, i) => (
            <View key={i} style={styles.friendRow}>
              <SkeletonBox width={36} height={36} borderRadius={18} />
              <SkeletonLine width="40%" height={12} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
  body: { padding: SynthTokens.spacing.md, gap: 10 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 6, marginBottom: 6 },
  section: {
    marginTop: 10,
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});

