import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { CheckCircle } from 'lucide-react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { supabase } from '../../integrations/supabase/client';
import { getExpoSiteUrl } from '../../utils/siteUrl';

const PINK = SynthTokens.colors.brandPink500;
const PARTNER = 'pickfive';

/** Calls /api/partner/link/{start|complete|revoke} as the signed-in user (api/_lib/auth/partnerLink.ts). */
async function linkRequest(action: 'start' | 'revoke', body: Record<string, string>) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Please sign in again.');
  const rsp = await fetch(`${getExpoSiteUrl()}/api/partner/link/${action}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ partner: PARTNER, ...body }),
  });
  const json = await rsp.json().catch(() => ({}));
  if (!rsp.ok) throw new Error(typeof json.error === 'string' ? json.error : `Request failed (${rsp.status})`);
  return json as Record<string, unknown>;
}

/**
 * Connect a Pick Five account: Synth gets a one-time code and opens Pick Five's connect page
 * with it (their app, when installed). Pick Five redeems the code with Synth's server. If the
 * page can't open, the user types the code into Pick Five instead. Both apps keep their own accounts.
 */
export function PickFiveConnection() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data, error: e } = await supabase.from('user_connections').select('service').eq('service', PARTNER).limit(1);
    if (e) {
      setError('Could not check your Pick Five connection.');
      setConnected(false);
      return;
    }
    setConnected((data ?? []).length > 0);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Coming back from Pick Five: re-check so the screen flips to "connected".
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const openPickFive = (url: string) =>
    Linking.openURL(url).catch(() => setError('Could not open Pick Five. Enter the code there instead.'));

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const getCode = () =>
    run(async () => {
      const result = await linkRequest('start', {});
      const url = typeof result.connect_url === 'string' ? result.connect_url : null;
      setCode(String(result.code ?? ''));
      setConnectUrl(url);
      if (url) await openPickFive(url);
    });

  const disconnect = () =>
    Alert.alert('Disconnect Pick Five?', 'Your Synth and Pick Five accounts will no longer be linked.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await linkRequest('revoke', {});
            setCode(null);
            await refresh();
          }),
      },
    ]);

  if (connected === null) {
    return (
      <View style={styles.row}>
        <ActivityIndicator size="small" color={PINK} />
        <SynthText variant="meta" color="secondary">
          Checking Pick Five connection…
        </SynthText>
      </View>
    );
  }

  if (connected) {
    return (
      <View style={styles.block}>
        <View style={styles.spaced}>
          <View style={styles.connectedBadge}>
            <CheckCircle size={16} color="#10b981" />
            <Text style={styles.connectedText}>Pick Five connected</Text>
          </View>
          <Pressable onPress={disconnect} disabled={busy} accessibilityRole="button">
            <SynthText variant="meta" style={styles.link}>
              {busy ? 'Removing…' : 'Disconnect'}
            </SynthText>
          </Pressable>
        </View>
        {error ? <SynthText variant="meta" style={styles.error}>{error}</SynthText> : null}
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <SynthText variant="meta" color="secondary" style={styles.hint}>
        Link your Pick Five account. You keep signing in to each app the usual way.
      </SynthText>

      {code ? (
        <View style={styles.codeBox}>
          <SynthText variant="meta" color="secondary" style={styles.center}>
            {connectUrl
              ? "Finish connecting in Pick Five, then come back here. If it didn't open, enter this code in Pick Five within 10 minutes:"
              : 'Enter this code in Pick Five within 10 minutes:'}
          </SynthText>
          <Text style={styles.code} selectable accessibilityLabel={`Code ${code.split('').join(' ')}`}>
            {code}
          </Text>
          <View style={styles.codeActions}>
            <Pressable onPress={() => void Clipboard.setStringAsync(code)} accessibilityRole="button" style={styles.linkBtn}>
              <SynthText variant="meta" style={styles.link}>
                Copy code
              </SynthText>
            </Pressable>
            {connectUrl ? (
              <Pressable onPress={() => void openPickFive(connectUrl)} accessibilityRole="button" style={styles.linkBtn}>
                <SynthText variant="meta" style={styles.link}>
                  Open Pick Five again
                </SynthText>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : (
        <Pressable
          style={[styles.btnPrimary, busy && styles.btnDisabled]}
          onPress={getCode}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.btnPrimaryText}>{busy ? 'Opening Pick Five…' : 'Connect Pick Five'}</Text>
        </Pressable>
      )}

      {error ? <SynthText variant="meta" style={styles.error}>{error}</SynthText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  spaced: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  connectedText: { fontSize: 14, fontWeight: '700', color: '#047857' },
  link: { color: SynthTokens.colors.neutral600, textDecorationLine: 'underline' },
  hint: { lineHeight: 20 },
  error: { color: '#b42318' },
  codeBox: {
    alignItems: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: SynthTokens.colors.neutral50,
  },
  code: { fontSize: 30, fontWeight: '800', letterSpacing: 6, color: SynthTokens.colors.neutral900 },
  btnPrimary: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PINK,
    borderRadius: 12,
    paddingVertical: 13,
  },
  btnPrimaryText: { color: SynthTokens.colors.neutral0, fontSize: 15, fontWeight: '800' },
  btnDisabled: { opacity: 0.6 },
  center: { textAlign: 'center' },
  codeActions: { flexDirection: 'row', gap: 20 },
  linkBtn: { minHeight: 44, justifyContent: 'center' },
});
