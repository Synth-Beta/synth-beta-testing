import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import { SynthButton } from '../src/components/SynthButton';
import { SynthText } from '../src/components/SynthText';
import { SynthTokens } from '../src/tokens/SynthTokens';

/**
 * TEMPORARY: proves Sentry works in a real TestFlight build. Open synth://debug-sentry
 * once on the phone, then delete this file when the error shows up in Sentry.
 */
export default function DebugSentryScreen() {
  const router = useRouter();
  const [status, setStatus] = useState('Sending test error…');

  useEffect(() => {
    void (async () => {
      try {
        throw new Error('Sentry test error from synth://debug-sentry');
      } catch (error) {
        Sentry.captureException(error);
      }
      setStatus((await Sentry.flush()) ? 'Test error sent.' : 'Could not send the test error.');
    })();
  }, []);

  return (
    <View style={styles.container}>
      <SynthText variant="h2" accessibilityRole="header">{status}</SynthText>
      <SynthButton title="Back to Synth" variant="primary" onPress={() => router.replace('/(tabs)')} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SynthTokens.spacing.lg,
    padding: SynthTokens.spacing.lg,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  button: { width: '100%' },
});
