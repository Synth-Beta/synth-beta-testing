import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { getAuthRedirectOrigin } from '@synth/shared';
import { supabase } from '../../src/integrations/supabase/client';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { getAppleSignInCredential } from '../../lib/appleAuth';

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSignInPassword = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (e) throw e;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const onSignUpPassword = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const origin = getAuthRedirectOrigin({
        siteUrlEnv: process.env.EXPO_PUBLIC_SITE_URL,
        fallback: 'https://synth-beta-testing.vercel.app',
      });
      const { error: e } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${origin}/` },
      });
      if (e) throw e;
      setMessage('Check your email to confirm, or sign in if confirmations are off.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  const onMagicLink = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const emailRedirectTo = Linking.createURL('/', { scheme: 'synth' });
      const { error: e } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo },
      });
      if (e) throw e;
      setMessage('Magic link sent. Open it on this device to sign in.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send link');
    } finally {
      setLoading(false);
    }
  };

  const onForgotPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email above, then tap Forgot password.');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const origin = getAuthRedirectOrigin({
        siteUrlEnv: process.env.EXPO_PUBLIC_SITE_URL,
        fallback: 'https://synth-beta-testing.vercel.app',
      });
      const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${origin.replace(/\/$/, '')}/reset-password`,
      });
      if (e) throw e;
      setMessage('Check your email for a reset link. Open it in the browser to set a new password.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send reset email');
    } finally {
      setLoading(false);
    }
  };

  const onApple = async () => {
    if (Platform.OS !== 'ios') return;
    setLoading(true);
    setError(null);
    try {
      const cred = await getAppleSignInCredential();
      if (!cred?.identityToken) {
        setError('Apple Sign In was cancelled or no token returned');
        return;
      }
      const { error: e } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: cred.identityToken,
      });
      if (e) throw e;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Apple Sign In failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Synth</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={SynthTokens.colors.neutral400}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={SynthTokens.colors.neutral400}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}

        <TouchableOpacity
          style={[styles.button, styles.primary]}
          onPress={onSignInPassword}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Sign in</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={onSignUpPassword} disabled={loading}>
          <Text style={styles.secondaryText}>Create account</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={onMagicLink} disabled={loading}>
          <Text style={styles.secondaryText}>Email me a magic link</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={onForgotPassword} disabled={loading}>
          <Text style={styles.secondaryText}>Forgot password?</Text>
        </TouchableOpacity>

        {Platform.OS === 'ios' ? (
          <TouchableOpacity style={[styles.button, styles.apple]} onPress={onApple} disabled={loading}>
            <Text style={styles.appleText}>Continue with Apple</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity onPress={() => router.replace('/(onboarding)/welcome')} style={styles.skip}>
          <Text style={styles.skipText}>Back to onboarding</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
  scroll: { padding: 24, paddingTop: 80 },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
    marginBottom: 8,
  },
  subtitle: { fontSize: 16, color: SynthTokens.colors.neutral600, marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: SynthTokens.colors.neutral900,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primary: { backgroundColor: SynthTokens.colors.brandPink500 },
  primaryText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  secondaryText: { color: SynthTokens.colors.brandPink500, fontWeight: '600', fontSize: 16 },
  apple: { backgroundColor: '#000', marginTop: 16 },
  appleText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  error: { color: '#dc2626', marginTop: 8 },
  message: { color: SynthTokens.colors.neutral600, marginTop: 8 },
  skip: { marginTop: 32, alignItems: 'center' },
  skipText: { color: SynthTokens.colors.neutral400, fontSize: 14 },
});
