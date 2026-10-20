import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Users, Heart, Home, User, Star, type LucideIcon } from 'lucide-react-native';
import { SynthText } from './SynthText';
import { SynthButton } from './SynthButton';
import { SynthTokens } from '../tokens/SynthTokens';
import type { TourStepId } from '../../lib/tourProgress';

type StepCopy = { Icon: LucideIcon; title: string; body: string };

// Short on purpose: one idea per step, naming the control a user taps.
export const TOUR_COPY: Record<TourStepId, StepCopy> = {
  feed: {
    Icon: Home,
    title: 'Your feed',
    body: 'Home mixes shows picked for you with reviews from people who went. Search and your location pin are at the top.',
  },
  save: {
    Icon: Heart,
    title: 'Save a show',
    body: "Tap I'm interested on any show you like. We'll remind you before it.",
  },
  'save-info': {
    Icon: Heart,
    title: 'Save and review',
    body: "Tap I'm interested on a show and we'll remind you before it. Went to one? Tap the pink + to review it.",
  },
  community: {
    Icon: Users,
    title: 'Community & Messages',
    body: 'The two-person tab has reviews from everyone on Synth and your Pick5 link. Messages has your chats and genre communities.',
  },
  review: {
    Icon: Star,
    title: 'Review a show',
    body: 'Been to a show lately? Rate it and say what stood out. Your friends see it on their feed.',
  },
  profile: {
    Icon: User,
    title: 'Your profile',
    body: 'The last tab: your Passport, saved shows and friends. Calendar, notifications and this tour are in the ☰ menu.',
  },
};

/** One full-screen tour slide. Live tasks (save / review) use TourTaskBanner instead. */
export function FeatureTourSlide({
  step,
  index,
  total,
  nextIsTask,
  onNext,
  onSkipTour,
}: {
  step: TourStepId;
  index: number;
  total: number;
  /** Next step happens in the app, so the button says "Try it". */
  nextIsTask: boolean;
  onNext: () => void;
  onSkipTour: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { Icon, title, body } = TOUR_COPY[step];
  const isLast = index === total - 1;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.topBar}>
        <SynthText variant="meta" color="secondary">
          {index + 1} of {total}
        </SynthText>
        {!isLast ? (
          <Pressable onPress={onSkipTour} hitSlop={12} accessibilityRole="button" accessibilityLabel="Skip tour">
            <SynthText variant="meta" color="secondary">Skip tour</SynthText>
          </Pressable>
        ) : null}
      </View>

      {/* ScrollView only matters with very large accessibility text sizes. */}
      <ScrollView style={styles.pager} contentContainerStyle={styles.slide}>
        <View style={styles.iconWrap}>
          <Icon size={40} color={SynthTokens.colors.brandPink500} />
        </View>
        <SynthText variant="h2" style={styles.title} accessibilityRole="header">
          {title}
        </SynthText>
        <SynthText variant="meta" color="secondary" style={styles.body}>
          {body}
        </SynthText>
      </ScrollView>

      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.footer}>
        <SynthButton
          title={isLast ? 'Start exploring' : nextIsTask ? 'Next: try it' : 'Next'}
          variant="primary"
          onPress={onNext}
          style={styles.button}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral0 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SynthTokens.spacing.screenMarginX,
    minHeight: 32,
    alignItems: 'center',
  },
  pager: { flex: 1 },
  slide: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SynthTokens.spacing.xl,
    paddingVertical: SynthTokens.spacing.lg,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: SynthTokens.colors.brandPink050,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SynthTokens.spacing.lg,
  },
  title: { marginBottom: SynthTokens.spacing.sm, textAlign: 'center' },
  body: { textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginVertical: SynthTokens.spacing.md },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: SynthTokens.colors.neutral200 },
  dotActive: { width: 18, backgroundColor: SynthTokens.colors.brandPink500 },
  footer: { paddingHorizontal: SynthTokens.spacing.screenMarginX, gap: SynthTokens.spacing.sm },
  button: { width: '100%' },
});
