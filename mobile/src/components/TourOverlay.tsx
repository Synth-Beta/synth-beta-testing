import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';
import { CheckCircle2 } from 'lucide-react-native';
import { SynthTokens } from '../tokens/SynthTokens';
import { advanceTour, onTourAction, useTour, type TourAction, type TourStepId } from '../../lib/tourProgress';
import { measureInWindow, measureTourTarget, type TourRect, type TourTargetId } from '../../lib/tourTargets';
import { finishTour } from '../../lib/featureTour';

const PINK = SynthTokens.colors.brandPink500;
const SUCCESS_MS = 1300;
const POLL_MS = 250; // follows the target while the user scrolls or a tab lays out
const HOLE_PAD = 8;
const GAP = 16; // between the spotlight and the tip card
const ARROW = 14;
const CARD_X = 16;

type StepDef = {
  /** Page the step talks about; the tutorial opens it. */
  route: Href;
  target: TourTargetId;
  title: string;
  body: string;
  /** Live step: completes when the user does this for real (taps go through the spotlight). */
  action?: TourAction;
  done?: string;
};

// Short on purpose: one idea per step, naming the control being spotlighted.
const STEPS: Record<TourStepId, StepDef> = {
  feed: {
    route: '/(tabs)',
    target: 'feed-card',
    title: 'Your feed',
    body: 'Shows picked for you, mixed with reviews from people who went.',
  },
  save: {
    route: '/(tabs)',
    target: 'interested-btn',
    action: 'interested',
    title: 'Save a show',
    body: "Tap I'm interested. We'll remind you before the show.",
    done: "Saved! We'll remind you.",
  },
  community: {
    route: '/(tabs)/discover',
    target: 'tab-discover',
    title: 'Community',
    body: 'Reviews from everyone on Synth, plus your Pick5 link.',
  },
  review: {
    route: '/(tabs)',
    target: 'tab-post',
    action: 'review',
    title: 'Review a show',
    body: 'Been to a show lately? Tap the pink + to rate it and say what stood out.',
    done: 'Review posted. Nice!',
  },
  messages: {
    route: '/(tabs)/chat',
    target: 'tab-chat',
    title: 'Messages',
    body: 'Your chats and genre communities live here.',
  },
  profile: {
    route: '/(tabs)/profile',
    target: 'tab-profile',
    title: 'Your profile',
    body: 'Your Passport, saved shows and friends. Replay this tutorial anytime in Settings.',
  },
};

const sameRect = (a: TourRect | null, b: TourRect | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);

/**
 * App tutorial on the real screens: dims the app, cuts a spotlight around the control the step
 * is about, points at it with a pulsing ring + arrow, and explains it in a tip card. Mounted once
 * in the tab layout, above the tab bar.
 */
