import React, { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { FeatureTour } from '../src/components/FeatureTour';
import { supabase } from '../src/integrations/supabase/client';
import { markFeatureTourSeen } from '../lib/featureTour';
import { notifyFeatureTourClosed } from '../lib/pushPrimer';

/** Feature walkthrough. Opened once after onboarding, from the app menu, or from sign-in (signed out). */
export default function TourScreen() {
  const router = useRouter();

  const onDone = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await markFeatureTourSeen(session.user.id);
      notifyFeatureTourClosed();
    }
    if (router.canGoBack()) router.back();
    else router.replace(session ? '/(tabs)' : '/(auth)/sign-in');
  }, [router]);

  return <FeatureTour onDone={() => void onDone()} />;
}
