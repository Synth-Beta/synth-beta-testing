import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Text,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthText } from '../src/components/SynthText';
import { SynthTokens } from '../src/tokens/SynthTokens';
import { supabase } from '../src/integrations/supabase/client';

const WEB_BASE = (process.env.EXPO_PUBLIC_SITE_URL || '').replace(/\/$/, '');

export default function AnalyticsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [accountType, setAccountType] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }
        const { data } = await supabase
          .from('users')
          .select('account_type')
          .eq('user_id', user.id)
          .maybeSingle();
        setAccountType((data as { account_type?: string } | null)?.account_type ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openWeb = () => {
    const url = WEB_BASE || 'https://synth.app';
    void Linking.openURL(url);
  };

  const bodyForType = () => {
    if (!accountType) {
      return 'Sign in on the web app to view analytics dashboards.';
    }
    if (accountType === 'creator' || accountType === 'business' || accountType === 'admin') {
      return `Your account type (${accountType}) has analytics on web. Open Synth in the browser for the full dashboard — same as MainApp on desktop.`;
    }
    return 'Analytics are not enabled for your account type on mobile. If you believe this is wrong, check your profile on web.';
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} accessibilityLabel="Back">
          <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
        </Pressable>
        <Text style={styles.headerTitle}>Analytics</Text>
        <View style={styles.iconBtn} />
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={SynthTokens.colors.brandPink500} />
        ) : (
          <>
            <SynthText variant="body" color="secondary">
              {bodyForType()}
            </SynthText>
            <Pressable style={styles.primaryBtn} onPress={openWeb}>
              <SynthText variant="meta" style={styles.primaryBtnText}>
                Open web app
              </SynthText>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
  },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  body: { padding: SynthTokens.spacing.lg, gap: 16 },
  primaryBtn: {
    backgroundColor: SynthTokens.colors.brandPink500,
    paddingVertical: 14,
    borderRadius: SynthTokens.radius.medium,
    alignItems: 'center',
  },
  primaryBtnText: { color: SynthTokens.colors.neutral0, fontWeight: '700' },
});
