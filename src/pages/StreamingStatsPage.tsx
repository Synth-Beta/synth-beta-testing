import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Music, RefreshCw, Headphones } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { spotifyService } from '@/services/spotifyService';
import { appleMusicService } from '@/services/appleMusicService';
import { streamingSyncService } from '@/services/streamingSyncService';
import { runStreamingAutoSync } from '@/services/streamingAutoSyncService';
import { syncStreamingProfile } from '@/services/streamingSyncActions';
import { getStreamingLinkStatus } from '@/services/streamingConnectionService';
import { fetchUserStreamingStatsSnapshot } from '@synth/shared';
import { toast } from '@/hooks/use-toast';
import PageShell from '@/components/layout/PageShell';
import { formatDistanceToNow } from 'date-fns';
import { SpotifyUser } from '@/types/spotify';
import {
  getSpotifyTimeRangeList,
  hasPerRangeData,
  type SpotifyTimeRange,
} from '@/utils/streamingProfileData';

interface StreamingStatsPageProps {
  onBack?: () => void;
}

const TIME_RANGE_LABELS: Record<SpotifyTimeRange, string> = {
  short_term: '4 Weeks',
  medium_term: '6 Months',
  long_term: 'All Time',
};

export const StreamingStatsPage = ({ onBack }: StreamingStatsPageProps) => {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connectingSpotify, setConnectingSpotify] = useState(false);
  const [serviceType, setServiceType] = useState<'spotify' | 'apple-music' | null>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [timeRange, setTimeRange] = useState<SpotifyTimeRange>('medium_term');
  const [autoSyncAttempted, setAutoSyncAttempted] = useState(false);
  const [showExpoReturnBanner, setShowExpoReturnBanner] = useState(false);
  const connectFromExpoAttempted = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('source') === 'expo' && params.get('synced') === '1') {
      setShowExpoReturnBanner(true);
    }
  }, []);

  // Auto-connect when opened from Expo with ?connect=spotify (new link or one-time token save)
  useEffect(() => {
    if (!user || loading || connectFromExpoAttempted.current) return;
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const connect = params.get('connect');
    if (connect !== 'spotify') return;
    if (!needsConnection && params.get('action') !== 'resync') return;

    connectFromExpoAttempted.current = true;
    localStorage.setItem(
      'spotify_connect_source',
      params.get('source') === 'expo' ? 'expo' : 'streaming_stats'
    );
    void handleConnectSpotify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, needsConnection]);

  useEffect(() => {
    if (user) loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  useEffect(() => {
    if (!user || loading) return;
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    if (params.get('action') === 'resync' && serviceType) {
      void handleSync();
    }
    // Only run once after initial load resolves
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, serviceType]);

  // Background refresh: one-time song-period migration + weekly stale refresh
  useEffect(() => {
    if (!user || loading || needsConnection || !serviceType || autoSyncAttempted) return;

    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    if (params.get('action') === 'resync') return;
    if (params.get('connect')) return;
    if (params.get('connect')) return;

    setAutoSyncAttempted(true);
    void (async () => {
      setSyncing(true);
      try {
        const result = await runStreamingAutoSync({
          userId: user.id,
          serviceType,
          profileData,
          lastSynced,
          linked: true,
          options: { reason: 'migration' },
        });
        if (result.ok) {
          await loadProfile();
        } else if (result.skipped && result.skipped !== 'not-needed' && result.skipped !== 'throttled') {
          console.warn('Streaming auto-sync skipped:', result.skipped);
        }
      } finally {
        setSyncing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, needsConnection, serviceType, autoSyncAttempted]);

  const loadProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const linkStatus = await getStreamingLinkStatus(user.id);

      const { data: streamingRows } = await supabase
        .from('streaming_profiles')
        .select('profile_data, last_updated, service_type')
        .eq('user_id', user.id)
        .order('last_updated', { ascending: false });

      const preferredType =
        linkStatus.provider !== 'unknown' ? linkStatus.provider : null;

      const profileRow =
        (preferredType
          ? streamingRows?.find((row) => row.service_type === preferredType)
          : null) ??
        streamingRows?.find((row) => row.profile_data) ??
        streamingRows?.[0] ??
        null;

      const resolvedType: 'spotify' | 'apple-music' | null =
        profileRow?.service_type === 'spotify' || profileRow?.service_type === 'apple-music'
          ? profileRow.service_type
          : linkStatus.provider !== 'unknown'
            ? linkStatus.provider
            : null;

      if (!linkStatus.linked && !profileRow?.profile_data) {
        setNeedsConnection(true);
        setServiceType(null);
        setProfileData(null);
        setLastSynced(null);
        return;
      }

      setServiceType(resolvedType);

      if (profileRow?.profile_data) {
        setProfileData(profileRow.profile_data);
        setLastSynced(profileRow.last_updated ?? null);
        setNeedsConnection(false);
      } else {
        const snapshot = await fetchUserStreamingStatsSnapshot(supabase, user.id);
        if (snapshot && (snapshot.top_artists.length > 0 || snapshot.top_genres.length > 0)) {
          setProfileData({
            topArtists: snapshot.top_artists.map((artist) => ({
              name: artist.name,
              popularity: artist.popularity,
              genres: [],
            })),
            topTracks: [],
            topGenresSnapshot: snapshot.top_genres,
          });
        } else {
          setProfileData(null);
        }
        setLastSynced(null);
        setNeedsConnection(false);
      }

      // Best-effort: refresh Spotify profile URL when this browser has a live session.
      if (resolvedType === 'spotify' && (await spotifyService.ensureSession())) {
        await persistSpotifyProfileUrl();
      }
    } catch (err) {
      console.error('Error loading streaming profile:', err);
      setNeedsConnection(true);
    } finally {
      setLoading(false);
    }
  };

  const persistSpotifyProfileUrl = async (profile?: SpotifyUser | null) => {
    if (!user?.id) {
      return;
    }

    try {
      const spotifyProfile = profile ?? (await spotifyService.getUserProfile());
      const url = spotifyProfile?.external_urls?.spotify;
      if (!url) {
        return;
      }

      const { error } = await supabase
        .from('users')
        .update({ music_streaming_profile: url })
        .eq('user_id', user.id);

      if (error) {
        console.error('Error persisting Spotify profile URL:', error);
      }
    } catch (error) {
      console.error('Error persisting Spotify profile URL:', error);
    }
  };

  const handleSync = async () => {
    if (!serviceType || !user) return;
    setSyncing(true);
    try {
      const result = await syncStreamingProfile(user.id, serviceType, { manual: true });
      await loadProfile();

      if (result.ok) {
        toast({
          title: 'Stats updated',
          description: result.usedServer
            ? 'Your streaming data has been refreshed from Spotify. Your event feed will reflect your taste.'
            : 'Your streaming data has been refreshed.',
        });
        return;
      }

      if (result.skipped === 'partial-sync') {
        toast({
          title: 'Songs not synced',
          description:
            result.message ||
            'Your artists synced but songs are missing. Disconnect and reconnect Spotify, then sync again.',
          variant: 'destructive',
        });
        return;
      }

      if (result.skipped === 'no-stored-token' || result.skipped === 'no-session') {
        toast({
          title: 'Connect Spotify to sync',
          description:
            result.message ||
            'Use the Connect Spotify button above to sign in once — then Sync now will work in place.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Sync failed',
        description: result.message || 'Could not refresh stats. Please try again.',
        variant: 'destructive',
      });
    } catch (err) {
      console.error('Sync error:', err);
      toast({
        title: 'Sync failed',
        description: err instanceof Error ? err.message : 'Could not refresh stats. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleConnectSpotify = async () => {
    setConnectingSpotify(true);
    try {
      if (!spotifyService.isConfigured()) {
        toast({
          title: 'Spotify not available',
          description: 'Spotify is not configured for this build.',
          variant: 'destructive',
        });
        return;
      }

      localStorage.setItem(
        'spotify_connect_source',
        typeof window !== 'undefined' &&
          new URLSearchParams(window.location.search).get('source') === 'expo'
          ? 'expo'
          : 'streaming_stats'
      );

      const isNativeCapacitor =
        typeof window !== 'undefined' && typeof (window as any).Capacitor !== 'undefined';

      await spotifyService.authenticate({
        onNavigate: isNativeCapacitor
          ? async (url: string) => {
              const { Browser } = await import('@capacitor/browser');
              await Browser.open({ url });
            }
          : undefined,
      });
    } catch (err) {
      console.error('Spotify connect error:', err);
      toast({
        title: 'Connection failed',
        description: 'Could not connect to Spotify. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setConnectingSpotify(false);
    }
  };

  const handleConnectAppleMusic = async () => {
    if (typeof (window as any).MusicKit === 'undefined') {
      toast({
        title: 'Apple Music unavailable',
        description: 'Apple Music connection requires the native app build.',
        variant: 'destructive',
      });
      return;
    }
    setSyncing(true);
    try {
      await appleMusicService.authenticate();
      streamingSyncService.startSync('apple-music');
      appleMusicService.syncProfileData().then(() => {
        streamingSyncService.completeSync();
        loadProfile();
      }).catch(err => {
        streamingSyncService.errorSync(err.message || 'Sync failed');
      });
      setNeedsConnection(false);
      await loadProfile();
    } catch (err) {
      console.error('Apple Music connect error:', err);
      streamingSyncService.errorSync(err instanceof Error ? err.message : 'Connection failed');
      toast({
        title: 'Connection failed',
        description: 'Could not connect to Apple Music. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      window.history.back();
    }
  };

  // ─── Derived data ───────────────────────────────────────────────────────────

  const displayArtists = useMemo<any[]>(() => {
    if (!profileData) return [];
    if (serviceType === 'spotify') {
      return getSpotifyTimeRangeList(
        profileData,
        timeRange,
        'topArtistsByTimeRange',
        'topArtists'
      ).items as any[];
    }
    return Array.isArray(profileData.topArtists) ? profileData.topArtists.slice(0, 20) : [];
  }, [profileData, timeRange, serviceType]);

  const { items: displaySongs, needsResync: songsNeedResync } = useMemo(() => {
    if (!profileData) {
      return { items: [] as any[], needsResync: false };
    }
    if (serviceType === 'spotify') {
      const result = getSpotifyTimeRangeList(
        profileData,
        timeRange,
        'topTracksByTimeRange',
        'topTracks'
      );
      return { items: result.items as any[], needsResync: result.needsResync };
    }
    const flat = Array.isArray(profileData.topTracks) ? profileData.topTracks.slice(0, 20) : [];
    return { items: flat as any[], needsResync: false };
  }, [profileData, timeRange, serviceType]);

  const genres = useMemo<{ name: string; count: number; pct: number }[]>(() => {
    const snapshotGenres = profileData?.topGenresSnapshot as
      | Array<{ genre: string; count: number }>
      | undefined;
    if (Array.isArray(snapshotGenres) && snapshotGenres.length > 0) {
      const max = snapshotGenres[0]?.count || 1;
      return snapshotGenres
        .slice(0, 12)
        .map((entry) => ({
          name: entry.genre,
          count: entry.count,
          pct: Math.round((entry.count / max) * 100),
        }));
    }

    const counts: Record<string, number> = {};
    displayArtists.forEach((a: any) => {
      (a.genres || []).forEach((g: string) => {
        counts[g] = (counts[g] || 0) + 1;
      });
    });
    const entries = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
    const max = entries[0]?.[1] || 1;
    return entries.map(([name, count]) => ({ name, count, pct: Math.round((count / max) * 100) }));
  }, [displayArtists]);

  const isSpotify = serviceType === 'spotify';
  const accentColor = isSpotify ? '#1DB954' : '#FC3C44';
  const serviceName = isSpotify ? 'Spotify' : 'Apple Music';
  const hasTimeRanges =
    isSpotify &&
    (hasPerRangeData(profileData, 'topArtistsByTimeRange') ||
      hasPerRangeData(profileData, 'topTracksByTimeRange'));
  const showSongResyncBanner = isSpotify && songsNeedResync && !syncing;

  // ─── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-synth-pink mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading your stats...</p>
        </div>
      </div>
    );
  }

  // ─── Connection screen ──────────────────────────────────────────────────────

  if (needsConnection) {
    return (
      <div
        className="min-h-screen bg-gradient-to-b from-white to-pink-50/30 px-4 pb-24"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
      >
        <Button variant="ghost" onClick={handleBack} className="mb-4 -ml-2">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <div className="max-w-sm mx-auto text-center pt-6">
          <div className="w-20 h-20 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Headphones className="w-10 h-10 text-synth-pink" />
          </div>
          <h2 className="type-h2 mb-2 synth-gradient-text">Streaming Stats</h2>
          <p className="text-muted-foreground text-sm mb-8">
            Connect your music app to see your top artists, songs, and genres.
          </p>

          <div className="space-y-3">
            <button
              onClick={handleConnectSpotify}
              disabled={connectingSpotify}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-[#1DB954]/10 hover:bg-[#1DB954]/20 active:scale-[0.98] transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="w-12 h-12 bg-[#1DB954] rounded-full flex items-center justify-center flex-shrink-0">
                {connectingSpotify ? (
                  <RefreshCw className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Music className="w-6 h-6 text-white" />
                )}
              </div>
              <div>
                <p className="font-semibold text-sm">
                  {connectingSpotify ? 'Connecting...' : 'Connect Spotify'}
                </p>
                <p className="text-xs text-muted-foreground">Top artists, songs, and genres</p>
              </div>
            </button>

            <button
              onClick={handleConnectAppleMusic}
              disabled={syncing}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-red-50 hover:bg-red-100 active:scale-[0.98] transition-all text-left disabled:opacity-60"
            >
              <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                {syncing ? (
                  <RefreshCw className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Music className="w-6 h-6 text-white" />
                )}
              </div>
              <div>
                <p className="font-semibold text-sm">Connect Apple Music</p>
                <p className="text-xs text-muted-foreground">Library stats and listening history</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Stats view ─────────────────────────────────────────────────────────────

  const statsHeader = (
    <div
      className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-100 px-4 pb-3 flex items-center justify-between"
      style={{
        top: 'env(safe-area-inset-top, 0)',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
      }}
    >
      <Button variant="ghost" size="sm" onClick={handleBack} className="-ml-2">
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back
      </Button>

      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full synth-gradient-bg" />
        <span className="type-meta">{serviceName}</span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleSync}
        disabled={syncing}
        className="-mr-2"
        title="Refresh stats"
      >
        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  );

  return (
    <PageShell header={statsHeader}>
      <div className="min-h-screen bg-gradient-to-b from-white to-pink-50/30 pb-28">
        <div className="px-4 pt-5 space-y-5">
        {/* Title + last synced */}
        <div>
          <h1 className="type-h2 synth-gradient-text">Streaming Stats</h1>
          {lastSynced && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Updated {formatDistanceToNow(new Date(lastSynced), { addSuffix: true })}
            </p>
          )}
        </div>

        {showExpoReturnBanner ? (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-950">
            Spotify connected and stats synced. You can close this browser tab and return to the Synth
            app, then tap Resync on the Stats screen.
          </div>
        ) : null}

        {/* Time range selector (Spotify only) */}
        {hasTimeRanges && (
          <div className="flex gap-2">
            {(Object.keys(TIME_RANGE_LABELS) as SpotifyTimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                  timeRange === range
                    ? 'text-white shadow-sm'
                    : 'bg-white border border-gray-200 text-muted-foreground hover:border-gray-300'
                }`}
                style={timeRange === range ? { backgroundColor: accentColor } : undefined}
              >
                {TIME_RANGE_LABELS[range]}
              </button>
            ))}
          </div>
        )}

        {/* No data — prompt to sync */}
        {!profileData && (
          <Card>
            <CardContent className="py-10 text-center">
              <Music className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="font-medium mb-1">No stats yet</p>
              <p className="text-sm text-muted-foreground mb-4">
                Sync to pull your data from {serviceName}.
              </p>
              <Button
                onClick={handleSync}
                disabled={syncing}
                className="text-white"
                style={{ backgroundColor: accentColor }}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Stats'}
              </Button>
            </CardContent>
          </Card>
        )}

        {syncing && songsNeedResync ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
            Refreshing song rankings for each period…
          </div>
        ) : null}

        {showSongResyncBanner ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Song rankings by period need a refresh. Artists are up to date — sync once for{' '}
              {TIME_RANGE_LABELS[timeRange]} and all periods.
            </span>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-amber-300 bg-white hover:bg-amber-100"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync now'}
            </Button>
          </div>
        ) : null}

        {/* Tabs */}
        {profileData && (
          <Tabs defaultValue="artists">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="artists">Artists</TabsTrigger>
              <TabsTrigger value="songs">Songs</TabsTrigger>
              <TabsTrigger value="genres">Genres</TabsTrigger>
            </TabsList>

            {/* Artists */}
            <TabsContent value="artists" className="mt-3 space-y-2">
              {displayArtists.length === 0 ? (
                <EmptyTab message="No artist data for this period. Tap ↻ to sync." />
              ) : (
                displayArtists.map((artist: any, i: number) => (
                  <ArtistRow key={artist.id || i} artist={artist} rank={i + 1} accentColor={accentColor} />
                ))
              )}
            </TabsContent>

            {/* Songs (top tracks for selected time range) */}
            <TabsContent value="songs" className="mt-3 space-y-2">
              {displaySongs.length === 0 ? (
                <EmptyTab
                  message={
                    songsNeedResync
                      ? 'Song rankings for each period are missing. Tap ↻ to sync once — then 4 Weeks, 6 Months, and All Time will show different top songs.'
                      : `No song data for ${TIME_RANGE_LABELS[timeRange]}. Tap ↻ to sync.`
                  }
                />
              ) : (
                displaySongs.map((track: any, i: number) => (
                  <TrackRow key={track.id || i} track={track} rank={i + 1} accentColor={accentColor} />
                ))
              )}
            </TabsContent>

            {/* Genres */}
            <TabsContent value="genres" className="mt-3 space-y-2">
              {genres.length === 0 ? (
                <EmptyTab message="Genres are derived from your top artists for this period. Tap ↻ to sync." />
              ) : (
                genres.map((g) => (
                  <div key={g.name} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium capitalize">{g.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {g.count} artist{g.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${g.pct}%`, backgroundColor: accentColor }}
                      />
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  </PageShell>
  );
};

// ─── Small sub-components ────────────────────────────────────────────────────

function ArtistRow({
  artist,
  rank,
  accentColor,
}: {
  artist: any;
  rank: number;
  accentColor: string;
}) {
  const imageUrl = artist.images?.[0]?.url || artist.images?.[1]?.url;
  const topGenre = artist.genres?.[0];

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex items-center gap-3 p-3">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={artist.name}
          className="w-12 h-12 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-sm"
          style={{ backgroundColor: accentColor }}
        >
          {rank}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{artist.name}</p>
        {topGenre && (
          <p className="text-xs text-muted-foreground capitalize truncate">{topGenre}</p>
        )}
      </div>
      <span
        className="text-xs font-bold flex-shrink-0 w-7 text-right tabular-nums"
        style={{ color: accentColor + 'aa' }}
      >
        #{rank}
      </span>
    </div>
  );
}

function TrackRow({
  track,
  rank,
  accentColor,
}: {
  track: any;
  rank: number;
  accentColor: string;
}) {
  const imageUrl = track.album?.images?.[0]?.url || track.album?.images?.[1]?.url;
  const artistName = track.artists?.[0]?.name || track.artist || 'Unknown Artist';

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex items-center gap-3 p-3">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={track.name}
          className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
        />
      ) : (
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 text-white font-bold text-sm"
          style={{ backgroundColor: accentColor }}
        >
          {rank}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{track.name || 'Unknown Track'}</p>
        <p className="text-xs text-muted-foreground truncate">{artistName}</p>
      </div>
      <span
        className="text-xs font-bold flex-shrink-0 w-7 text-right tabular-nums"
        style={{ color: accentColor + 'aa' }}
      >
        #{rank}
      </span>
    </div>
  );
}

function EmptyTab({ message }: { message: string }) {
  return (
    <div className="text-center py-12">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
