import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';

/** Web parity: center CTA opens event review / discovery — full review form ships later. */
export default function PostScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <SynthText variant="h2">Post</SynthText>
      <SynthText variant="body" style={styles.copy} color="secondary">
        On the web app, this button starts the event review flow. Here you can jump to Search to find a show; the
        full composer will match web soon.
      </SynthText>
      <TouchableOpacity style={styles.cta} onPress={() => router.push('/(tabs)/search')} activeOpacity={0.85}>
        <SynthText variant="meta" style={styles.ctaText}>
          Search events
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
});
