import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { SynthTokens } from '../../tokens/SynthTokens';

const BG = SynthTokens.colors.neutral200;

export function SkeletonBox({
  width,
  height,
  borderRadius = 8,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}) {
  return <View style={[styles.box, { width, height, borderRadius }, style]} />;
}

export function SkeletonLine({
  width = '100%' as const,
  height = 14,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  style?: ViewStyle;
}) {
  return <SkeletonBox width={width} height={height} borderRadius={6} style={style} />;
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: BG,
    overflow: 'hidden',
  },
});
