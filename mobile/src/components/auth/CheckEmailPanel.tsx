import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Linking from 'expo-linking';
import { Mail } from 'lucide-react-native';
import {
  getAuthRedirectOrigin,
  isEmailNotConfirmedError,
  EMAIL_CONFIRM_POLL_MAX_MS,
  EMAIL_CONFIRM_POLL_MS,
  EMAIL_CONFIRM_RESEND_COOLDOWN_SEC,
} from '@synth/shared';
import { supabase } from '../../integrations/supabase/client';
import { SynthTokens } from '../../tokens/SynthTokens';

const AUTH_PINK = '#FF3399';

interface Props {
  email: string;
  password: string;
  onBack: () => void;
}

/**
 * Shown after email sign-up while the address is unconfirmed. The confirm link opens in
 * the browser, so the app can't see the click: it retries sign-in every 15s and whenever
 * the user comes back to the app. A successful sign-in is picked up by the root layout.
 */
export function CheckEmailPanel({ email, password, onBack }: Props) {
  const [cooldown, setCooldown] = useState(EMAIL_CONFIRM_RESEND_COOLDOWN_SEC);
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const startedAt = useRef(Date.now());

  const trySignIn = useCallback(async (manual: boolean) => {
    if (manual) setChecking(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (manual) {
      setChecking(false);
      if (error) {
        setNote(isEmailNotConfirmedError(error)
          ? "Not confirmed yet. Tap the link in the email, then come back."
          : "Couldn't check right now. Try again in a moment.");
      }
    }
  }, [email, password]);

  useEffect(() => {
    const poll = setInterval(() => {
      if (Date.now() - startedAt.current > EMAIL_CONFIRM_POLL_MAX_MS) return;
      void trySignIn(false);
    }, EMAIL_CONFIRM_POLL_MS);
    // They usually confirm in Mail/Safari and switch back: check right away.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void trySignIn(false);
    });
    return () => {
      clearInterval(poll);
      sub.remove();
    };
  }, [trySignIn]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    setResending(true);
    setNote(null);
    const origin = getAuthRedirectOrigin({
      siteUrlEnv: process.env.EXPO_PUBLIC_SITE_URL,
      fallback: 'https://join.getsynth.app',
    });
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${origin}/` },
    });
    setResending(false);
    setCooldown(EMAIL_CONFIRM_RESEND_COOLDOWN_SEC);
    setNote(error ? "Couldn't resend right now. Try again in a minute." : 'Sent again. Check Junk too.');
  };

  return (
    <View>
      <View style={styles.iconWrap}>
        <Mail size={32} color={AUTH_PINK} />
      </View>
      <Text style={styles.title}>Check your email</Text>
      <Text style={styles.body}>
        We sent a confirmation link to{'\n'}
        <Text style={styles.email}>{email}</Text>
      </Text>
      <Text style={styles.body}>Tap the link, then come back here. We'll sign you in automatically.</Text>
      <Text style={styles.hint}>Not there? Check your Junk or Spam folder.</Text>

      <TouchableOpacity style={[styles.button, styles.primary]} onPress={() => void Linking.openURL('message://')}>
        <Text style={styles.primaryText}>Open Mail</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, styles.secondary]} onPress={() => void trySignIn(true)} disabled={checking}>
        {checking ? <ActivityIndicator color={AUTH_PINK} /> : <Text style={styles.secondaryText}>I've confirmed, continue</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.linkWrap} onPress={() => void resend()} disabled={cooldown > 0 || resending}>
        <Text style={[styles.link, (cooldown > 0 || resending) && styles.linkDisabled]}>
          {resending ? 'Sending…' : cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend email'}
        </Text>
      </TouchableOpacity>

      {note ? <Text style={styles.note}>{note}</Text> : null}

      <TouchableOpacity style={styles.linkWrap} onPress={onBack}>
        <Text style={styles.back}>Wrong email? Go back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fce7f3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 26, fontWeight: '700', color: SynthTokens.colors.neutral900, textAlign: 'center', marginBottom: 10 },
  body: { fontSize: 16, color: SynthTokens.colors.neutral600, textAlign: 'center', marginBottom: 10, lineHeight: 22 },
  email: { fontWeight: '700', color: SynthTokens.colors.neutral900 },
  hint: { fontSize: 14, color: SynthTokens.colors.neutral600, textAlign: 'center', marginBottom: 8 },
  button: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  primary: { backgroundColor: AUTH_PINK },
  primaryText: { color: SynthTokens.colors.neutral0, fontWeight: '600', fontSize: 16 },
  secondary: { borderWidth: 1.5, borderColor: AUTH_PINK },
  secondaryText: { color: AUTH_PINK, fontWeight: '600', fontSize: 16 },
  linkWrap: { marginTop: 14, alignItems: 'center', paddingVertical: 4 },
  link: { color: AUTH_PINK, fontSize: 15, fontWeight: '600' },
  linkDisabled: { color: SynthTokens.colors.neutral400 },
  note: { marginTop: 10, textAlign: 'center', color: SynthTokens.colors.neutral600 },
  back: { color: SynthTokens.colors.neutral600, fontSize: 14, textDecorationLine: 'underline' },
});
