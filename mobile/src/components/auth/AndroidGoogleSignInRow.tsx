import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import { supabase } from '../../integrations/supabase/client';
import { SynthTokens } from '../../tokens/SynthTokens';
import { GoogleLogoGlyph } from './GoogleLogoGlyph';

type Props = {
  androidClientId: string;
  webClientId: string;
  disabled: boolean;
  setLoading: (v: boolean) => void;
  setError: (message: string | null) => void;
};

/**
 * Same visual slot as iOS “Continue with Apple”: black pill, icon + label.
 * Only mount when `androidClientId` / `webClientId` are non-empty.
 */
export const AndroidGoogleSignInRow: React.FC<Props> = ({
  androidClientId,
  webClientId,
  disabled,
  setLoading,
  setError,
}) => {
  const processedTokenRef = useRef<string | null>(null);

  const [request, googleResult, promptAsync] = Google.useIdTokenAuthRequest({
    androidClientId,
    webClientId,
  });

  useEffect(() => {
    if (!googleResult) return;

    if (googleResult.type === 'cancel' || googleResult.type === 'dismiss') {
      setLoading(false);
      return;
    }

    if (googleResult.type !== 'success') {
      setLoading(false);
      return;
    }

    const idToken = googleResult.params?.id_token;
    if (!idToken || typeof idToken !== 'string') {
      setLoading(false);
      setError('Google did not return an ID token. Check OAuth client IDs and SHA-1 in Google Cloud.');
      return;
    }

    if (processedTokenRef.current === idToken) {
      setLoading(false);
      return;
    }
    processedTokenRef.current = idToken;

    let cancelled = false;
    void (async () => {
      try {
        setError(null);
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        });
        if (cancelled) return;
        if (error) setError(error.message);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Google Sign In failed');
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [googleResult, setError, setLoading]);

  const onPress = async () => {
    if (!request || disabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await promptAsync();
      if (res.type === 'cancel' || res.type === 'dismiss') {
        setLoading(false);
        return;
      }
      if (res.type === 'error') {
        setLoading(false);
        setError(res.error?.message ?? 'Google Sign In failed');
        return;
      }
      // success / opened / locked: OAuth finished; Supabase sign-in runs in useEffect on `googleResult`.
      // If the hook does not emit a new result (edge case), do not leave the button spinning forever.
      if (res.type === 'success') {
        const hasToken = typeof res.params?.id_token === 'string' && res.params.id_token.length > 0;
        if (!hasToken) {
          setLoading(false);
          setError('Google did not return an ID token. Check OAuth client IDs and SHA-1 in Google Cloud.');
        }
      }
    } catch {
      setLoading(false);
      setError('Google Sign In was interrupted.');
    }
  };

  return (
    <TouchableOpacity style={[styles.button, styles.google]} disabled={disabled || !request} onPress={() => void onPress()}>
      {disabled ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <>
          <GoogleLogoGlyph size={20} />
          <Text style={styles.googleText}>Continue with Google</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

/** Renders nothing when Android Google env vars are not configured. */
export const AndroidGoogleSignInPlaceholder: React.FC = () => null;

const styles = StyleSheet.create({
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  google: {
    backgroundColor: '#000',
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  googleText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  hint: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
    color: SynthTokens.colors.neutral600,
    lineHeight: 20,
    paddingHorizontal: 8,
  },
});
