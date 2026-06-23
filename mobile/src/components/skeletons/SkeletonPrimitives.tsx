import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, type ViewStyle, Animated, Easing, AccessibilityInfo } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SynthTokens } from '../../tokens/SynthTokens';

const BG = SynthTokens.colors.neutral200;
const HIGHLIGHT = 'rgba(204, 36, 134, 0.12)';

function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(v => {
      if (mounted) setReduced(Boolean(v));
    });
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', v => {
      if (mounted) setReduced(Boolean(v));
    });
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}

function SkeletonShimmer({ borderRadius }: { borderRadius: number }) {
  const reduceMotion = useReduceMotion();
  const x = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(x, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, x]);

  if (reduceMotion) return null;

  const translateX = x.interpolate({
    inputRange: [0, 1],
    outputRange: [-140, 140],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          transform: [{ translateX }],
          opacity: 1,
        },
      ]}
    >
      <LinearGradient
        colors={['transparent', HIGHLIGHT, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ flex: 1, borderRadius }}
      />
    </Animated.View>
  );
}

export function SkeletonBox({
  width,
  height,
  borderRadius = 8,
  style,
  shimmer = true,
}: {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
  shimmer?: boolean;
}) {
  return (
    <View style={[styles.box, { width, height, borderRadius }, style]}>
      {shimmer ? <SkeletonShimmer borderRadius={borderRadius} /> : null}
    </View>
  );
}

export function SkeletonLine({
  width = '100%' as const,
  height = 14,
  style,
  shimmer,
}: {
  width?: number | `${number}%`;
  height?: number;
  style?: ViewStyle;
  shimmer?: boolean;
}) {
  return <SkeletonBox width={width} height={height} borderRadius={6} style={style} shimmer={shimmer} />;
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: BG,
    overflow: 'hidden',
  },
});
