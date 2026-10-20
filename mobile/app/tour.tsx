import React, { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { FeatureTourSlide } from '../src/components/FeatureTour';
import { supabase } from '../src/integrations/supabase/client';
import { finishTour } from '../lib/featureTour';
import { advanceTour, getTour, isTaskStep, startTour, useTour } from '../lib/tourProgress';

/**
 * Tour slides. Opened once after onboarding, from the app menu, or from sign-in (signed out).
 * When the next step is a live task, this screen closes and TourTaskBanner takes over in the
 * app; the banner reopens this screen for the next slide.
 */
export default function TourScreen() {
  const router = useRouter();
  const tour = useTour();
  const leavingForTask = useRef(false);

  // Fresh open (menu, auto-open, sign-in): start at step 1. Reopened by the banner: keep going.
  useEffect(() => {
    if (getTour()) return;
    void supabase.auth.getSession().then(({ data: { session } }) => startTour(Boolean(session?.user)));
  }, []);

  const leave = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (router.canGoBack()) router.back();
    else router.replace(session ? '/(tabs)' : '/(auth)/sign-in');
  }, [router]);

  const done = useCallback(async () => {
    await finishTour();
    await leave();
  }, [leave]);

  // Swiped / back-buttoned away from a slide: treat it as skipping the rest.
  useEffect(
    () => () => {
      const current = getTour();
      if (current && !leavingForTask.current && !isTaskStep(current.step)) void finishTour();
    },
    []
  );

  if (!tour || isTaskStep(tour.step)) return <View style={{ flex: 1, backgroundColor: '#fff' }} />;

  return (
    <FeatureTourSlide
      step={tour.step}
      index={tour.index}
      total={tour.total}
      nextIsTask={isTaskStep(tour.next)}
      onSkipTour={() => void done()}
      onNext={() => {
        const next = advanceTour();
        if (next === null) {
          void done();
        } else if (isTaskStep(next)) {
          leavingForTask.current = true;
          void leave();
        }
      }}
    />
  );
}
