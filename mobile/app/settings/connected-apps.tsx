import React from 'react';
import { View, StyleSheet, ScrollView, Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { StreamingAccountSettings } from '../../src/components/streaming/StreamingAccountSettings';
import { PickFiveConnection } from '../../src/components/partners/PickFiveConnection';

/** Settings → Connected Apps: one place for every linked service (more coming). Same as web. */
export default function ConnectedAppsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} accessibilityLabel="Back">
          <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
        </Pressable>
        <Text style={styles.title}>Connected Apps</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <SynthText variant="meta" color="secondary" style={styles.sectionLabel}>
          Spotify / Apple Music
        </SynthText>
        <View style={styles.card}>
          <StreamingAccountSettings onNavigateToStats={() => router.push('/stats')} />
        </View>

        <SynthText variant="meta" color="secondary" style={styles.sectionLabel}>
          Pick5
        </SynthText>
        <View style={styles.card}>
          <PickFiveConnection />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SynthTokens.spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  body: { padding: SynthTokens.spacing.md, gap: 8, paddingBottom: 48 },
  sectionLabel: { marginTop: 12, fontWeight: '700' },
  card: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
});
