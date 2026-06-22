import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  Animated,
  Easing,
  Dimensions,
  Text,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_W } = Dimensions.get('window');

// Must match app.json splash.backgroundColor exactly — this makes the
// native-splash → JS-loading transition invisible (no logo flash).
const SPLASH_BG = '#FDF2F8';
const PINK = '#CC2486';
const PINK_FAINT = 'rgba(204, 36, 134, 0.12)';

// ─── Subtle pulse on the logo ──────────────────────────────────────────────
function usePulse() {
  const s = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(s, {
          toValue: 1.05,
          duration: 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(s, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [s]);
  return s;
}

// ─── Glow ring that breathes around the logo ──────────────────────────────
function GlowRing() {
  const opacity = useRef(new Animated.Value(0.2)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.55,
            duration: 1200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.2,
            duration: 1200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.1,
            duration: 1200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.9,
            duration: 1200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, scale]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.glowRing,
        { opacity, transform: [{ scale }] },
      ]}
    />
  );
}

// ─── Sweeping progress bar at the bottom ──────────────────────────────────
function ProgressBar({ bottom }: { bottom: number }) {
  const x = useRef(new Animated.Value(-SCREEN_W * 0.6)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(x, {
          toValue: SCREEN_W,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(x, {
          toValue: -SCREEN_W * 0.6,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [x]);

  return (
    <View style={[styles.barTrack, { bottom: bottom + 52 }]}>
      <Animated.View style={[styles.bar, { transform: [{ translateX: x }] }]} />
    </View>
  );
}

// ─── Single animated dot ──────────────────────────────────────────────────
function AnimatedDot({ delay }: { delay: number }) {
  const op = useRef(new Animated.Value(0.2)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(op, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(op, {
          toValue: 0.2,
          duration: 600,
          useNativeDriver: true,
        }),
        // Pause so the full cycle length stays consistent regardless of delay
        Animated.delay(600 - delay),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [op, delay]);
  return <Animated.View style={[styles.dot, { opacity: op }]} />;
}

// ─── Three dots row (subtle secondary indicator) ───────────────────────────
function DotsRow() {
  return (
    <View style={styles.dotsRow}>
      <AnimatedDot delay={0} />
      <AnimatedDot delay={200} />
      <AnimatedDot delay={400} />
    </View>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────
export function AppLoadingSkeleton() {
  const insets = useSafeAreaInsets();
  const logoScale = usePulse();

  // Fade the whole screen in smoothly so even if there's a brief
  // colour difference it's never jarring.
  const screenOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(screenOpacity, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [screenOpacity]);

  return (
    <Animated.View style={[styles.root, { opacity: screenOpacity }]}>
      <StatusBar barStyle="dark-content" backgroundColor={SPLASH_BG} />

      {/* Background gradient — barely visible, adds depth */}
      <LinearGradient
        colors={['#FDF2F8', '#F9EEF5', '#FCFCFC']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      {/* Decorative soft circles in corners */}
      <View style={[styles.decorCircle, styles.decorTL]} pointerEvents="none" />
      <View style={[styles.decorCircle, styles.decorBR]} pointerEvents="none" />

      {/* ── Logo block ─────────────────────────────────────── */}
      <View style={styles.center}>
        <View style={styles.logoWrap}>
          <GlowRing />
          <Animated.View style={{ transform: [{ scale: logoScale }] }}>
            <Image
              source={require('../../assets/images/splash-icon.png')}
              style={styles.logo}
              contentFit="contain"
            />
          </Animated.View>
        </View>

        {/* Wordmark */}
        <Text style={styles.wordmark}>synth</Text>

        {/* Tagline */}
        <Text style={styles.tagline}>concerts · friends · memories</Text>

        {/* Animated dots below tagline */}
        <DotsRow />
      </View>

      {/* Sweeping progress bar */}
      <ProgressBar bottom={insets.bottom} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SPLASH_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Soft decorative blobs in corners
  decorCircle: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: PINK_FAINT,
  },
  decorTL: { top: -100, left: -100 },
  decorBR: { bottom: -100, right: -100 },

  // Logo + text block
  center: {
    alignItems: 'center',
    gap: 14,
  },
  logoWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  glowRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: PINK_FAINT,
  },
  logo: {
    width: 96,
    height: 96,
  },
  wordmark: {
    fontSize: 30,
    fontWeight: '800',
    color: PINK,
    letterSpacing: 3,
  },
  tagline: {
    fontSize: 12,
    fontWeight: '500',
    color: '#B0A8B8',
    letterSpacing: 0.6,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: PINK,
  },

  // Progress bar
  barTrack: {
    position: 'absolute',
    left: 48,
    right: 48,
    height: 2,
    backgroundColor: 'rgba(204, 36, 134, 0.15)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  bar: {
    height: 2,
    width: SCREEN_W * 0.55,
    borderRadius: 1,
    backgroundColor: PINK,
    opacity: 0.8,
  },
});
