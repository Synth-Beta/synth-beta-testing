import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';

export default function PostScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <SynthText variant="h2">Add a review</SynthText>
      <SynthText variant="body" style={styles.copy} color="secondary">
        Open a show, then capture ratings and notes—same data as the web app (overall score + write-up).
      </SynthText>
      <TouchableOpacity
        style={styles.cta}
        onPress={() => router.push('/(tabs)/search')}
        activeOpacity={0.85}
      >
        <SynthText variant="meta" style={styles.ctaText}>
          Search for an event
        </SynthText>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.secondary}
        onPress={() => router.push('/my-events')}
        activeOpacity={0.85}
      >
        <SynthText variant="meta" style={styles.secondaryText}>
          My events (unreviewed & past)
        </SynthText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SynthTokens.colors.neutral50,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SynthTokens.spacing.lg,
  },
  copy: { marginTop: SynthTokens.spacing.md, textAlign: 'center', maxWidth: 320 },
  cta: {
    marginTop: SynthTokens.spacing.xl,
    backgroundColor: SynthTokens.colors.brandPink500,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: SynthTokens.radius.medium,
  },
  ctaText: { color: SynthTokens.colors.neutral50, fontWeight: '700' },
  secondary: {
    marginTop: SynthTokens.spacing.md,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: SynthTokens.radius.medium,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  secondaryText: { color: SynthTokens.colors.neutral900, fontWeight: '600' },
});
