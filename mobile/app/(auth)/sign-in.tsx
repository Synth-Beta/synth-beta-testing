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
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useShake } from '../../src/motion';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { getAuthRedirectOrigin } from '@synth/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseConfigured, MAGIC_LINK_PENDING_KEY, supabase } from '../../src/integrations/supabase/client';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { getAppleSignInCredential, persistAppleDisplayName } from '../../lib/appleAuth';
import { AppleLogoGlyph } from '../../src/components/auth/AppleLogoGlyph';
import { usePalette } from '../../src/theme/themePreference';
import {
  AndroidGoogleSignInPlaceholder,
  AndroidGoogleSignInRow,
} from '../../src/components/auth/AndroidGoogleSignInRow';

/** Matches web `Auth.tsx` primary / link pink. */
const AUTH_PINK = '#FF3399';

WebBrowser.maybeCompleteAuthSession();

/** One stage light from above, panning slowly; matches web `Auth.tsx`. Transform-only, off under Reduce Motion. */
function StageLight() {
  const reduceMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const travel = width * 0.18;
  const x = useSharedValue(-1);
  useEffect(() => {
    if (reduceMotion) return;
    x.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduceMotion, x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * travel }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.light, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="spot" cx="50%" cy="0%" rx="45%" ry="65%">
            <Stop offset="0" stopColor="#FFC2DF" stopOpacity={1} />
            <Stop offset="0.45" stopColor="#FFC2DF" stopOpacity={0.45} />
            <Stop offset="0.75" stopColor="#FFC2DF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#spot)" />
      </Svg>
    </Animated.View>
  );
}

export default function SignInScreen() {
  const palette = usePalette();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { shake, shakeStyle } = useShake();

  // Wiggle the email/password fields whenever a new error appears (wrong password, taken email…).
  useEffect(() => {
    if (error) shake();
  }, [error, shake]);

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
      if (msg.includes('fetch') || msg.toLowerCase().includes('network')) {
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
        fallback: 'https://join.getsynth.app',
      });
      const { data, error: e } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${origin}/`,
          data: { name: name.trim() || undefined },
        },
      });
      if (e) throw e;
      // Supabase answers success with no identities when the email is already registered.
      if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
        setError('That email already has an account. Switch to Sign in.');
        return;
      }
      // Email confirmation is off, so a session comes back and the root layout takes over.
      // Without one the account can't enter the app, so say why rather than failing silently.
      if (!data.session) setMessage('Account created. Check your email to confirm it, then sign in.');
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
      // The root layout only accepts a token link while this marker is fresh, so a
      // crafted synth://#access_token link can't swap the signed-in account.
      await AsyncStorage.setItem(MAGIC_LINK_PENDING_KEY, String(Date.now())).catch(() => {});
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
        fallback: 'https://join.getsynth.app',
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

      // Apple only sends the user's name on the FIRST sign-in — capture it now so
      // onboarding prefills it and the profile isn't stuck as "Synth User".
      await persistAppleDisplayName(cred);
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
        colors={[palette.brandPink050, palette.neutral0]}
        locations={[0, 0.7]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <StageLight />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Image source={require('../../assets/images/icon.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>Synth</Text>
          <Text style={styles.subtitle}>Connect with people at events you love</Text>

          <View style={styles.segmented}>
            <TouchableOpacity style={[styles.segment, mode === 'signin' && styles.segmentActive]} onPress={() => setMode('signin')} disabled={loading}>
              <Text style={[styles.segmentText, mode === 'signin' && styles.segmentTextActive]}>Sign in</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.segment, mode === 'signup' && styles.segmentActive]} onPress={() => setMode('signup')} disabled={loading}>
              <Text style={[styles.segmentText, mode === 'signup' && styles.segmentTextActive]}>Sign up</Text>
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

          {/* Only draw the "or" divider when a social button actually rendered above it.
              AndroidGoogleSignInPlaceholder renders null, so an Android build without the
              Google client IDs showed an empty slot above a dangling "or". */}
          {Platform.OS === 'ios' || googleAndroidReady ? (
            <Text style={styles.dividerText}>or</Text>
          ) : null}

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

          <Animated.View style={shakeStyle}>
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
          </Animated.View>

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
              <ActivityIndicator color={SynthTokens.colors.onAccent} />
            ) : (
              <Text style={styles.primaryText}>{mode === 'signin' ? 'Sign in' : 'Create account'}</Text>
            )}
          </TouchableOpacity>

          {mode === 'signin' ? (
            <TouchableOpacity style={styles.magicLinkWrap} onPress={onMagicLink} disabled={loading}>
              <Text style={styles.magicLinkText}>Email me a magic link</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50, overflow: 'hidden' },
  light: { position: 'absolute', top: 0, bottom: 0, left: '-25%', width: '150%' },
  scroll: { minHeight: '100%', padding: 20, paddingTop: 48, paddingBottom: 40, justifyContent: 'center' },
  card: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 24,
    padding: 24,
    shadowColor: SynthTokens.colors.brandPink700,
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  logo: { width: 72, height: 72, borderRadius: 16, alignSelf: 'center', marginBottom: 12 },
  title: {
    fontSize: 32,
    fontWeight: '600',
    color: SynthTokens.colors.neutral900,
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: { fontSize: 16, lineHeight: 22, color: SynthTokens.colors.neutral600, marginBottom: 24, textAlign: 'center' },
  segmented: {
    flexDirection: 'row',
    backgroundColor: SynthTokens.colors.neutral100,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
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
  primaryText: { color: SynthTokens.colors.onAccent, fontWeight: '600', fontSize: 16 },
  apple: {
    backgroundColor: SynthTokens.colors.neutral900,
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  appleText: { color: SynthTokens.colors.neutral0, fontWeight: '600', fontSize: 16 },
  forgotRow: { alignItems: 'flex-end', marginBottom: 4, marginTop: -4 },
  forgotLink: { color: SynthTokens.colors.neutral600, fontSize: 14, fontWeight: '500', paddingVertical: 4 },
  magicLinkWrap: { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  magicLinkText: { color: SynthTokens.colors.neutral600, fontSize: 14, fontWeight: '500', textDecorationLine: 'underline' },
  dividerText: { color: SynthTokens.colors.neutral400, marginVertical: 12, fontSize: 14, textAlign: 'center' },
  error: { color: SynthTokens.colors.error, marginTop: 8 },
  message: { color: SynthTokens.colors.neutral600, marginTop: 8 },
});
