import React, { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold
} from '@expo-google-fonts/inter';
import { supabase } from '../src/integrations/supabase/client';
import { OnboardingService } from '../src/services/onboardingService';
import { ensureExpoPushNotificationHandler } from '../lib/registerPushNotifications';
import { syncExpoPushTokenWithBackend } from '../lib/pushTokenSync';
import { NotificationService } from '../src/services/notificationService';
import { useShareDeepLink } from '../lib/useShareDeepLink';
import { loadPendingShareLink } from '../lib/shareDeepLinkStorage';
import { InterestedProvider } from '../src/contexts/InterestedContext';
import { AppLoadingSkeleton } from '../src/components/AppLoadingSkeleton';
import { ensurePublicUserProfile } from '../src/services/publicUserRecoveryService';

// Hide the native splash as soon as JS is running so the skeleton takes over immediately.
void SplashScreen.hideAsync().catch(() => {});

const ONBOARDING_STORAGE_KEY = 'HAS_COMPLETED_ONBOARDING';
/** First wizard step — skip marketing welcome, go straight to profile setup */
const ONBOARDING_FLOW_ENTRY = '/(onboarding)/profile';
/** If `useFonts` never resolves (no error), do not block app boot forever. */
const FONT_LOAD_TIMEOUT_MS = 10_000;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-Bold': Inter_700Bold,
  });

  const [fontLoadTimedOut, setFontLoadTimedOut] = useState(false);

  const [storageOnboardingComplete, setStorageOnboardingComplete] = useState<boolean | null>(null);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);
  const [onboardingEffectiveReady, setOnboardingEffectiveReady] = useState(false);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    async function loadOnboardingStatus() {
      try {
        const value = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
        setStorageOnboardingComplete(value === 'true');
      } catch {
        setStorageOnboardingComplete(false);
      }
    }
    void loadOnboardingStatus();
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Cap the initial session check at 6 s so a stale stored token trying to
    // refresh against a slow/wrong network cannot block the loading skeleton
    // indefinitely.  onAuthStateChange will still deliver the real session if
    // the refresh eventually succeeds.
    const fallbackTimer = setTimeout(() => {
      if (!cancelled) setSession(null);
    }, 6000);

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      clearTimeout(fallbackTimer);
      if (!cancelled) setSession(s ?? null);
    }).catch(() => {
      clearTimeout(fallbackTimer);
      if (!cancelled) setSession(null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      clearTimeout(fallbackTimer);
      setSession(s ?? null);
    });
    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    let cancelled = false;

    const recoverProfileRow = async () => {
      const result = await ensurePublicUserProfile();
      if (cancelled) return;
      if (!result.success) {
        console.error('[root] Failed to ensure public.users row:', result.error);
      }
    };

    void recoverProfileRow();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (session === undefined) return;
    if (storageOnboardingComplete === null) return;

    if (!session?.user) {
      setIsOnboardingComplete(storageOnboardingComplete);
      setOnboardingEffectiveReady(true);
      return;
    }

    let cancelled = false;
    setOnboardingEffectiveReady(false);
    void (async () => {
      try {
        const fromServer = await OnboardingService.isOnboardingCompletedInProfile(session.user.id);
        if (cancelled) return;
        const effective = storageOnboardingComplete || fromServer;
        setIsOnboardingComplete(effective);
        if (fromServer) {
          try {
            await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
          } catch {
            /* ignore */
          }
        }
      } catch (err) {
        if (cancelled) return;
        console.warn('[root] onboarding profile fetch', err);
        setIsOnboardingComplete(storageOnboardingComplete);
      } finally {
        if (!cancelled) setOnboardingEffectiveReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, storageOnboardingComplete]);

  useEffect(() => {
    ensureExpoPushNotificationHandler();
  }, []);

  useEffect(() => {
    if (fontError) {
      console.warn('[root] Inter fonts failed to load; continuing with system fonts', fontError);
    }
  }, [fontError]);

  useEffect(() => {
    if (fontsLoaded || fontError) return;
    const t = setTimeout(() => {
      console.warn('[root] Inter fonts still loading after timeout; continuing with system fonts');
      setFontLoadTimedOut(true);
    }, FONT_LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [fontsLoaded, fontError]);

  const fontsReady = fontsLoaded || Boolean(fontError) || fontLoadTimedOut;

  const routingReady =
    fontsReady &&
    session !== undefined &&
    storageOnboardingComplete !== null &&
    onboardingEffectiveReady;

  // SplashScreen is hidden immediately on JS mount (see top of file).
  // No further hide call needed here.

  useEffect(() => {
    if (!session?.user) return;
    const userId = session.user.id;

    syncExpoPushTokenWithBackend().catch((err) => {
      console.warn('[push] token sync failed on sign-in', err);
    });

    // Sync the system badge with DB unread counts on login/boot.
    // This prevents the icon from getting stuck at an old value.
    void (async () => {
      try {
        const unread = await NotificationService.getUnreadCount(userId);
        await Notifications.setBadgeCountAsync(unread);
      } catch {
        /* best-effort */
      }
    })();
  }, [session]);

  // Re-register the push token whenever the app returns to the foreground. This is
  // the main lever for token COVERAGE: it catches users who enabled notifications
  // in iOS Settings after a denial, whose Expo token rotated, or whose first
  // registration failed silently — without it, a user who fixes their permission
  // never gets a token until the next cold launch. Throttled so a quick
  // background/foreground bounce doesn't spam the RPC.
  const lastPushSyncRef = useRef(0);
  useEffect(() => {
    const maybeSync = (state: AppStateStatus) => {
      if (state !== 'active') return;
      if (!session?.user) return;
      const now = Date.now();
      if (now - lastPushSyncRef.current < 60_000) return; // at most once/min
      lastPushSyncRef.current = now;
      syncExpoPushTokenWithBackend().catch((err) => {
        console.warn('[push] token re-sync on foreground failed', err);
      });
    };
    const sub = AppState.addEventListener('change', maybeSync);
    return () => sub.remove();
  }, [session]);

  useShareDeepLink(Boolean(session?.user && isOnboardingComplete));

  useEffect(() => {
    if (!routingReady) return;

    const seg0 = segments[0];

    // `useSegments()` can be empty at `/` before `app/index.tsx` resolves — otherwise no branch matches and the UI can stall.
    if (seg0 === undefined) {
      void (async () => {
        const pendingShare = await loadPendingShareLink();
        // Let useShareDeepLink route to /event or /review instead of overwriting with home.
        if (pendingShare && session && isOnboardingComplete) {
          return;
        }
        if (!session) {
          router.replace('/(auth)/sign-in');
        } else if (!isOnboardingComplete) {
          router.replace(ONBOARDING_FLOW_ENTRY);
        } else {
          router.replace('/(tabs)');
        }
      })();
      return;
    }

    const inAuth = seg0 === '(auth)';
    const inOnboarding = seg0 === '(onboarding)';
    const needsAuth =
      seg0 === '(tabs)' ||
      seg0 === 'chat' ||
      seg0 === 'event' ||
      seg0 === 'review' ||
      seg0 === 'notifications' ||
      seg0 === 'friend-requests' ||
      seg0 === 'profile-friends' ||
      seg0 === 'profile-following' ||
      seg0 === 'stats' ||
      seg0 === 'modal' ||
      seg0 === 'profile-edit' ||
      seg0 === 'my-events' ||
      seg0 === 'interested-events' ||
      seg0 === 'settings' ||
      seg0 === 'app-menu' ||
      seg0 === 'user' ||
      seg0 === 'artist' ||
      seg0 === 'venue';

    if (!session && needsAuth) {
      router.replace('/(auth)/sign-in');
      return;
    }

    if (!isOnboardingComplete && needsAuth && session) {
      router.replace(ONBOARDING_FLOW_ENTRY);
      return;
    }

    if (session && inAuth) {
      router.replace(isOnboardingComplete ? '/(tabs)' : ONBOARDING_FLOW_ENTRY);
      return;
    }

    if (isOnboardingComplete && inOnboarding) {
      if (session) {
        router.replace('/(tabs)');
      } else {
        router.replace('/(auth)/sign-in');
      }
      return;
    }

    if (!isOnboardingComplete && !inOnboarding && !inAuth) {
      if (session) {
        router.replace(ONBOARDING_FLOW_ENTRY);
      } else {
        router.replace('/(auth)/sign-in');
      }
    }
  }, [routingReady, isOnboardingComplete, session, segments, router]);

  if (!routingReady) {
    return <AppLoadingSkeleton />;
  }

  return (
    <InterestedProvider>
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(onboarding)" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="profile-edit" options={{ headerShown: false }} />
      <Stack.Screen name="my-events" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="app-menu" options={{ headerShown: false, animation: 'slide_from_right' }} />
    </Stack>
    </InterestedProvider>
  );
}
