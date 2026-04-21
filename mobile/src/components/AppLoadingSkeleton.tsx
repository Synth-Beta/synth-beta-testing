import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, StatusBar, Animated, Easing, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { SynthTokens } from '../tokens/SynthTokens';

const { width: SCREEN_W } = Dimensions.get('window');
const BG = SynthTokens.colors.neutral50;
const CARD_BG = SynthTokens.colors.neutral0;
const BORDER = SynthTokens.colors.neutral200;
const SKELETON = SynthTokens.colors.neutral200;
const PINK = SynthTokens.colors.brandPink500;
const PAD = 16;

// ─── Shared shimmer animation ──────────────────────────────────────────────
function useShimmer() {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(x, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [x]);
  return x;
}

function Shimmer({ shimmerX }: { shimmerX: Animated.Value }) {
  const translateX = shimmerX.interpolate({
    inputRange: [0, 1],
    outputRange: [-SCREEN_W * 0.8, SCREEN_W * 0.8],
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}
    >
      <LinearGradient
        colors={['transparent', 'rgba(204, 36, 134, 0.10)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
}

function Bone({
  w,
  h,
  r = 8,
  shimmerX,
}: {
  w: number | `${number}%`;
  h: number;
  r?: number;
  shimmerX: Animated.Value;
}) {
  return (
    <View style={[styles.bone, { width: w, height: h, borderRadius: r }]}>
      <Shimmer shimmerX={shimmerX} />
    </View>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────
function HeaderSkeleton({ topInset, shimmerX }: { topInset: number; shimmerX: Animated.Value }) {
  return (
    <View style={[styles.header, { paddingTop: topInset + 12 }]}>
      {/* Synth wordmark placeholder */}
      <Bone w={72} h={26} r={6} shimmerX={shimmerX} />
      <View style={styles.headerRight}>
        <Bone w={36} h={36} r={18} shimmerX={shimmerX} />
        <Bone w={36} h={36} r={18} shimmerX={shimmerX} />
      </View>
    </View>
  );
}

// ─── Mode toggle (Events / Reviews) ───────────────────────────────────────
function ToggleSkeleton({ shimmerX }: { shimmerX: Animated.Value }) {
  return (
    <View style={styles.toggle}>
      <Bone w={108} h={36} r={20} shimmerX={shimmerX} />
      <Bone w={108} h={36} r={20} shimmerX={shimmerX} />
    </View>
  );
}

// ─── Single event card ─────────────────────────────────────────────────────
function CardSkeleton({ shimmerX }: { shimmerX: Animated.Value }) {
  return (
    <View style={styles.card}>
      {/* Hero image */}
      <View style={styles.cardImage}>
        <Shimmer shimmerX={shimmerX} />
      </View>
      {/* Body */}
      <View style={styles.cardBody}>
        <Bone w="75%" h={18} r={6} shimmerX={shimmerX} />
        <View style={styles.metaRow}>
          <Bone w={16} h={16} r={4} shimmerX={shimmerX} />
          <Bone w="45%" h={13} r={5} shimmerX={shimmerX} />
        </View>
        <View style={styles.metaRow}>
          <Bone w={16} h={16} r={4} shimmerX={shimmerX} />
          <Bone w="55%" h={13} r={5} shimmerX={shimmerX} />
        </View>
        <View style={styles.metaRow}>
          <Bone w={16} h={16} r={4} shimmerX={shimmerX} />
          <Bone w="38%" h={13} r={5} shimmerX={shimmerX} />
        </View>
      </View>
      {/* Action row */}
      <View style={styles.cardActions}>
        <Bone w="65%" h={44} r={12} shimmerX={shimmerX} />
        <Bone w={44} h={44} r={12} shimmerX={shimmerX} />
        <Bone w={44} h={44} r={12} shimmerX={shimmerX} />
      </View>
    </View>
  );
}

// ─── Bottom tab bar ────────────────────────────────────────────────────────
function TabBarSkeleton({ bottomInset, shimmerX }: { bottomInset: number; shimmerX: Animated.Value }) {
  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(bottomInset, 8) + 8 }]}>
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={styles.tabItem}>
          <Bone w={24} h={24} r={6} shimmerX={shimmerX} />
          <Bone w={32} h={10} r={4} shimmerX={shimmerX} />
        </View>
      ))}
    </View>
  );
}

// ─── Pink loading bar at the very top ─────────────────────────────────────
function LoadingBar() {
  const pos = useRef(new Animated.Value(-SCREEN_W)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pos, {
          toValue: SCREEN_W,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pos, {
          toValue: -SCREEN_W,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pos]);

  return (
    <View style={styles.loadingBarTrack}>
      <Animated.View
        style={[styles.loadingBar, { transform: [{ translateX: pos }] }]}
      />
    </View>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────
export function AppLoadingSkeleton() {
  const insets = useSafeAreaInsets();
  const shimmerX = useShimmer();

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <LoadingBar />
      <HeaderSkeleton topInset={insets.top} shimmerX={shimmerX} />
      <ToggleSkeleton shimmerX={shimmerX} />
      <View style={styles.feed}>
        <CardSkeleton shimmerX={shimmerX} />
        <CardSkeleton shimmerX={shimmerX} />
      </View>
      <TabBarSkeleton bottomInset={insets.bottom} shimmerX={shimmerX} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  loadingBarTrack: {
    height: 3,
    width: '100%',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  loadingBar: {
    height: 3,
    width: SCREEN_W * 0.5,
    borderRadius: 2,
    backgroundColor: PINK,
    opacity: 0.85,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: PAD,
    paddingBottom: 12,
    backgroundColor: CARD_BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 10,
  },
  toggle: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: PAD,
    paddingVertical: 10,
    backgroundColor: CARD_BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  feed: {
    flex: 1,
    paddingHorizontal: PAD,
    paddingTop: PAD,
    gap: 16,
    overflow: 'hidden',
  },
  bone: {
    backgroundColor: SKELETON,
    overflow: 'hidden',
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: 168,
    backgroundColor: SKELETON,
    overflow: 'hidden',
  },
  cardBody: {
    padding: 14,
    gap: 9,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: CARD_BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    paddingTop: 10,
    paddingHorizontal: PAD,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
});
