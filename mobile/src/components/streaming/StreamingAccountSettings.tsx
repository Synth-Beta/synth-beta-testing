import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { CheckCircle, Music, RefreshCw } from 'lucide-react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { supabase } from '../../integrations/supabase/client';
import { getStreamingLinkStatus, type StreamingProvider } from '../../services/streamingConnectionService';
import {
  disconnectStreamingAccount,
  syncStreamingProfile,
  buildExpoSpotifyConnectUrl,
} from '../../services/streamingSyncActions';
import { getExpoSiteUrl } from '../../utils/siteUrl';
import { formatRelativeTime } from '../../utils/formatRelativeTime';

const PINK = SynthTokens.colors.brandPink500;

interface StreamingAccountSettingsProps {
  onNavigateToStats?: () => void;
}

export function StreamingAccountSettings({ onNavigateToStats }: StreamingAccountSettingsProps) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);
  const [provider, setProvider] = useState<StreamingProvider>('unknown');
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) {
        setUserId(null);
        setLinked(false);
        setProvider('unknown');
        setLastSynced(null);
        return;
      }

      setUserId(user.id);
      const status = await getStreamingLinkStatus(user.id);
      setLinked(status.linked);
      setProvider(status.provider);

      if (status.linked && status.provider !== 'unknown') {
        const { data } = await supabase
          .from('streaming_profiles')
          .select('last_updated')
          .eq('user_id', user.id)
          .eq('service_type', status.provider)
          .maybeSingle();
        setLastSynced(data?.last_updated ?? null);
      } else {
        setLastSynced(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const openConnectStreaming = (connectProvider: 'spotify' | 'apple-music') => {
    const url =
      connectProvider === 'spotify'
        ? buildExpoSpotifyConnectUrl()
        : `${getExpoSiteUrl()}/streaming-stats?connect=${encodeURIComponent(connectProvider)}&source=expo`;
    void WebBrowser.openBrowserAsync(url);
  };

  const serviceLabel =
    provider === 'spotify' ? 'Spotify' : provider === 'apple-music' ? 'Apple Music' : null;

  const handleResync = async () => {
    if (!userId || !linked || provider === 'unknown') return;

    if (provider === 'apple-music') {
      Alert.alert(
        'Sync on web',
        'Apple Music resync opens in your browser once to refresh your stats.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open web', onPress: () => openConnectStreaming('apple-music') },
        ]
      );
      return;
    }

    setSyncing(true);
    try {
      const result = await syncStreamingProfile(userId, 'spotify', { manual: true });
      if (result.ok) {
        Alert.alert(
          'Stats updated',
          'Your streaming data has been refreshed. Your event feed will reflect your taste.'
        );
        await refreshStatus();
        return;
      }

      if (result.skipped === 'partial-sync') {
        Alert.alert(
          'Songs not synced',
          result.message || 'Reconnect Spotify on the web, then resync in the app.'
        );
        return;
      }

      if (result.skipped === 'no-stored-token' || result.skipped === 'no-session') {
        Alert.alert(
          'One-time setup in browser',
          result.message ||
            'Connect Spotify once on the web to save your token. Return here and tap Resync again.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Connect',
              onPress: () => openConnectStreaming('spotify'),
            },
            ...(onNavigateToStats
              ? [{ text: 'View stats', onPress: onNavigateToStats }]
              : [{ text: 'View stats', onPress: () => router.push('/stats') }]),
          ]
        );
        return;
      }

      Alert.alert('Sync failed', result.message || 'Could not refresh stats.');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = () => {
    if (!userId) return;
    Alert.alert(
      'Disconnect Streaming',
      'This will remove your streaming account link. Your genre preferences and stats will remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setDisconnecting(true);
            try {
              await disconnectStreamingAccount(userId);
              setLinked(false);
              setProvider('unknown');
              setLastSynced(null);
            } catch (error) {
              Alert.alert(
                'Error',
                error instanceof Error ? error.message : 'Could not disconnect streaming account.'
              );
            } finally {
              setDisconnecting(false);
            }
          },
        },
      ]
    );
  };

  if (loading && !userId) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={PINK} />
        <SynthText variant="meta" color="secondary">
          Checking streaming connection…
        </SynthText>
      </View>
    );
  }

  if (linked && serviceLabel) {
    return (
      <View style={styles.block}>
        <View style={styles.connectedRow}>
          <View style={styles.connectedBadge}>
            <CheckCircle size={16} color="#10b981" />
            <Text style={styles.connectedText}>{serviceLabel} connected</Text>
          </View>
          <Pressable onPress={handleDisconnect} disabled={disconnecting || syncing}>
            <SynthText variant="meta" style={styles.disconnectLink}>
              {disconnecting ? 'Removing…' : 'Disconnect'}
            </SynthText>
          </Pressable>
        </View>

        {lastSynced ? (
          <SynthText variant="meta" color="secondary" style={styles.hint}>
            Last synced {formatRelativeTime(lastSynced)}
          </SynthText>
        ) : (
          <SynthText variant="meta" color="secondary" style={styles.hint}>
            Stats linked — tap resync to pull latest data.
          </SynthText>
        )}

        <Pressable
          style={[styles.btnPrimary, (syncing || disconnecting) && styles.btnDisabled]}
          onPress={() => void handleResync()}
          disabled={syncing || disconnecting}
        >
          <RefreshCw size={16} color={SynthTokens.colors.neutral0} />
          <Text style={styles.btnPrimaryText}>{syncing ? 'Syncing…' : 'Resync stats'}</Text>
        </Pressable>

        {onNavigateToStats ? (
          <Pressable style={styles.btnOutline} onPress={onNavigateToStats} disabled={syncing}>
            <Text style={styles.btnOutlineText}>View streaming stats</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.btnOutline} onPress={() => router.push('/stats')} disabled={syncing}>
            <Text style={styles.btnOutlineText}>View streaming stats</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <SynthText variant="meta" color="secondary" style={styles.hint}>
        Connect Spotify or Apple Music to sync listening history and personalize your feed.
      </SynthText>

      <Pressable
        style={[styles.btnSpotify]}
        onPress={() => openConnectStreaming('spotify')}
      >
        <Music size={16} color={SynthTokens.colors.neutral0} />
        <Text style={styles.btnSpotifyText}>Connect Spotify</Text>
      </Pressable>

      <Pressable
        style={styles.btnApple}
        onPress={() => openConnectStreaming('apple-music')}
      >
        <Music size={16} color={SynthTokens.colors.neutral900} />
        <Text style={styles.btnAppleText}>Connect Apple Music</Text>
      </Pressable>

      <Pressable
        style={styles.btnGhost}
        onPress={() => void refreshStatus()}
        disabled={loading}
      >
        <RefreshCw size={14} color={SynthTokens.colors.neutral600} />
        <SynthText variant="meta" color="secondary">
          {loading ? 'Refreshing…' : 'Refresh status after connecting'}
        </SynthText>
      </Pressable>

      <SynthText variant="meta" color="secondary" style={styles.note}>
        OAuth happens on the web — sign in there, then return and tap Refresh status.
      </SynthText>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 12 },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  connectedText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#047857',
  },
  disconnectLink: {
    color: SynthTokens.colors.neutral600,
    textDecorationLine: 'underline',
  },
  hint: { lineHeight: 20 },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: PINK,
    borderRadius: 12,
    paddingVertical: 13,
  },
  btnPrimaryText: {
    color: SynthTokens.colors.neutral0,
    fontSize: 15,
    fontWeight: '800',
  },
  btnDisabled: { opacity: 0.6 },
  btnOutline: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  btnOutlineText: {
    fontSize: 14,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  btnSpotify: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1DB954',
    borderRadius: 12,
    paddingVertical: 13,
  },
  btnSpotifyText: {
    color: SynthTokens.colors.neutral0,
    fontSize: 15,
    fontWeight: '800',
  },
  btnApple: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 12,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: '#FC3C44',
  },
  btnAppleText: {
    color: SynthTokens.colors.neutral900,
    fontSize: 15,
    fontWeight: '800',
  },
  btnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  note: { lineHeight: 18 },
});
