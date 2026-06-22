import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SynthTokens } from '../../tokens/SynthTokens';
import { SkeletonBox, SkeletonLine } from './SkeletonPrimitives';

export function SettingsScreenSkeleton({ paddingTop }: { paddingTop: number }) {
  return (
    <View style={[styles.root, { paddingTop }]}>
      <View style={styles.header}>
        <SkeletonBox width={28} height={28} borderRadius={8} />
        <SkeletonLine width={120} height={22} />
        <View style={{ width: 28 }} />
      </View>
      <View style={styles.body}>
        <View style={styles.profileCard}>
          <SkeletonBox width={56} height={56} borderRadius={28} />
          <View style={styles.profileText}>
            <SkeletonLine width="70%" height={18} />
            <SkeletonLine width="50%" height={14} />
          </View>
        </View>
        <SkeletonLine width={140} height={12} style={styles.sectionGap} />
        <View style={styles.card}>
          {[1, 2, 3].map(i => (
            <View key={i} style={styles.row}>
              <SkeletonBox width={36} height={36} borderRadius={10} />
              <View style={styles.rowMid}>
                <SkeletonLine width="55%" height={16} />
                <SkeletonLine width="40%" height={12} />
              </View>
            </View>
          ))}
        </View>
        <SkeletonLine width={80} height={12} style={styles.sectionGap} />
        <View style={styles.card}>
          {[1, 2, 3, 4].map(i => (
            <View key={i} style={styles.rowTall}>
              <SkeletonBox width={36} height={36} borderRadius={10} />
              <View style={styles.rowMid}>
                <SkeletonLine width="65%" height={16} />
                <SkeletonLine width="85%" height={12} />
              </View>
            </View>
          ))}
        </View>
        <SkeletonLine width={100} height={12} style={styles.sectionGap} />
        <View style={styles.card}>
          <View style={styles.rowTall}>
            <SkeletonBox width={36} height={36} borderRadius={10} />
            <View style={styles.rowMid}>
              <SkeletonLine width="45%" height={16} />
              <SkeletonLine width="75%" height={12} />
            </View>
          </View>
        </View>
        <SkeletonBox width="100%" height={48} borderRadius={14} style={styles.signOut} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SynthTokens.spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  body: { padding: SynthTokens.spacing.md, gap: 12 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: SynthTokens.colors.brandPink050,
    borderWidth: 1,
    borderColor: 'rgba(204, 36, 134, 0.15)',
  },
  profileText: { flex: 1, gap: 8 },
  sectionGap: { marginTop: 8, marginBottom: -4 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
    overflow: 'hidden',
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rowTall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 56,
  },
  rowMid: { flex: 1, gap: 6 },
  signOut: { marginTop: 8 },
});
