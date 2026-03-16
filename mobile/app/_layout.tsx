import React, { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold
} from '@expo-google-fonts/inter';
import { SynthTokens } from '../src/tokens/SynthTokens';

// Prevent splash screen from hiding until fonts and state are ready
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-Bold': Inter_700Bold,
  });

  const [isOnboardingComplete, setIsOnboardingComplete] = useState<boolean | null>(null);
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
    if (fontError) throw fontError;
  }, [fontError]);

  useEffect(() => {
    if (fontsLoaded && isOnboardingComplete !== null) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isOnboardingComplete]);

  useEffect(() => {
    if (isOnboardingComplete === null) return;

    const inOnboardingGroup = segments[0] === '(onboarding)';

    if (!isOnboardingComplete && !inOnboardingGroup) {
      // Redirect to onboarding if not complete
      router.replace('/(onboarding)/welcome');
    } else if (isOnboardingComplete && inOnboardingGroup) {
      // Redirect to tabs if onboarding is complete
      router.replace('/(tabs)');
    }
  }, [isOnboardingComplete, segments]);

  if (!fontsLoaded || isOnboardingComplete === null) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(onboarding)" options={{ headerShown: false, animation: 'fade' }} />
    </Stack>
  );
}
