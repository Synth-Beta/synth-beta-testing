import React from 'react';
import { Tabs } from 'expo-router';
import { Home, Compass, Search, MessageCircle, User } from 'lucide-react-native';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { SynthTabBar } from '../../src/components/navigation/SynthTabBar';

export default function TabLayout() {
  return (
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
          tabBarIcon: ({ color, size }) => <Compass color={color} size={size} />,
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
    </Tabs>
  );
}
