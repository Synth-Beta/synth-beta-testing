import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Home, Users, Search, MessageCircle, User } from 'lucide-react-native';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { SynthTabBar } from '../../src/components/navigation/SynthTabBar';
import { PushPrimer } from '../../src/components/PushPrimer';
import { TourOverlay } from '../../src/components/TourOverlay';
import { supabase } from '../../src/integrations/supabase/client';
import { shouldAutoOpenFeatureTour } from '../../lib/featureTour';
import { isTourActive, startTour } from '../../lib/tourProgress';

export default function TabLayout() {
  // First time a new account reaches the app (right after onboarding): run the tutorial once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user || cancelled) return;
      if ((await shouldAutoOpenFeatureTour(user)) && !cancelled && !isTourActive()) startTour();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
    <Tabs
      tabBar={props => <SynthTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: SynthTokens.colors.brandPink500,
        tabBarInactiveTintColor: SynthTokens.colors.neutral400,
        tabBarShowLabel: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="post"
        options={{
          tabBarIcon: ({ color, size }) => <Search color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
      {/* Pushed from Discover / Post; not a tab bar destination */}
      <Tabs.Screen name="search" options={{ href: null }} />
    </Tabs>
    <TourOverlay />
    <PushPrimer />
    </>
  );
}
