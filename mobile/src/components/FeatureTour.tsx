import React, { useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Compass,
  Heart,
  Home,
  Star,
  User,
  type LucideIcon,
} from 'lucide-react-native';
import { SynthText } from './SynthText';
import { SynthButton } from './SynthButton';
import { SynthTokens } from '../tokens/SynthTokens';

type Slide = { Icon: LucideIcon; title: string; body: string };

// Short on purpose: one idea per slide, naming the control a user taps.
const SLIDES: Slide[] = [
  {
    Icon: Home,
    title: 'Events feed',
    body: 'Home shows upcoming concerts near you from artists you follow. Tap one for details and tickets.',
  },
  {
    Icon: Star,
    title: 'Reviews feed',
    body: 'Tap “Events ▾” at the top of Home and pick Reviews to see what people thought of shows.',
  },
  {
    Icon: Compass,
    title: 'Discover',
    body: 'The compass tab. Browse by vibe, city or date, or search any artist or venue.',
  },
  {
    Icon: Heart,
    title: 'Save and review',
    body: 'Tap Interested on a show and we’ll remind you before it. Went to one? Tap the pink + to review it.',
  },
  {
    Icon: User,
    title: 'Profile',
    body: 'The last tab: your Passport, saved shows and friends. Notifications and this tour are in the menu.',
  },
];

export function FeatureTour({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;

  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * width, animated: true });
    setIndex(i);
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.topBar}>
        <SynthText variant="meta" color="secondary">
          {index + 1} of {SLIDES.length}
        </SynthText>
        {!isLast ? (
          <Pressable onPress={onDone} hitSlop={12} accessibilityRole="button" accessibilityLabel="Skip tour">
            <SynthText variant="meta" color="secondary">Skip</SynthText>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.pager}
      >
        {SLIDES.map(({ Icon, title, body }) => (
          // Inner ScrollView only matters with very large accessibility text sizes.
          <ScrollView key={title} style={{ width }} contentContainerStyle={styles.slide}>
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
        ))}
      </ScrollView>

      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {SLIDES.map((s, i) => (
          <View key={s.title} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.footer}>
        <SynthButton
          title={isLast ? 'Start exploring' : 'Next'}
          variant="primary"
          onPress={isLast ? onDone : () => goTo(index + 1)}
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
