/**
 * ============================================================================
 * TOP SECRET — ADMIN-ONLY FEATURE (pesceelauren@gmail.com / @lauren ONLY)
 * ============================================================================
 * Opens the canonical web admin portal (getsynth.app/admin) in-app so Lauren
 * gets the same UX/info as desktop. Fail-safe: anyone who is not the hard
 * allowlist is silently bounced — no "Access Denied", no hint that Admin
 * exists. Do not soften this gate.
 * ============================================================================
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { ArrowLeft, Shield, ExternalLink } from 'lucide-react-native';
import {
  SECRET_ADMIN_PORTAL_URL,
  isSecretAdminMenuAllowed,
} from '@synth/shared';
import { supabase } from '../src/integrations/supabase/client';
import { SynthTokens } from '../src/tokens/SynthTokens';

type Gate = 'checking' | 'denied' | 'allowed';

export default function SecretAdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [gate, setGate] = useState<Gate>('checking');
  const [opening, setOpening] = useState(false);

  const bounce = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/discover' as any);
    }
  }, [router]);

  const openPortal = useCallback(async () => {
    setOpening(true);
    try {
      await WebBrowser.openBrowserAsync(SECRET_ADMIN_PORTAL_URL, {
        enableBarCollapsing: true,
        showTitle: true,
      });
    } finally {
      setOpening(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) {
          if (alive) setGate('denied');
          return;
        }

        const { data: row } = await supabase
          .from('users')
          .select('username, account_type')
          .eq('user_id', user.id)
          .maybeSingle();

        const ok = isSecretAdminMenuAllowed({
          email: user.email,
          username: (row as { username?: string } | null)?.username,
          accountType: (row as { account_type?: string } | null)?.account_type,
        });

        if (!alive) return;
        if (!ok) {
          setGate('denied');
          return;
        }

        setGate('allowed');
        // Auto-open the real admin portal (same UX/info as web).
        await WebBrowser.openBrowserAsync(SECRET_ADMIN_PORTAL_URL, {
          enableBarCollapsing: true,
          showTitle: true,
        });
      } catch {
        if (alive) setGate('denied');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (gate === 'denied') bounce();
  }, [gate, bounce]);

  if (gate !== 'allowed') {
    // Blank while checking or bouncing — never advertise Admin to outsiders.
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        {gate === 'checking' ? (
          <ActivityIndicator color={SynthTokens.colors.brandPink500} />
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={bounce}
          style={styles.backBtn}
          accessibilityLabel="Close admin"
        >
          <ArrowLeft size={24} color={SynthTokens.colors.neutral900} />
        </Pressable>
        <Text style={styles.title}>Admin</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.heroIcon}>
          <Shield size={28} color={SynthTokens.colors.brandPink500} />
        </View>
        <Text style={styles.heading}>Synth Admin</Text>
        <Text style={styles.copy}>
          Opens the same admin portal as desktop (getsynth.app/admin) with the
          full ops dashboard.
        </Text>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => void openPortal()}
          disabled={opening}
          accessibilityRole="button"
          accessibilityLabel="Open admin portal"
        >
          {opening ? (
            <ActivityIndicator color="#FFFDFA" />
          ) : (
            <>
              <ExternalLink size={18} color="#FFFDFA" />
              <Text style={styles.primaryBtnText}>Open Admin Portal</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SynthTokens.spacing.sm,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  body: {
    flex: 1,
    paddingHorizontal: SynthTokens.spacing.lg,
    paddingTop: 48,
    alignItems: 'center',
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FCE7F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
    marginBottom: 8,
  },
  copy: {
    fontSize: 15,
    fontWeight: '500',
    color: SynthTokens.colors.neutral600,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    maxWidth: 320,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: SynthTokens.colors.brandPink500,
    minWidth: 220,
  },
  primaryBtnText: {
    color: '#FFFDFA',
    fontSize: 16,
    fontWeight: '700',
  },
});
