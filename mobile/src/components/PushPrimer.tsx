import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BellRing } from 'lucide-react-native';
import { SynthText } from './SynthText';
import { SynthButton } from './SynthButton';
import { SynthTokens } from '../tokens/SynthTokens';
import { supabase } from '../integrations/supabase/client';
import { getNotificationPermissionStatus } from '../../lib/registerPushNotifications';
import { syncExpoPushTokenWithBackend } from '../../lib/pushTokenSync';
import { shouldAutoOpenFeatureTour } from '../../lib/featureTour';
import { isTourActive } from '../../lib/tourProgress';
import {
  PushPrimerReason,
  loadPrimerState,
  onFeatureTourClosed,
  onPushPrimerRequest,
  primerAllowed,
  recordPrimerShown,
  requestPushPrimer,
} from '../../lib/pushPrimer';

// How long someone uses the app (after the tour) before the session-based ask.
const SESSION_DELAY_MS = 45_000;

const COPY: Record<PushPrimerReason, { title: string; body: string }> = {
  interested: {
    title: 'Get a reminder before the show',
    body: 'We’ll ping you a week before and the day before, and when artists you follow announce shows near you.',
  },
  session: {
    title: 'Never miss a show',
    body: 'Get a heads-up when artists you follow announce shows near you, plus reminders for shows you save.',
  },
};

/** Mounted once in the tab layout, so it only ever runs after onboarding. */
export function PushPrimer() {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<PushPrimerReason | null>(null);
  const busy = useRef(false);

  const tryShow = useCallback(async (r: PushPrimerReason) => {
    // Never on top of the app tour; the session ask restarts when the tour closes.
    if (busy.current || isTourActive()) return;
    busy.current = true;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;
      const permission = await getNotificationPermissionStatus();
      if (permission !== 'undetermined') return; // granted: already syncing; denied: iOS won't re-ask
      const state = await loadPrimerState(userId);
      if (!primerAllowed(state, Date.now())) return;
      await recordPrimerShown(userId, state);
      setReason(r);
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => onPushPrimerRequest(r => void tryShow(r)), [tryShow]);

  // Session ask: 45s into using the app, once the tour is out of the way.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const start = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => requestPushPrimer('session'), SESSION_DELAY_MS);
    };
    const off = onFeatureTourClosed(start);
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      // Tour about to open: wait for onFeatureTourClosed instead.
      if (session?.user && !(await shouldAutoOpenFeatureTour(session.user))) start();
    })();
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, []);

  const close = () => setReason(null);
  const enable = async () => {
    close();
    await syncExpoPushTokenWithBackend({ prompt: true });
  };

  if (!reason) return null;
  const { title, body } = COPY[reason];

  return (
    <Modal transparent animationType="slide" visible onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Dismiss" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + SynthTokens.spacing.md }]}>
        <View style={styles.iconWrap}>
          <BellRing size={28} color={SynthTokens.colors.brandPink500} />
        </View>
        <SynthText variant="h2" style={styles.title} accessibilityRole="header">{title}</SynthText>
        <SynthText variant="meta" color="secondary" style={styles.body}>{body}</SynthText>
        <SynthButton title="Turn on notifications" variant="primary" onPress={() => void enable()} style={styles.button} />
        <SynthButton title="Not now" variant="ghost" onPress={close} style={styles.button} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: SynthTokens.colors.overlay50 },
  sheet: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: SynthTokens.spacing.lg,
    paddingTop: SynthTokens.spacing.lg,
    gap: SynthTokens.spacing.sm,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: SynthTokens.colors.brandPink050,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SynthTokens.spacing.sm,
  },
  title: {},
  body: { marginBottom: SynthTokens.spacing.sm },
  button: { width: '100%' },
});
