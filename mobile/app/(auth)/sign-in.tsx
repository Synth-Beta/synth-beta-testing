import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { getAuthRedirectOrigin } from '@synth/shared';
import { isSupabaseConfigured, supabase } from '../../src/integrations/supabase/client';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { getAppleSignInCredential } from '../../lib/appleAuth';
import { AppleLogoGlyph } from '../../src/components/auth/AppleLogoGlyph';
import {
  AndroidGoogleSignInPlaceholder,
  AndroidGoogleSignInRow,
} from '../../src/components/auth/AndroidGoogleSignInRow';

/** Matches web `Auth.tsx` primary / link pink. */
const AUTH_PINK = '#FF3399';

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const androidGoogleClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim();
  const webGoogleClientId =
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || androidGoogleClientId;
  const googleAndroidReady = Boolean(androidGoogleClientId && webGoogleClientId);

  useEffect(() => {
    setError(null);
    setMessage(null);
  }, [mode]);

  const ensureConfigured = () => {
    if (isSupabaseConfigured) return true;
    setError('Mobile auth is not configured yet. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
    setMessage(null);
    return false;
  };

  const formatAuthError = (err: unknown): string => {
    if (err instanceof Error) {
      const msg = err.message;
      // Supabase returns opaque messages in some cases — map to friendly text
      if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) {
        return 'Incorrect email or password. Please try again.';
      }
      if (msg.includes('Email not confirmed')) {
        return 'Please confirm your email before signing in. Check your inbox.';
      }
      if (msg.includes('fetch') || msg.includes('network') || msg.toLowerCase().includes('network')) {
        return 'Network error — check your internet connection and try again.';
      }
      if (msg === 'type: default' || msg.startsWith('{') || msg.length > 200) {
        return 'Something went wrong. Check your connection and try again.';
      }
      return msg;
    }
    return 'Something went wrong. Please try again.';
  };

  const onSignInPassword = async () => {
    if (!ensureConfigured()) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (e) throw e;
    } catch (err: unknown) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const onSignUpPassword = async () => {
    if (!ensureConfigured()) return;
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
        options: {
          emailRedirectTo: `${origin}/`,
          data: { name: name.trim() || undefined },
        },
      });
      if (e) throw e;
      setMessage('Check your email to confirm, or sign in if confirmations are off.');
    } catch (err: unknown) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const onMagicLink = async () => {
    if (!ensureConfigured()) return;
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
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const onForgotPassword = async () => {
    if (!ensureConfigured()) return;
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
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const onApple = async () => {
    if (!ensureConfigured()) return;
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
      const msg = err instanceof Error ? err.message : '';
      // ERR_REQUEST_CANCELED = user tapped Cancel — show nothing
      if (msg.includes('ERR_REQUEST_CANCELED') || msg.includes('cancel') || msg.includes('Cancel')) return;
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={['#fdf2f8', '#ffffff', '#fce7f3', '#ffffff', '#fdf2f8']}
        locations={[0, 0.25, 0.5, 0.75, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Image source={require('../../assets/images/icon.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>Synth</Text>
          <Text style={styles.subtitle}>Connect with people at events you love</Text>

          <View style={styles.segmented}>
            <TouchableOpacity style={[styles.segment, mode === 'signin' && styles.segmentActive]} onPress={() => setMode('signin')} disabled={loading}>
              <Text style={[styles.segmentText, mode === 'signin' && styles.segmentTextActive]}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.segment, mode === 'signup' && styles.segmentActive]} onPress={() => setMode('signup')} disabled={loading}>
              <Text style={[styles.segmentText, mode === 'signup' && styles.segmentTextActive]}>Sign Up</Text>
            </TouchableOpacity>
          </View>

          {Platform.OS === 'ios' ? (
            <TouchableOpacity style={[styles.button, styles.apple]} onPress={onApple} disabled={loading}>
              <AppleLogoGlyph size={20} color={SynthTokens.colors.neutral0} />
              <Text style={styles.appleText}>Continue with Apple</Text>
            </TouchableOpacity>
          ) : googleAndroidReady && androidGoogleClientId && webGoogleClientId ? (
            <AndroidGoogleSignInRow
              androidClientId={androidGoogleClientId}
              webClientId={webGoogleClientId}
              disabled={loading}
              setLoading={setLoading}
              setError={setError}
            />
          ) : (
            <AndroidGoogleSignInPlaceholder />
          )}

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {mode === 'signup' ? (
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={SynthTokens.colors.neutral400}
              autoCapitalize="words"
              value={name}
              onChangeText={setName}
            />
          ) : null}

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
            placeholder={mode === 'signup' ? 'Password (min 6 characters)' : 'Password'}
            placeholderTextColor={SynthTokens.colors.neutral400}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {mode === 'signin' ? (
            <View style={styles.forgotRow}>
              <TouchableOpacity onPress={onForgotPassword} disabled={loading}>
                <Text style={styles.forgotLink}>Forgot password?</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <TouchableOpacity
            style={[styles.button, styles.primary]}
            onPress={mode === 'signin' ? onSignInPassword : onSignUpPassword}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={SynthTokens.colors.neutral0} />
            ) : (
              <Text style={styles.primaryText}>{mode === 'signin' ? 'Sign In' : 'Sign Up'}</Text>
            )}
          </TouchableOpacity>

          {mode === 'signin' ? (
            <Text style={styles.troubleText}>
              Trouble signing in? Double-check your email and password, or use "Forgot password".
            </Text>
          ) : null}

          {mode === 'signin' ? (
            <TouchableOpacity style={styles.magicLinkWrap} onPress={onMagicLink} disabled={loading}>
              <Text style={styles.magicLinkText}>Email me a magic link</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity onPress={() => router.push('/(onboarding)/welcome')} style={styles.skip}>
            <Text style={styles.skipText}>New to Synth? Take a quick tour</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
  scroll: { minHeight: '100%', padding: 20, paddingTop: 48, paddingBottom: 40, justifyContent: 'center' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 30,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  logo: { width: 78, height: 78, borderRadius: 18, alignSelf: 'center', marginBottom: 12 },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: { fontSize: 18, color: SynthTokens.colors.neutral600, marginBottom: 18, textAlign: 'center' },
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#F5F5DC',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  segmentActive: { backgroundColor: SynthTokens.colors.neutral0 },
  segmentText: { color: SynthTokens.colors.neutral600, fontWeight: '600' },
  segmentTextActive: { color: SynthTokens.colors.neutral900 },
  input: {
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: SynthTokens.colors.neutral0,
    color: SynthTokens.colors.neutral900,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primary: { backgroundColor: AUTH_PINK },
  primaryText: { color: SynthTokens.colors.neutral0, fontWeight: '600', fontSize: 16 },
  apple: {
    backgroundColor: '#000',
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  appleText: { color: SynthTokens.colors.neutral0, fontWeight: '600', fontSize: 16 },
  forgotRow: { alignItems: 'flex-end', marginBottom: 4, marginTop: -4 },
  forgotLink: { color: AUTH_PINK, fontSize: 16, fontWeight: '600' },
  troubleText: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
    color: '#666666',
    lineHeight: 22,
    paddingHorizontal: 4,
  },
  magicLinkWrap: { marginTop: 14, alignItems: 'center', paddingVertical: 8 },
  magicLinkText: { color: SynthTokens.colors.neutral600, fontSize: 14, fontWeight: '500', textDecorationLine: 'underline' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: SynthTokens.colors.neutral200 },
  dividerText: { color: SynthTokens.colors.neutral600, marginHorizontal: 10, fontSize: 16, fontWeight: '500' },
  error: { color: '#dc2626', marginTop: 8 },
  message: { color: SynthTokens.colors.neutral600, marginTop: 8 },
  skip: { marginTop: 22, alignItems: 'center' },
  skipText: { color: '#8a236d', fontSize: 14, fontWeight: '500' },
});
