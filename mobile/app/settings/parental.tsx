import React from 'react';
import { View, StyleSheet, Pressable, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { getExpoSiteUrl } from '../../src/utils/siteUrl';

export default function ParentalControlsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerIcon} accessibilityLabel="Back">
          <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
        </Pressable>
        <Text style={styles.headerTitle}>Parental controls</Text>
        <View style={styles.headerIcon} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <SynthText variant="body" color="secondary" style={styles.p}>
          Age verification and safety settings are managed on the Synth web app. Open the site and sign in to adjust
          parental controls.
        </SynthText>
        <Pressable style={styles.btn} onPress={() => void WebBrowser.openBrowserAsync(getExpoSiteUrl())}>
          <Text style={styles.btnTxt}>Open Synth on the web</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SynthTokens.spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  headerIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: SynthTokens.colors.neutral900 },
  body: { padding: SynthTokens.spacing.lg, gap: 20 },
  p: { lineHeight: 24 },
  btn: {
    backgroundColor: SynthTokens.colors.brandPink500,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  btnTxt: { fontSize: 16, fontWeight: '700', color: SynthTokens.colors.neutral0 },
});
