const fs = require('fs');
const path = require('path');

const tabsDir = path.join(__dirname, 'mobile', 'app', '(tabs)');
if (!fs.existsSync(tabsDir)) {
    fs.mkdirSync(tabsDir, { recursive: true });
}

// Ensure the old default screens are removed
const toRemove = ['explore.tsx', 'two.tsx'];
toRemove.forEach(f => {
    try {
        if (fs.existsSync(path.join(tabsDir, f))) {
            fs.unlinkSync(path.join(tabsDir, f));
            console.log(`Deleted ${f}`);
        }
    } catch (e) { }
});

const screens = [
    { file: 'index.tsx', name: 'FeedScreen', title: 'Feed', icon: 'house' },
    { file: 'discover.tsx', name: 'DiscoverScreen', title: 'Discover', icon: 'magnifyingglass' },
    { file: 'search.tsx', name: 'SearchScreen', title: 'Search', icon: 'calendar' }, // wait, originally Feed, Discover, Search, Chat, Profile. 
    { file: 'chat.tsx', name: 'ChatScreen', title: 'Chat', icon: 'message' },
    { file: 'profile.tsx', name: 'ProfileScreen', title: 'Profile', icon: 'person' }
];

screens.forEach(s => {
    const code = `import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SynthText } from '../../../src/components/SynthText';
import { SynthTokens } from '../../../src/tokens/SynthTokens';

export default function ${s.name}() {
  return (
    <View style={styles.container}>
      <SynthText variant="h1" color="brand">${s.title}</SynthText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SynthTokens.colors.neutral50,
  },
});
`;
    fs.writeFileSync(path.join(tabsDir, s.file), code);
    console.log(`Created ${s.file}`);
});

// Update _layout.tsx
const layoutCode = `import React from 'react';
import { Tabs } from 'expo-router';
import { SynthTokens } from '../../../src/tokens/SynthTokens';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: SynthTokens.colors.brandPink500,
        tabBarInactiveTintColor: SynthTokens.colors.neutral400,
        tabBarStyle: {
          backgroundColor: SynthTokens.colors.neutral0,
          borderTopColor: SynthTokens.colors.neutral200,
        }
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
        }}
      />
    </Tabs>
  );
}
`;
fs.writeFileSync(path.join(tabsDir, '_layout.tsx'), layoutCode);
console.log('Tabs layout successfully rewritten.');
