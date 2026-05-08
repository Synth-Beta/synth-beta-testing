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
import { LinearGradient } from 'expo-linear-gradient';
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
import { Music, Mic2, BarChart3, ChevronLeft, RefreshCw, Headphones, Zap } from 'lucide-react-native';
import { getExpoSiteUrl } from '../src/utils/siteUrl';

const PINK = SynthTokens.colors.brandPink500;
const MEDAL_GOLD = '#F5A623';
const MEDAL_SILVER = '#8E8E93';
const MEDAL_BRONZE = '#C86A1E';

const GENRE_COLORS = [
  '#EC4899', '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B',
  '#EF4444', '#3B82F6', '#84CC16', '#F97316', '#A855F7',
];

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
    case 'spotify': return 'Spotify';
    case 'apple-music': return 'Apple Music';
    default: return 'Streaming';
  }
}

function medalColor(index: number): string {
  if (index === 0) return MEDAL_GOLD;
  if (index === 1) return MEDAL_SILVER;
  if (index === 2) return MEDAL_BRONZE;
  return SynthTokens.colors.neutral400;
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

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
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
    setStats(data ?? { top_artists: [], top_genres: [], total_listening_hours: 0 });
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadStats(false);
  }, [loadStats]);

  const [resyncing, setResyncing] = useState(false);

  const openStreamingOnWeb = (provider?: StreamingProvider) => {
    const base = `${getExpoSiteUrl()}/streaming-stats`;
    const url = provider && provider !== 'unknown'
      ? `${base}?connect=${encodeURIComponent(provider)}&source=expo`
      : `${base}?source=expo`;
    void WebBrowser.openBrowserAsync(url);
  };

  const handleResync = async () => {
    setResyncing(true);
    try {
      const base = `${getExpoSiteUrl()}/streaming-stats`;
      const url = linkStatus.provider && linkStatus.provider !== 'unknown'
        ? `${base}?connect=${encodeURIComponent(linkStatus.provider)}&source=expo&action=resync`
        : `${base}?source=expo&action=resync`;
      await WebBrowser.openBrowserAsync(url);
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} accessibilityLabel="Back">
          <ChevronLeft size={26} color={SynthTokens.colors.neutral900} />
        </Pressable>
        <View style={styles.topBarTitle}>
          <Music size={18} color={PINK} />
          <Text style={styles.topBarTitleText}>Streaming Stats</Text>
        </View>
        {linked ? (
          <Pressable
            style={[styles.resyncBtn, resyncing && { opacity: 0.6 }]}
            onPress={() => void handleResync()}
            disabled={resyncing}
            accessibilityLabel="Resync streaming stats"
          >
            <RefreshCw size={14} color={SynthTokens.colors.neutral0} />
            <Text style={styles.resyncBtnText}>{resyncing ? 'Opening…' : 'Resync'}</Text>
          </Pressable>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void loadStats(true)} tintColor={PINK} />
        }
      >
        {/* Connect cards */}
        {showConnectCards ? (
          <View style={styles.connectSection}>
            <Text style={styles.connectHeading}>Connect your music</Text>
            <SynthText variant="body" color="secondary" style={styles.connectCopy}>
              Import your listening history to see top artists, genres, and get better event recommendations.
            </SynthText>
            <Pressable onPress={() => openStreamingOnWeb('spotify')} style={styles.connectCardWrapper}>
              <LinearGradient
                colors={['#1DB954', '#15803d']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.connectCard}
              >
                <View style={styles.connectCardInner}>
                  <View style={styles.connectCardIcon}>
                    <Music size={24} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.connectCardTitle}>Connect Spotify</Text>
                    <Text style={styles.connectCardSub}>Opens on web · takes 30 seconds</Text>
                  </View>
                  <Text style={styles.connectCardArrow}>→</Text>
                </View>
              </LinearGradient>
            </Pressable>
            <Pressable onPress={() => openStreamingOnWeb('apple-music')} style={styles.connectCardWrapper}>
              <LinearGradient
                colors={['#fc3c44', '#b91c1c']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.connectCard}
              >
                <View style={styles.connectCardInner}>
                  <View style={styles.connectCardIcon}>
                    <Headphones size={24} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.connectCardTitle}>Connect Apple Music</Text>
                    <Text style={styles.connectCardSub}>Opens on web · same quick flow</Text>
                  </View>
                  <Text style={styles.connectCardArrow}>→</Text>
                </View>
              </LinearGradient>
            </Pressable>
          </View>
        ) : null}

        {/* Syncing empty state */}
        {showSyncingEmptyState ? (
          <View style={styles.syncingCard}>
            <LinearGradient
              colors={[PINK + '18', PINK + '08']}
              style={styles.syncingCardGradient}
            >
              <View style={styles.syncingIconRow}>
                <View style={styles.syncingIconBg}>
                  <Zap size={26} color={PINK} />
                </View>
              </View>
              <Text style={styles.syncingTitle}>Connected — syncing your music</Text>
              <SynthText variant="body" color="secondary" style={styles.syncingCopy}>
                Your listening data is being imported. This usually takes a moment after first connecting.
              </SynthText>
              <View style={styles.syncingActionsRow}>
                <Pressable style={styles.refreshBtn} onPress={() => void loadStats(true)}>
                  <RefreshCw size={16} color={SynthTokens.colors.neutral0} />
                  <Text style={styles.refreshBtnText}>Refresh</Text>
                </Pressable>
                <Pressable style={styles.openWebBtn} onPress={() => openStreamingOnWeb(linkStatus.provider)}>
                  <Text style={styles.openWebBtnText}>Open on web</Text>
                </Pressable>
              </View>
            </LinearGradient>
          </View>
        ) : null}

        {/* Stats content */}
        {linked && !showSyncingEmptyState ? (
          <>
            {/* Hero listening hours card */}
            <LinearGradient
              colors={[PINK, '#c026d3']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <View style={styles.heroCardInner}>
                <View style={styles.heroIconCircle}>
                  <Headphones size={22} color={PINK} />
                </View>
                <Text style={styles.heroNumber}>{stats?.total_listening_hours ?? 0}</Text>
                <Text style={styles.heroLabel}>hours played</Text>
                <Text style={styles.heroProvider}>
                  via {providerLabel(linkStatus.provider)}
                </Text>
              </View>
            </LinearGradient>

            {/* Top artists */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Mic2 size={20} color={PINK} />
                <Text style={styles.sectionTitle}>Top Artists</Text>
              </View>
              {(stats?.top_artists ?? []).length > 0 ? (
                <View style={styles.artistList}>
                  {(stats?.top_artists ?? []).map(
                    (artist: { name: string; popularity?: number }, index: number) => (
                      <View key={artist.name} style={styles.artistRow}>
                        <View style={[styles.rankBadge, { backgroundColor: medalColor(index) + '22' }]}>
                          <Text style={[styles.rankText, { color: medalColor(index) }]}>
                            {index + 1}
                          </Text>
                        </View>
                        <View style={styles.artistInfo}>
                          <Text style={styles.artistName} numberOfLines={1}>{artist.name}</Text>
                          <View style={styles.barTrack}>
                            <View
                              style={[
                                styles.barFill,
                                {
                                  width: `${artist.popularity || 0}%`,
                                  backgroundColor: index < 3 ? medalColor(index) : PINK,
                                },
                              ]}
                            />
                          </View>
                        </View>
                        {index < 3 ? (
                          <Text style={styles.medalEmoji}>
                            {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                          </Text>
                        ) : null}
                      </View>
                    )
                  )}
                </View>
              ) : (
                <SynthText variant="meta" color="secondary" style={styles.emptyMsg}>
                  No artist data yet — check back after syncing.
                </SynthText>
              )}
            </View>

            {/* Top genres */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <BarChart3 size={20} color={PINK} />
                <Text style={styles.sectionTitle}>Top Genres</Text>
              </View>
              {(stats?.top_genres ?? []).length > 0 ? (
                <View style={styles.genresGrid}>
                  {(stats?.top_genres ?? []).map((genre: { genre: string; count: number }, i: number) => (
                    <View
                      key={genre.genre}
                      style={[styles.genrePill, { borderColor: GENRE_COLORS[i % GENRE_COLORS.length] + '55' }]}
                    >
                      <View style={[styles.genreDot, { backgroundColor: GENRE_COLORS[i % GENRE_COLORS.length] }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.genreName} numberOfLines={1}>{genre.genre}</Text>
                        <Text style={styles.genreCount}>{genre.count} plays</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <SynthText variant="meta" color="secondary" style={styles.emptyMsg}>
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
    backgroundColor: SynthTokens.colors.neutral50,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SynthTokens.spacing.sm,
    paddingBottom: 8,
    paddingTop: 8,
    backgroundColor: SynthTokens.colors.neutral0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topBarTitleText: {
    fontSize: 17,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  resyncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: PINK,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resyncBtnText: {
    color: SynthTokens.colors.neutral0,
    fontSize: 13,
    fontWeight: '700',
  },
  scrollContent: {
    padding: SynthTokens.spacing.md,
    paddingBottom: 80,
    gap: SynthTokens.spacing.lg,
  },

  // Connect cards
  connectSection: { gap: SynthTokens.spacing.md },
  connectHeading: {
    fontSize: 26,
    fontWeight: '800',
    color: SynthTokens.colors.neutral900,
  },
  connectCopy: { lineHeight: 22 },
  connectCardWrapper: { borderRadius: 18, overflow: 'hidden' },
  connectCard: { borderRadius: 18 },
  connectCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 14,
  },
  connectCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectCardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 3,
  },
  connectCardSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  connectCardArrow: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '700',
  },

  // Syncing state
  syncingCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: PINK + '30',
  },
  syncingCardGradient: {
    padding: SynthTokens.spacing.lg,
    alignItems: 'center',
  },
  syncingIconRow: { marginBottom: SynthTokens.spacing.md },
  syncingIconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: PINK + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: SynthTokens.colors.neutral900,
    textAlign: 'center',
    marginBottom: 10,
  },
  syncingCopy: { lineHeight: 22, textAlign: 'center', marginBottom: SynthTokens.spacing.lg },
  syncingActionsRow: { flexDirection: 'row', gap: 10, width: '100%' },
  refreshBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: PINK,
  },
  refreshBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  openWebBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  openWebBtnText: { color: SynthTokens.colors.neutral900, fontSize: 14, fontWeight: '700' },

  // Hero card
  heroCard: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  heroCardInner: {
    padding: SynthTokens.spacing.xl,
    alignItems: 'center',
  },
  heroIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SynthTokens.spacing.md,
  },
  heroNumber: {
    fontSize: 64,
    fontWeight: '900',
    color: '#fff',
    lineHeight: 72,
  },
  heroLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  heroProvider: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 6,
  },

  // Sections
  section: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 18,
    padding: SynthTokens.spacing.lg,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: SynthTokens.spacing.md,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: SynthTokens.colors.neutral900,
  },
  emptyMsg: { lineHeight: 20 },

  // Artist list
  artistList: { gap: SynthTokens.spacing.sm },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SynthTokens.spacing.sm,
  },
  rankBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 15,
    fontWeight: '800',
  },
  artistInfo: { flex: 1 },
  artistName: {
    fontSize: 15,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
    marginBottom: 6,
  },
  barTrack: {
    height: 5,
    backgroundColor: SynthTokens.colors.neutral100,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  medalEmoji: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },

  // Genre grid
  genresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SynthTokens.spacing.sm,
  },
  genrePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: SynthTokens.colors.neutral50,
    paddingHorizontal: SynthTokens.spacing.md,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    minWidth: '47%',
    flex: 1,
  },
  genreDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  genreName: {
    fontSize: 14,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
    marginBottom: 2,
  },
  genreCount: {
    fontSize: 12,
    color: SynthTokens.colors.neutral600,
    fontWeight: '500',
  },
});
