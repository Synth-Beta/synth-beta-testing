import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Text,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import {
  getSpotifyTimeRangeList,
  hasPerRangeData,
  SPOTIFY_TIME_RANGE_LABELS,
  computeTopGenresForTimeRange,
  computeTopGenresFromArtistList,
  formatTopGenresForDisplay,
  type TopGenreEntry,
  type SpotifyTimeRange,
} from '@synth/shared';
import { SynthText } from '../src/components/SynthText';
import { SynthTokens } from '../src/tokens/SynthTokens';
import {
  loadStreamingProfile,
  hasAnyProfileStats,
  providerAccentColor,
  type StreamingServiceType,
} from '../src/services/streamingProfileService';
import {
  type StreamingLinkStatus,
  type StreamingProvider,
} from '../src/services/streamingConnectionService';
import { supabase } from '../src/integrations/supabase/client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Music, ChevronLeft, RefreshCw, Headphones, Zap } from 'lucide-react-native';
import { getExpoSiteUrl } from '../src/utils/siteUrl';
import {
  syncStreamingProfile,
  buildExpoSpotifyConnectUrl,
  buildExpoSpotifyReconnectUrl,
  withSessionHash,
  formatStreamingSyncCountLine,
} from '../src/services/streamingSyncActions';
import { authenticateSpotifyInApp } from '../src/services/spotifyAuthService';
import { runStreamingAutoSync } from '../src/services/streamingAutoSyncService';
import { formatRelativeTime } from '../src/utils/formatRelativeTime';
import { StreamingTimeRangePicker } from '../src/components/streaming/StreamingTimeRangePicker';
import {
  StreamingStatsTabBar,
  type StreamingStatsTab,
} from '../src/components/streaming/StreamingStatsTabBar';
import { StreamingArtistRow } from '../src/components/streaming/StreamingArtistRow';
import { StreamingSongRow } from '../src/components/streaming/StreamingSongRow';
import { StreamingGenreRow } from '../src/components/streaming/StreamingGenreRow';

