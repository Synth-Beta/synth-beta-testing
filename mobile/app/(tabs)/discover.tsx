import React from 'react';
import { StyleSheet, View, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarChart3, Users, Search } from 'lucide-react-native';

export default function DiscoverScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <SynthText variant="h1">Discover</SynthText>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.push('/(tabs)/search')} style={styles.card}>
          <View style={[styles.iconContainer, { backgroundColor: SynthTokens.colors.brandPink600 }]}>
            <Search size={24} color="white" />
          </View>
          <View style={styles.cardInfo}>
            <SynthText variant="h2">Search</SynthText>
            <SynthText variant="meta" color="secondary">
              Artists, venues, and shows (same entry as the web Discover flow)
            </SynthText>
          </View>
        </Pressable>

        <Pressable
          onPress={() => router.push('/stats')}
          style={styles.card}
        >
          <View style={styles.iconContainer}>
            <BarChart3 size={24} color="white" />
          </View>
          <View style={styles.cardInfo}>
            <SynthText variant="h2">Streaming Stats</SynthText>
            <SynthText variant="meta" color="secondary">See your top artists and genres</SynthText>
          </View>
        </Pressable>

        <Pressable
          style={styles.card}
          onPress={() => console.log('Connect')}
        >
          <View style={[styles.iconContainer, { backgroundColor: SynthTokens.colors.purpleAccent }]}>
            <Users size={24} color="white" />
          </View>
          <View style={styles.cardInfo}>
            <SynthText variant="h2">Connect</SynthText>
            <SynthText variant="meta" color="secondary">Find friends and concert buddies</SynthText>
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SynthTokens.colors.neutral50,
  },
  header: {
    paddingHorizontal: SynthTokens.spacing.md,
    paddingVertical: SynthTokens.spacing.md,
  },
  content: {
    padding: SynthTokens.spacing.md,
    gap: SynthTokens.spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SynthTokens.colors.neutral0,
    padding: SynthTokens.spacing.lg,
    borderRadius: SynthTokens.radius.large,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: SynthTokens.colors.brandPink500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    marginLeft: SynthTokens.spacing.md,
  }
});
