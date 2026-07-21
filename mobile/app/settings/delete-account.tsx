import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, AlertCircle, UserX } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { supabase } from '../../src/integrations/supabase/client';
import { getExpoSiteUrl } from '../../src/utils/siteUrl';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (confirm !== 'DELETE') {
      setError('Type DELETE exactly to confirm.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        throw new Error('No active session');
      }
      const base = getExpoSiteUrl();
      const rsp = await fetch(`${base}/api/delete-account`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!rsp.ok) {
        // Parse a friendly message from the JSON body (matches web); fall back to raw
        // text, never surface a raw HTML error page.
        const bodyText = await rsp.text();
        let msg = `Request failed (${rsp.status})`;
        try {
          const parsed = JSON.parse(bodyText) as { message?: string; error?: string };
          msg = parsed?.message || parsed?.error || bodyText || msg;
        } catch {
          if (bodyText) msg = bodyText;
        }
        throw new Error(msg);
      }
      await supabase.auth.signOut();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to delete account.';
      setError(msg);
      Alert.alert('Could not delete account', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerIcon} accessibilityLabel="Back">
          <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
        </Pressable>
        <Text style={styles.headerTitle}>Delete account</Text>
        <View style={styles.headerIcon} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.warnCard}>
          <View style={styles.warnTitleRow}>
            <View style={styles.warnIcon}>
              <UserX size={22} color={SynthTokens.colors.error} />
            </View>
            <Text style={styles.warnTitle}>Permanent deletion</Text>
          </View>
          <SynthText variant="body" color="secondary" style={styles.warnBody}>
            This cannot be undone. Your data will be removed from Synth.
          </SynthText>
        </View>

        <SynthText variant="meta" color="secondary" style={styles.hint}>
          Type <Text style={styles.mono}>DELETE</Text> below to confirm.
        </SynthText>

        {error ? (
          <View style={styles.errRow}>
            <AlertCircle size={18} color={SynthTokens.colors.error} />
            <SynthText variant="meta" style={styles.errTxt}>
              {error}
            </SynthText>
          </View>
        ) : null}

        <TextInput
          value={confirm}
          onChangeText={t => {
            setConfirm(t);
            if (error && t === 'DELETE') setError(null);
          }}
          placeholder='Type "DELETE" to confirm'
          placeholderTextColor={SynthTokens.colors.neutral400}
          autoCapitalize="characters"
          editable={!busy}
          style={styles.input}
        />

        <Pressable
          style={[styles.deleteBtn, (busy || confirm !== 'DELETE') && styles.deleteBtnDisabled]}
          onPress={() => void submit()}
          disabled={busy || confirm !== 'DELETE'}
        >
          {busy ? (
            <ActivityIndicator color={SynthTokens.colors.neutral0} />
          ) : (
            <Text style={styles.deleteBtnTxt}>Delete my account</Text>
          )}
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
  body: { padding: SynthTokens.spacing.lg, gap: 16, paddingBottom: 48 },
  warnCard: {
    backgroundColor: '#fef2f2',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  warnTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  warnIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warnTitle: { fontSize: 17, fontWeight: '800', color: '#991b1b' },
  warnBody: { lineHeight: 22 },
  hint: { marginTop: 4 },
  mono: { fontFamily: undefined, fontWeight: '800', color: SynthTokens.colors.neutral900 },
  errRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  errTxt: { flex: 1, color: SynthTokens.colors.error },
  input: {
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: SynthTokens.colors.neutral900,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  deleteBtn: {
    backgroundColor: SynthTokens.colors.error,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  deleteBtnDisabled: { opacity: 0.5 },
  deleteBtnTxt: { fontSize: 16, fontWeight: '700', color: SynthTokens.colors.neutral0 },
});