const PINK = SynthTokens.colors.brandPink500;

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
  const [profileData, setProfileData] = useState<Record<string, unknown> | null>(null);
  const [serviceType, setServiceType] = useState<StreamingServiceType | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [linkStatus, setLinkStatus] = useState<StreamingLinkStatus>({
    linked: false,
    provider: 'unknown',
    profileUrl: null,
  });
  const [needsConnection, setNeedsConnection] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [autoSyncAttempted, setAutoSyncAttempted] = useState(false);
  const [timeRange, setTimeRange] = useState<SpotifyTimeRange>('medium_term');
  const [activeTab, setActiveTab] = useState<StreamingStatsTab>('artists');

  const insets = useSafeAreaInsets();
  const router = useRouter();

  const loadProfile = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) {
      setProfileData(null);
      setServiceType(null);
      setLastSynced(null);
      setLinkStatus({ linked: false, provider: 'unknown', profileUrl: null });
      setNeedsConnection(true);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const result = await loadStreamingProfile(user.id);
    setLinkStatus(result.linkStatus);
    setServiceType(result.serviceType);
    setProfileData(result.profileData);
    setLastSynced(result.lastSynced);
    setNeedsConnection(result.needsConnection);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadProfile(false);
  }, [loadProfile]);

  const openStreamingOnWeb = (provider?: StreamingProvider) => {
    const base = `${getExpoSiteUrl()}/streaming-stats`;
    const url =
      provider && provider !== 'unknown'
        ? `${base}?connect=${encodeURIComponent(provider)}&source=expo`
        : `${base}?source=expo`;
    void (async () => {
      void WebBrowser.openBrowserAsync(await withSessionHash(url));
    })();
  };

  const openSpotifyConnectOnWeb = () => {
    void (async () => {
      void WebBrowser.openBrowserAsync(await buildExpoSpotifyConnectUrl());
    })();
  };

  const openSpotifyReconnectOnWeb = () => {
    void (async () => {
      void WebBrowser.openBrowserAsync(await buildExpoSpotifyReconnectUrl());
    })();
  };

  const handleConnectSpotifyInApp = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    setResyncing(true);
    try {
      const authResult = await authenticateSpotifyInApp();
      if (!authResult.ok) {
        if (!authResult.cancelled) {
          Alert.alert('Connect failed', authResult.error);
        }
        return;
      }

      // Token saved — now trigger a full server sync.
      const syncResult = await syncStreamingProfile(user.id, 'spotify', { manual: true });
      await loadProfile(false);

      if (syncResult.ok) {
        const countLine = formatStreamingSyncCountLine(syncResult.counts);
        Alert.alert(
          'Spotify connected!',
          countLine
            ? `Synced from Spotify: ${countLine} Your event feed will reflect your taste.`
            : 'Spotify connected and your stats are importing.'
        );
      } else if (syncResult.skipped !== 'no-stored-token') {
        Alert.alert('Connected, sync pending', syncResult.message || 'Stats are syncing — pull to refresh in a moment.');
      }
    } finally {
      setResyncing(false);
    }
  };

  const handleResync = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    if (linkStatus.provider === 'apple-music') {
      Alert.alert(
        'Sync on web',
        'Apple Music resync opens in your browser once to refresh your stats.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open web',
            onPress: () => {
              const url = `${getExpoSiteUrl()}/streaming-stats?connect=${encodeURIComponent('apple-music')}&source=expo`;
              void WebBrowser.openBrowserAsync(url);
            },
          },
        ]
      );
      return;
    }

    if (!linkStatus.linked || linkStatus.provider === 'unknown') {
      // Not yet connected — run full in-app connect (which handles token save + first sync).
      setResyncing(true);
      try {
        const result = await syncStreamingProfile(user.id, 'spotify', { manual: true });
        await loadProfile(false);
        if (result.ok) {
          Alert.alert('Connected!', 'Spotify connected and stats imported.');
          return;
        }

        if (result.skipped === 'no-stored-token') {
          Alert.alert(
            'Spotify not connected',
            result.message || 'Spotify sign-in was cancelled. Tap Resync to try again.',
            [
              { text: 'OK', style: 'cancel' },
              { text: 'Connect Spotify', onPress: () => void handleConnectSpotifyInApp() },
              { text: 'Reconnect on web', onPress: openSpotifyReconnectOnWeb },
            ]
          );
          return;
        }

        if (result.skipped === 'error') {
          Alert.alert('Connect failed', result.message || 'Could not connect Spotify. Please try again.');
          return;
        }

        Alert.alert('Connect failed', result.message || 'Could not connect Spotify. Please try again.');
      } finally {
        setResyncing(false);
      }
      return;
    }

    setResyncing(true);
    try {
      const result = await syncStreamingProfile(user.id, 'spotify', { manual: true });
      await loadProfile(false);

      const countLine = formatStreamingSyncCountLine(result.counts);

      if (result.ok) {
        Alert.alert(
          'Stats updated',
          countLine
            ? `Synced from Spotify: ${countLine} Your event feed will reflect your taste.`
            : 'Your streaming data has been refreshed. Your event feed will reflect your taste.'
        );
        return;
      }

      if (result.skipped === 'no-stored-token') {
        // Silent sync found no server-saved token — offer a real native re-login, not just
        // the web fallback (which needs a logged-in web session that TestFlight users won't have).
        Alert.alert(
          'Could not reach Spotify',
          result.message || 'Sign in to Spotify in the app or try reconnecting on the web.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Connect Spotify', onPress: () => void handleConnectSpotifyInApp() },
            { text: 'Reconnect on web', onPress: openSpotifyReconnectOnWeb },
          ]
        );
        return;
      }

      if (result.skipped === 'partial-sync') {
        Alert.alert(
          'Sync incomplete — songs missing',
          countLine
            ? `${countLine} ${result.message || 'Try syncing again. If songs stay empty, reconnect Spotify on the web.'}`
            : result.message ||
                'Artists synced but songs are missing. Try again or reconnect Spotify on the web.'
        );
        return;
      }

      Alert.alert(
        'Sync failed',
        countLine
          ? `${countLine} ${result.message || 'Could not refresh your stats. Try again.'}`
          : result.message || 'Could not refresh your stats. Try again.'
      );
    } finally {
      setResyncing(false);
    }
  };

  useEffect(() => {
    if (
      loading ||
      autoSyncAttempted ||
      needsConnection ||
      !linkStatus.linked ||
      linkStatus.provider !== 'spotify' ||
      !serviceType
    ) {
      return;
    }

    setAutoSyncAttempted(true);
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      setResyncing(true);
      try {
        const result = await runStreamingAutoSync({
          userId: user.id,
          serviceType: 'spotify',
          profileData,
          lastSynced,
          linked: true,
          options: { reason: 'migration' },
        });
        if (result.ok) {
          await loadProfile(false);
        }
      } finally {
        setResyncing(false);
      }
    })();
  }, [
    loading,
    autoSyncAttempted,
    needsConnection,
    linkStatus.linked,
    linkStatus.provider,
    serviceType,
    profileData,
    lastSynced,
    loadProfile,
  ]);

  const accentColor = providerAccentColor(linkStatus.provider);
  const isSpotify = serviceType === 'spotify';
  const hasTimeRanges =
    isSpotify &&
    (hasPerRangeData(profileData, 'topArtistsByTimeRange') ||
      hasPerRangeData(profileData, 'topTracksByTimeRange'));

  const displayArtists = useMemo(() => {
    if (!profileData) return [];
    if (serviceType === 'spotify') {
      return getSpotifyTimeRangeList(
        profileData,
        timeRange,
        'topArtistsByTimeRange',
        'topArtists'
      ).items;
    }
    const flat = profileData.topArtists;
    return Array.isArray(flat) ? flat.slice(0, 20) : [];
  }, [profileData, timeRange, serviceType]);

  const { items: displaySongs, needsResync: songsNeedResync } = useMemo(() => {
    if (!profileData) {
      return { items: [] as unknown[], needsResync: false };
    }
    if (serviceType === 'spotify') {
      return getSpotifyTimeRangeList(
        profileData,
        timeRange,
        'topTracksByTimeRange',
        'topTracks'
      );
    }
    const flat = profileData.topTracks;
    const items = Array.isArray(flat) ? flat.slice(0, 20) : [];
    return { items, needsResync: false };
  }, [profileData, timeRange, serviceType]);

  const genres = useMemo(() => {
    if (!profileData) return [];

    const toDisplay = (entries: TopGenreEntry[]) =>
      formatTopGenresForDisplay(entries).map((g) => ({ name: g.name, count: g.count, pct: g.pct }));

    if (serviceType === 'spotify') {
      const perRange = computeTopGenresForTimeRange(profileData, timeRange);
      if (perRange.length > 0) return toDisplay(perRange);

      // Fall back to the snapshot genres when per-range artist data has no genre tags
      // (common when the profile was built from user_preferences snapshot, not a full sync).
      const snapshot = profileData.topGenresSnapshot as TopGenreEntry[] | undefined;
      if (Array.isArray(snapshot) && snapshot.length > 0) return toDisplay(snapshot);
      return [];
    }

    const artists = Array.isArray(profileData.topArtists) ? profileData.topArtists : [];
    const fromArtists = computeTopGenresFromArtistList(artists);
    if (fromArtists.length > 0) return toDisplay(fromArtists);

    const snapshot = profileData.topGenresSnapshot as TopGenreEntry[] | undefined;
    if (Array.isArray(snapshot) && snapshot.length > 0) return toDisplay(snapshot);
    return [];
  }, [profileData, timeRange, serviceType]);

  const linked = linkStatus.linked;
  const showConnectCards = needsConnection && !linked;
  const showSyncingEmptyState = linked && !hasAnyProfileStats(profileData);
  const showSongResyncBanner = isSpotify && songsNeedResync && !resyncing;

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={PINK} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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
            <Text style={styles.resyncBtnText}>{resyncing ? 'Syncing…' : 'Resync'}</Text>
          </Pressable>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadProfile(true)}
            tintColor={PINK}
          />
        }
      >
        <View style={styles.titleBlock}>
          <Text style={styles.pageTitle}>Streaming Stats</Text>
          {lastSynced ? (
            <Text style={styles.lastSynced}>Updated {formatRelativeTime(lastSynced)}</Text>
          ) : linked ? (
            <Text style={styles.lastSynced}>
              via {providerLabel(linkStatus.provider)} — tap Resync to refresh
            </Text>
          ) : null}
        </View>

        {showConnectCards ? (
          <View style={styles.connectSection}>
            <Text style={styles.connectHeading}>Connect your music</Text>
            <SynthText variant="body" color="secondary" style={styles.connectCopy}>
              Import your listening history to see top artists, songs, and genres.
            </SynthText>
            <Pressable
              onPress={() => void handleConnectSpotifyInApp()}
              style={styles.connectCardWrapper}
              disabled={resyncing}
            >
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
                    <Text style={styles.connectCardSub}>
                      {resyncing ? 'Connecting…' : 'Stay in app · takes 30 seconds'}
                    </Text>
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

        {showSyncingEmptyState ? (
          <View style={styles.syncingCard}>
            <LinearGradient colors={[PINK + '18', PINK + '08']} style={styles.syncingCardGradient}>
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
                <Pressable style={styles.refreshBtn} onPress={() => void handleResync()}>
                  <RefreshCw size={16} color={SynthTokens.colors.neutral0} />
                  <Text style={styles.refreshBtnText}>{resyncing ? 'Syncing…' : 'Sync now'}</Text>
                </Pressable>
                <Pressable style={styles.openWebBtn} onPress={() => openStreamingOnWeb(linkStatus.provider)}>
                  <Text style={styles.openWebBtnText}>Open on web</Text>
                </Pressable>
              </View>
            </LinearGradient>
          </View>
        ) : null}

        {linked && profileData && !showSyncingEmptyState ? (
          <>
            {hasTimeRanges ? (
              <StreamingTimeRangePicker
                value={timeRange}
                onChange={setTimeRange}
                accentColor={accentColor}
              />
            ) : null}

            {resyncing && songsNeedResync ? (
              <View style={styles.bannerBlue}>
                <Text style={styles.bannerBlueText}>
                  Refreshing song rankings for each period…
                </Text>
              </View>
            ) : null}

            {showSongResyncBanner ? (
              <View style={styles.bannerAmber}>
                <Text style={styles.bannerAmberText}>
                  Songs are missing from your last sync. Artists look up to date — tap Sync now first.
                  If songs still don't appear, reconnect Spotify on the web once.
                </Text>
                <View style={styles.bannerActionsRow}>
                  <Pressable
                    style={[styles.bannerBtnPrimary, { backgroundColor: accentColor }]}
                    onPress={openSpotifyReconnectOnWeb}
                    disabled={resyncing}
                  >
                    <Text style={styles.bannerBtnPrimaryText}>Reconnect on web</Text>
                  </Pressable>
                  <Pressable style={styles.bannerBtn} onPress={() => void handleResync()} disabled={resyncing}>
                    <RefreshCw size={14} color="#92400e" />
                    <Text style={styles.bannerBtnText}>{resyncing ? 'Syncing…' : 'Sync now'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <StreamingStatsTabBar value={activeTab} onChange={setActiveTab} accentColor={accentColor} />

            <View style={styles.list}>
              {activeTab === 'artists' ? (
                displayArtists.length === 0 ? (
                  <SynthText variant="meta" color="secondary" style={styles.emptyMsg}>
                    No artist data for this period. Tap Resync to sync.
                  </SynthText>
                ) : (
                  displayArtists.map((artist, i) => (
                    <StreamingArtistRow
                      key={(artist as { id?: string }).id || `artist-${i}`}
                      artist={artist as Parameters<typeof StreamingArtistRow>[0]['artist']}
                      rank={i + 1}
                      accentColor={accentColor}
                    />
                  ))
                )
              ) : null}

              {activeTab === 'songs' ? (
                displaySongs.length === 0 ? (
                  <SynthText variant="meta" color="secondary" style={styles.emptyMsg}>
                    {songsNeedResync
                      ? 'Song rankings for each period are missing. Tap Resync once — then all time ranges will show different top songs.'
                      : `No song data for ${SPOTIFY_TIME_RANGE_LABELS[timeRange]}. Tap Resync to sync.`}
                  </SynthText>
                ) : (
                  displaySongs.map((track, i) => (
                    <StreamingSongRow
                      key={(track as { id?: string }).id || `track-${i}`}
                      track={track as Parameters<typeof StreamingSongRow>[0]['track']}
                      rank={i + 1}
                      accentColor={accentColor}
                    />
                  ))
                )
              ) : null}

              {activeTab === 'genres' ? (
                genres.length === 0 ? (
                  <SynthText variant="meta" color="secondary" style={styles.emptyMsg}>
                    No genre data yet. Genres are derived from your top artists — tap Resync to
                    import them.
                  </SynthText>
                ) : (
                  genres.map((g) => (
                    <StreamingGenreRow
                      key={g.name}
                      name={g.name}
                      count={g.count}
                      pct={g.pct}
                      accentColor={accentColor}
                    />
                  ))
                )
              ) : null}
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
    gap: SynthTokens.spacing.md,
  },
  titleBlock: { gap: 4 },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: SynthTokens.colors.neutral900,
  },
  lastSynced: {
    fontSize: 12,
    color: SynthTokens.colors.neutral600,
  },
  connectSection: { gap: SynthTokens.spacing.md },
  connectHeading: {
    fontSize: 22,
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
  bannerBlue: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    padding: 12,
  },
  bannerBlueText: {
    fontSize: 13,
    color: '#1e3a8a',
    lineHeight: 18,
  },
  bannerAmber: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fcd34d',
    backgroundColor: '#fffbeb',
    padding: 12,
    gap: 10,
  },
  bannerAmberText: {
    fontSize: 13,
    color: '#78350f',
    lineHeight: 18,
  },
  bannerActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bannerBtnPrimary: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  bannerBtnPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  bannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fcd34d',
    backgroundColor: '#fff',
  },
  bannerBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400e',
  },
  list: { gap: 8 },
  emptyMsg: { lineHeight: 20, paddingVertical: 12, textAlign: 'center' },
});