export function TourOverlay() {
  const tour = useTour();
  const router = useRouter();
  const pathname = usePathname();
  const rootRef = useRef<View>(null);
  const [rect, setRect] = useState<TourRect | null>(null);
  const [rootSize, setRootSize] = useState({ width: 0, height: 0 });
  const rootHeight = rootSize.height;
  const [success, setSuccess] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;

  const step = tour?.step;
  const def = step ? STEPS[step] : null;

  const leave = () => {
    void finishTour();
    router.navigate('/(tabs)');
  };

  const moveOn = () => {
    setSuccess(false);
    if (advanceTour() === null) leave();
  };

  // Open the page this step talks about.
  useEffect(() => {
    setRect(null);
    setSuccess(false);
    if (def) router.navigate(def.route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Keep the spotlight on the target (scrolling, layout, tab switches).
  useEffect(() => {
    if (!def) return;
    let alive = true;
    const tick = async () => {
      const [target, origin] = await Promise.all([measureTourTarget(def.target), measureInWindow(rootRef.current)]);
      if (!alive) return;
      const next =
        target && origin ? { ...target, x: target.x - origin.x, y: target.y - origin.y } : null;
      setRect((prev) => (sameRect(prev, next) ? prev : next));
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [def]);

  // The real action happened: a quick "done", then the next step.
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

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // The review form (Post tab) needs the whole screen; the step completes when it's submitted.
  if (!tour || !def || pathname === '/post') return null;

  const isTask = !!def.action;
  const hole = rect
    ? { x: rect.x - HOLE_PAD, y: rect.y - HOLE_PAD, width: rect.width + HOLE_PAD * 2, height: rect.height + HOLE_PAD * 2 }
    : null;
  // Tip goes on whichever side of the spotlight has more room.
  const below = !hole || hole.y + hole.height / 2 < rootHeight / 2;
  const cardPos = !hole
    ? { top: rootHeight / 3 }
    : below
      ? { top: hole.y + hole.height + GAP }
      : { bottom: rootHeight - hole.y + GAP };
  // Arrow sits on the card edge (card is inset CARD_X from the screen), under the target's center.
  const arrowLeft = hole
    ? Math.min(Math.max(hole.x + hole.width / 2 - CARD_X - ARROW / 2, 14), rootSize.width - CARD_X * 2 - ARROW - 14)
    : 0;

  const onLayout = (e: LayoutChangeEvent) =>
    setRootSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  return (
    <View
      ref={rootRef}
      onLayout={onLayout}
      style={styles.root}
      pointerEvents="box-none"
      accessibilityViewIsModal={!isTask}
    >
      {hole ? (
        <>
          {/* Four dim panels around the spotlight; they block taps, the hole doesn't on live steps. */}
          <View style={[styles.dim, { top: 0, left: 0, right: 0, height: Math.max(hole.y, 0) }]} />
          <View style={[styles.dim, { top: hole.y + hole.height, left: 0, right: 0, bottom: 0 }]} />
          <View style={[styles.dim, { top: hole.y, height: hole.height, left: 0, width: Math.max(hole.x, 0) }]} />
          <View style={[styles.dim, { top: hole.y, height: hole.height, left: hole.x + hole.width, right: 0 }]} />
          {!isTask ? <View style={[styles.block, hole]} /> : null}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ring,
              hole,
              {
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }],
              },
            ]}
          />
        </>
      ) : isTask ? null : (
        // Target not on screen yet: dim everything. Live steps stay undimmed so the user can scroll to it.
        <View style={[styles.dim, StyleSheet.absoluteFill]} />
      )}

      <View style={[styles.cardWrap, cardPos]} pointerEvents="box-none">
        {hole ? (
          <View style={[styles.arrow, below ? { top: -ARROW / 2 } : { bottom: -ARROW / 2 }, { left: arrowLeft }]} />
        ) : null}
        <View style={styles.card} accessibilityLiveRegion="polite">
          {success ? (
            <View style={styles.successRow}>
              <CheckCircle2 size={22} color={SynthTokens.colors.success} />
              <Text style={styles.title}>{def.done}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.step}>
                STEP {tour.index + 1} OF {tour.total}
                {isTask ? ' · TRY IT' : ''}
              </Text>
              <Text style={styles.title} accessibilityRole="header">
                {def.title}
              </Text>
              <Text style={styles.body}>{def.body}</Text>
              {isTask && !hole && def.action === 'interested' ? (
                <Text style={styles.hint}>Scroll to any upcoming show to find the button.</Text>
              ) : null}
              <View style={styles.actions}>
                <Pressable onPress={leave} hitSlop={8} style={styles.textBtn} accessibilityRole="button">
                  <Text style={styles.textBtnTxt}>Skip tutorial</Text>
                </Pressable>
                {isTask ? (
                  <Pressable onPress={moveOn} hitSlop={8} style={styles.textBtn} accessibilityRole="button" accessibilityLabel="Skip this step">
                    <Text style={styles.textBtnTxt}>Skip step</Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={moveOn} style={styles.primaryBtn} accessibilityRole="button">
                    <Text style={styles.primaryTxt}>{tour.next ? 'Next' : 'Done'}</Text>
                  </Pressable>
                )}
              </View>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Above the tab bar (zIndex 200 / elevation 24 on Android).
  root: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: Platform.OS === 'android' ? 50 : 0 },
  dim: { position: 'absolute', backgroundColor: 'rgba(10, 10, 20, 0.62)' },
  block: { position: 'absolute' },
  ring: { position: 'absolute', borderWidth: 3, borderColor: PINK, borderRadius: 16 },
  cardWrap: { position: 'absolute', left: CARD_X, right: CARD_X },
  arrow: {
    position: 'absolute',
    width: ARROW,
    height: ARROW,
    backgroundColor: SynthTokens.colors.neutral0,
    transform: [{ rotate: '45deg' }],
  },
  card: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
    shadowColor: '#0E0E0E',
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  step: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: PINK },
  title: { fontSize: 17, fontWeight: '700', color: SynthTokens.colors.neutral900 },
  body: { fontSize: 14, lineHeight: 20, color: SynthTokens.colors.neutral600 },
  hint: { fontSize: 13, lineHeight: 18, color: SynthTokens.colors.neutral600, fontStyle: 'italic' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  textBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  textBtnTxt: { fontSize: 15, fontWeight: '600', color: SynthTokens.colors.neutral600 },
  primaryBtn: { backgroundColor: PINK, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20 },
  primaryTxt: { fontSize: 15, fontWeight: '700', color: '#FFFDFA' },
  successRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
});
