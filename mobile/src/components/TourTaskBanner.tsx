import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2 } from 'lucide-react-native';
import { SynthTokens } from '../tokens/SynthTokens';
import { TAB_BAR_HEIGHT } from './navigation/SynthTabBar';
import { TOUR_COPY } from './FeatureTour';
import { advanceTour, onTourAction, useTour } from '../../lib/tourProgress';
import { finishTour } from '../../lib/featureTour';

const PINK = SynthTokens.colors.brandPink500;
const SUCCESS_MS = 1300;

/**
 * Live tour step: a small card above the tab bar while the user does the real thing
 * (tap I'm interested / post a review). Completes on the real action, or Skip moves on.
 * Mounted once in the tab layout.
 */
export function TourTaskBanner() {
  const tour = useTour();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [success, setSuccess] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const step = tour?.step;
  const isTask = step === 'save' || step === 'review';

  const moveOn = () => {
    setSuccess(false);
    const next = advanceTour();
    if (next === null) void finishTour();
    else router.push('/tour');
  };

  // The real action happened: show a quick "done", then the next slide.
  useEffect(
    () =>
      onTourAction(() => {
        setSuccess(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(moveOn, SUCCESS_MS);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Hidden on the review composer (Post tab) so it never covers the form.
  if (!tour || !isTask || pathname === '/post') return null;

  const { title, body } = TOUR_COPY[step];

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: TAB_BAR_HEIGHT + insets.bottom + 10 }]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.card}>
        {success ? (
          <View style={styles.successRow}>
            <CheckCircle2 size={22} color={SynthTokens.colors.success} />
            <Text style={styles.title}>{step === 'save' ? 'Saved! We’ll remind you.' : 'Review posted. Nice!'}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.step}>
              STEP {tour.index + 1} OF {tour.total} · TRY IT
            </Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.body}>{body}</Text>
            <View style={styles.actions}>
              <Pressable onPress={moveOn} hitSlop={8} style={styles.skipBtn} accessibilityRole="button" accessibilityLabel="Skip this step">
                <Text style={styles.skipTxt}>Skip</Text>
              </Pressable>
              {step === 'review' ? (
                <Pressable onPress={() => router.push('/(tabs)/post')} style={styles.primaryBtn} accessibilityRole="button">
                  <Text style={styles.primaryTxt}>Write a review</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12 },
  card: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: PINK,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  step: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: PINK },
  title: { fontSize: 17, fontWeight: '700', color: SynthTokens.colors.neutral900 },
  body: { fontSize: 14, lineHeight: 20, color: SynthTokens.colors.neutral600 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 8 },
  skipBtn: { paddingVertical: 8, paddingHorizontal: 6 },
  skipTxt: { fontSize: 15, fontWeight: '600', color: SynthTokens.colors.neutral600 },
  primaryBtn: { backgroundColor: PINK, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 },
  primaryTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },
  successRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
});
