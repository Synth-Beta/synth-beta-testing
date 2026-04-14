import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Text,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { SynthText } from '../src/components/SynthText';
import { SynthTokens } from '../src/tokens/SynthTokens';
import { StatsService, StreamingStats } from '../src/services/statsService';
import {
  getStreamingLinkStatus,
  type StreamingLinkStatus,
  type StreamingProvider,
} from '../src/services/streamingConnectionService';
import { supabase } from '../src/integrations/supabase/client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Music, Mic2, BarChart3, TrendingUp, ChevronLeft, RefreshCw } from 'lucide-react-native';
import { getExpoSiteUrl } from '../src/utils/siteUrl';

const PINK = SynthTokens.colors.brandPink500;

function hasAnyStats(stats: StreamingStats | null): boolean {
  if (!stats) return false;
  return (
    (stats.top_artists?.length ?? 0) > 0 ||
    (stats.top_genres?.length ?? 0) > 0 ||
    (stats.total_listening_hours ?? 0) > 0
  );
}

function providerLabel(provider: StreamingProvider): string {
  switch (provider) {
    case 'spotify':
      return 'Spotify';
    case 'apple-music':
      return 'Apple Music';
    default:
      return 'Streaming';
  }
}

export default function StreamingStatsScreen() {
  const [stats, setStats] = useState<StreamingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [linkStatus, setLinkStatus] = useState<StreamingLinkStatus>({
    linked: false,
    provider: 'unknown',
    profileUrl: null,
  });
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const loadStats = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStats(null);
      setLinkStatus({ linked: false, provider: 'unknown', profileUrl: null });
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const status = await getStreamingLinkStatus(user.id);
    setLinkStatus(status);

    const data = await StatsService.getStats(user.id);
    setStats(
      data ?? {
        top_artists: [],
        top_genres: [],
        total_listening_hours: 0,
      }
    );
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadStats(false);
  }, [loadStats]);

  const [resyncing, setResyncing] = useState(false);

  const openStreamingOnWeb = (provider?: StreamingProvider) => {
    const base = `${getExpoSiteUrl()}/streaming-stats`;
    const url =
      provider && provider !== 'unknown'
        ? `${base}?connect=${encodeURIComponent(provider)}&source=expo`
        : `${base}?source=expo`;
    void WebBrowser.openBrowserAsync(url);
  };

  const handleResync = async () => {
    setResyncing(true);
    try {
      const base = `${getExpoSiteUrl()}/streaming-stats`;
      const url =
        linkStatus.provider && linkStatus.provider !== 'unknown'
          ? `${base}?connect=${encodeURIComponent(linkStatus.provider)}&source=expo&action=resync`
          : `${base}?source=expo&action=resync`;
      await WebBrowser.openBrowserAsync(url);
      // After browser closes, refresh stats
      await loadStats(false);
    } finally {
      setResyncing(false);
    }
  };

  const linked = linkStatus.linked;
  const showConnectCards = !linked;
  const showSyncingEmptyState = linked && !hasAnyStats(stats);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={PINK} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} accessibilityLabel="Back">
          <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
        </Pressable>
        {linked && (
          <Pressable
            style={[styles.resyncBtn, resyncing && { opacity: 0.6 }]}
            onPress={() => void handleResync()}
            disabled={resyncing}
            accessibilityLabel="Resync streaming stats"
          >
            <RefreshCw size={16} color={SynthTokens.colors.neutral0} style={resyncing ? { opacity: 0.8 } : undefined} />
            <Text style={styles.resyncBtnText}>{resyncing ? 'Opening…' : 'Resync Stats'}</Text>
          </Pressable>
        )}
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: SynthTokens.spacing.md }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadStats(true)}
            tintColor={PINK}
          />
        }
      >
        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <Music size={28} color={PINK} />
            <Text style={styles.pageTitle}>Streaming stats</Text>
          </View>
          <SynthText variant="body" color="secondary" style={styles.subtitle}>
            {linked ? `${providerLabel(linkStatus.provider)} connected` : 'Your music journey on Synth'}
          </SynthText>
        </View>

        {showConnectCards ? (
          <View style={styles.connectBlock}>
            <SynthText variant="body" color="secondary" style={styles.connectCopy}>
              Connect Spotify or Apple Music to import listening data and see top artists and genres. OAuth happens on
              the web for now—tap below, sign in, and connect your account.
            </SynthText>
            <Pressable
              style={styles.connectCardSpotify}
              onPress={() => openStreamingOnWeb('spotify')}
            >
              <Text style={styles.connectCardTitle}>Connect Spotify</Text>
              <SynthText variant="meta" color="secondary">
                Open streaming stats on the web
              </SynthText>
            </Pressable>
            <Pressable
              style={styles.connectCardApple}
              onPress={() => openStreamingOnWeb('apple-music')}
            >
              <Text style={styles.connectCardTitleApple}>Connect Apple Music</Text>
              <SynthText variant="meta" color="secondary">
                Same flow on the web
              </SynthText>
            </Pressable>
          </View>
        ) : null}

        {showSyncingEmptyState ? (
          <View style={styles.syncingCard}>
            <View style={styles.syncingTitleRow}>
              <Music size={22} color={SynthTokens.colors.neutral900} />
              <Text style={styles.syncingTitle}>Connected, syncing…</Text>
            </View>
            <SynthText variant="body" color="secondary" style={styles.syncingCopy}>
              We haven’t pulled your listening data into Synth yet. This can take a moment after connecting. Tap refresh
              to try again, or open the web streaming page to re-sync.
            </SynthText>
            <View style={styles.syncingActionsRow}>
              <Pressable style={styles.refreshBtn} onPress={() => void loadStats(true)}>
                <RefreshCw size={18} color={SynthTokens.colors.neutral0} />
                <Text style={styles.refreshBtnText}>Refresh</Text>
              </Pressable>
              <Pressable
                style={styles.openWebBtn}
                onPress={() => openStreamingOnWeb(linkStatus.provider)}
              >
                <Text style={styles.openWebBtnText}>Open on web</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {linked && !showSyncingEmptyState ? (
          <>
            <View style={styles.statCard}>
              <TrendingUp size={28} color={PINK} />
              <Text style={styles.bigNumber}>{stats?.total_listening_hours ?? 0}</Text>
              <SynthText variant="meta" color="secondary">
                Hours played
              </SynthText>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Mic2 size={22} color={SynthTokens.colors.neutral900} />
                <Text style={styles.sectionTitle}>Top artists</Text>
              </View>
              {(stats?.top_artists ?? []).map(
                (artist: { name: string; popularity?: number }, index: number) => (
                  <View key={artist.name} style={styles.artistRow}>
                    <Text style={styles.rankText}>{index + 1}</Text>
                    <View style={styles.artistInfo}>
                      <Text style={styles.artistName}>{artist.name}</Text>
                      <View style={styles.popularityBarContainer}>
                        <View style={[styles.popularityBar, { width: `${artist.popularity || 0}%` }]} />
                      </View>
                    </View>
                  </View>
                )
              )}
              {(!stats?.top_artists || stats.top_artists.length === 0) && (
                <SynthText variant="meta" color="secondary">
                  No artist data yet.
                </SynthText>
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <BarChart3 size={22} color={SynthTokens.colors.neutral900} />
                <Text style={styles.sectionTitle}>Top genres</Text>
              </View>
              <View style={styles.genresContainer}>
                {(stats?.top_genres ?? []).map((genre: { genre: string; count: number }) => (
                  <View key={genre.genre} style={styles.genrePill}>
                    <Text style={styles.genreName}>{genre.genre}</Text>
                    <SynthText variant="meta" color="secondary">
                      {genre.count} plays
                    </SynthText>
                  </View>
                ))}
              </View>
              {(!stats?.top_genres || stats.top_genres.length === 0) && (
                <SynthText variant="meta" color="secondary">
                  No genre breakdown yet.
                </SynthText>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    paddingHorizontal: SynthTokens.spacing.sm,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resyncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PINK,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  resyncBtnText: {
    color: SynthTokens.colors.neutral0,
    fontSize: 13,
    fontWeight: '700',
  },
  titleBlock: {
    marginBottom: SynthTokens.spacing.xl,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: SynthTokens.colors.neutral900,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  connectBlock: { gap: 14, marginBottom: SynthTokens.spacing.xl },
  connectCopy: { lineHeight: 22, marginBottom: 4 },
  connectCardSpotify: {
    borderRadius: 16,
    padding: 18,
    backgroundColor: '#15803d',
    borderWidth: 1,
    borderColor: '#166534',
  },
  connectCardApple: {
    borderRadius: 16,
    padding: 18,
    backgroundColor: '#dc2626',
    borderWidth: 1,
    borderColor: '#b91c1c',
  },
  connectCardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: SynthTokens.colors.neutral0,
    marginBottom: 4,
  },
  connectCardTitleApple: {
    fontSize: 18,
    fontWeight: '800',
    color: SynthTokens.colors.neutral0,
    marginBottom: 4,
  },
  syncingCard: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 20,
    padding: SynthTokens.spacing.lg,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    marginBottom: SynthTokens.spacing.xl,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  syncingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  syncingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: SynthTokens.colors.neutral900,
  },
  syncingCopy: {
    lineHeight: 22,
    marginBottom: 14,
  },
  syncingActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: PINK,
  },
  refreshBtnText: {
    color: SynthTokens.colors.neutral0,
    fontSize: 14,
    fontWeight: '800',
  },
  openWebBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  openWebBtnText: {
    color: SynthTokens.colors.neutral900,
    fontSize: 14,
    fontWeight: '800',
  },
  statCard: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 20,
    padding: SynthTokens.spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    marginBottom: SynthTokens.spacing.xl,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  bigNumber: {
    fontSize: 52,
    fontWeight: '800',
    color: SynthTokens.colors.neutral900,
    marginVertical: 8,
  },
  section: {
    marginBottom: SynthTokens.spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: SynthTokens.spacing.lg,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SynthTokens.spacing.md,
    gap: SynthTokens.spacing.md,
  },
  rankText: {
    width: 28,
    fontSize: 18,
    fontWeight: '800',
    color: SynthTokens.colors.neutral400,
  },
  artistInfo: {
    flex: 1,
  },
  artistName: {
    fontSize: 16,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  popularityBarContainer: {
    height: 6,
    backgroundColor: SynthTokens.colors.neutral100,
    borderRadius: 3,
    marginTop: 8,
  },
  popularityBar: {
    height: '100%',
    backgroundColor: PINK,
    borderRadius: 3,
  },
  genresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SynthTokens.spacing.sm,
  },
  genrePill: {
    backgroundColor: SynthTokens.colors.neutral50,
    paddingHorizontal: SynthTokens.spacing.md,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    minWidth: '45%',
  },
  genreName: {
    fontSize: 15,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
    marginBottom: 4,
  },
});
