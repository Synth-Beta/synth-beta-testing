import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Application from 'expo-application';
import { supabase } from '../integrations/supabase/client';
import { SynthTokens } from '../tokens/SynthTokens';
import { SYNTH_APP_STORE_URL } from '../services/shareAppService';

/** True when `installed` is an older dotted version than `minimum` (1.5.3 < 1.6.0). */
export function isVersionBelow(installed: string, minimum: string): boolean {
  const a = installed.split('.').map((n) => parseInt(n, 10) || 0);
  const b = minimum.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

/**
 * Reads app_config.ios_min_version on launch. Fails OPEN on any error or a 4s timeout, so
 * a config outage can never lock everyone out of the app.
 */
export function useUpdateRequired(): boolean {
  const [required, setRequired] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const installed = Application.nativeApplicationVersion;
    if (!installed) return;
    let cancelled = false;
    const run = async () => {
      try {
        const query = supabase.from('app_config').select('value').eq('key', 'ios_min_version').maybeSingle();
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000));
        const result = await Promise.race([query, timeout]);
        if (cancelled || !result || result.error || !result.data?.value) return;
        setRequired(isVersionBelow(installed, String(result.data.value).trim()));
      } catch {
        /* fail open */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return required;
}

export function ForceUpdateScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Update required</Text>
      <Text style={styles.body}>
        This version of Synth is out of date. Update to the latest version in the App Store to keep going.
      </Text>
      <Pressable
        style={styles.button}
        accessibilityRole="button"
        onPress={() => {
          void Linking.openURL(SYNTH_APP_STORE_URL).catch(() => {});
        }}
      >
        <Text style={styles.buttonText}>Update on the App Store</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12, color: SynthTokens.colors.neutral900 },
  body: { fontSize: 16, textAlign: 'center', marginBottom: 28, color: SynthTokens.colors.neutral600 },
  button: {
    backgroundColor: SynthTokens.colors.brandPink500,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 999,
  },
  buttonText: { color: SynthTokens.colors.onAccent, fontSize: 16, fontWeight: '600' },
});
