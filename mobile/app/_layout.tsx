import React, { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold
} from '@expo-google-fonts/inter';
import { supabase } from '../src/integrations/supabase/client';
import { syncExpoPushTokenWithBackend } from '../lib/pushTokenSync';
import { useShareDeepLink } from '../lib/useShareDeepLink';

// Prevent splash screen from hiding until fonts and state are ready
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-Bold': Inter_700Bold,
  });

  const [isOnboardingComplete, setIsOnboardingComplete] = useState<boolean | null>(null);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    async function loadOnboardingStatus() {
      try {
        const value = await AsyncStorage.getItem('HAS_COMPLETED_ONBOARDING');
        setIsOnboardingComplete(value === 'true');
      } catch (e) {
        setIsOnboardingComplete(false);
      }
    }
    loadOnboardingStatus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!cancelled) setSession(s ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  useEffect(() => {
    if (fontsLoaded && isOnboardingComplete !== null && session !== undefined) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isOnboardingComplete, session]);

  useEffect(() => {
    if (!session?.user) return;
    syncExpoPushTokenWithBackend().catch(() => {});
  }, [session]);

  useShareDeepLink(Boolean(session?.user && isOnboardingComplete));

  useEffect(() => {
    if (isOnboardingComplete === null || session === undefined) return;

    const seg0 = segments[0];

    // `useSegments()` can be empty at `/` before `app/index.tsx` resolves — otherwise no branch matches and the UI can stall.
    if (seg0 === undefined) {
      if (!session) {
        router.replace(isOnboardingComplete ? '/(auth)/sign-in' : '/(onboarding)/welcome');
      } else if (!isOnboardingComplete) {
        router.replace('/(onboarding)/welcome');
      } else {
        router.replace('/(tabs)');
      }
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
      seg0 === 'stats' ||
      seg0 === 'modal' ||
      seg0 === 'profile-edit' ||
      seg0 === 'my-events' ||
      seg0 === 'interested-events' ||
      seg0 === 'settings' ||
      seg0 === 'app-menu';

    if (!session && needsAuth) {
      if (!isOnboardingComplete) {
        router.replace('/(onboarding)/welcome');
      } else {
        router.replace('/(auth)/sign-in');
      }
      return;
    }

    if (!isOnboardingComplete && needsAuth && session) {
      router.replace('/(onboarding)/welcome');
      return;
    }

    if (session && inAuth) {
      router.replace(isOnboardingComplete ? '/(tabs)' : '/(onboarding)/welcome');
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
      router.replace('/(onboarding)/welcome');
    }
  }, [isOnboardingComplete, session, segments, router]);

  if (!fontsLoaded || isOnboardingComplete === null || session === undefined) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(onboarding)" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="profile-edit" options={{ headerShown: false }} />
      <Stack.Screen name="my-events" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="app-menu" options={{ headerShown: false, animation: 'slide_from_right' }} />
    </Stack>
  );
}
