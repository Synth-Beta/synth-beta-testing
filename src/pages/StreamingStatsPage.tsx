import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Music, RefreshCw, Headphones, BarChart3, User, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { spotifyService } from '@/services/spotifyService';
import { appleMusicService } from '@/services/appleMusicService';
import { streamingSyncService } from '@/services/streamingSyncService';
import { toast } from '@/hooks/use-toast';
import PageShell from '@/components/layout/PageShell';
import { formatDistanceToNow } from 'date-fns';

interface StreamingStatsPageProps {
  onBack?: () => void;
}

type SpotifyTimeRange = 'short_term' | 'medium_term' | 'long_term';

const TIME_RANGE_LABELS: Record<SpotifyTimeRange, string> = {
  short_term: '4 Weeks',
  medium_term: '6 Months',
  long_term: 'All Time',
};

export const StreamingStatsPage = ({ onBack }: StreamingStatsPageProps) => {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [serviceType, setServiceType] = useState<'spotify' | 'apple-music' | null>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [timeRange, setTimeRange] = useState<SpotifyTimeRange>('medium_term');

  useEffect(() => {
    if (user) loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Detect service type from users.music_streaming_profile (Spotify sets this)
      const { data: userData } = await supabase
        .from('users')
        .select('music_streaming_profile')
        .eq('user_id', user.id)
        .single();

      const profileUrl = userData?.music_streaming_profile || null;
      let detectedType: 'spotify' | 'apple-music' | null = null;

      if (profileUrl?.includes('spotify')) {
        detectedType = 'spotify';
      } else {
        // Check for Apple Music via streaming_profiles row or active MusicKit session
        const { data: amRow } = await supabase
          .from('streaming_profiles')
          .select('profile_data')
          .eq('user_id', user.id)
          .eq('service_type', 'apple-music')
          .maybeSingle();

        if (amRow) {
          detectedType = 'apple-music';
        } else if (appleMusicService.checkStoredToken()) {
          detectedType = 'apple-music';
        }
      }

      if (!detectedType) {
        setNeedsConnection(true);
        return;
      }

      if (detectedType === 'spotify') {
        await spotifyService.ensureSession();
      }

      setServiceType(detectedType);

      // 2. Load stored profile data from streaming_profiles
      const { data: row } = await supabase
        .from('streaming_profiles')
        .select('profile_data, last_updated')
        .eq('user_id', user.id)
        .eq('service_type', detectedType)
        .maybeSingle();

      if (row?.profile_data) {
        setProfileData(row.profile_data);
        setLastSynced(row.last_updated);
      } else {
        setProfileData(null);
      }

      setNeedsConnection(false);
    } catch (err) {
      console.error('Error loading streaming profile:', err);
      setNeedsConnection(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (!serviceType) return;
    setSyncing(true);
    try {
      if (serviceType === 'spotify') {
        const sessionOk = await spotifyService.ensureSession();
        if (!sessionOk) {
          if (profileData) {
            toast({
              title: 'Connect Spotify to refresh',
              description: 'Reconnect to Spotify to refresh your streaming stats.',
            });
            return;
          }
          setNeedsConnection(true);
          return;
        }
        await spotifyService.syncUserMusicPreferences();
      } else {
        if (!appleMusicService.checkStoredToken()) {
          setNeedsConnection(true);
          return;
        }
        const data = await appleMusicService.generateProfileData();
        if (data) await appleMusicService.uploadProfileData(data);
      }
      await loadProfile();
      toast({ title: 'Stats updated', description: 'Your streaming data has been refreshed.' });
    } catch (err) {
      console.error('Sync error:', err);
      toast({
        title: 'Sync failed',
        description: 'Could not refresh stats. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleConnectSpotify = async () => {
    try {
      if (!spotifyService.isConfigured()) {
        toast({
          title: 'Spotify not available',
          description: 'Spotify is not configured for this build.',
          variant: 'destructive',
        });
        return;
      }
      localStorage.setItem('spotify_connect_source', 'streaming_stats');
      await spotifyService.authenticate();
    } catch (err) {
      console.error('Spotify connect error:', err);
      toast({
        title: 'Connection failed',
        description: 'Could not connect to Spotify. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleConnectAppleMusic = async () => {
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
    // Spotify: use time-range-specific list if available
    if (serviceType === 'spotify' && profileData.topArtistsByTimeRange?.[timeRange]) {
      return profileData.topArtistsByTimeRange[timeRange].slice(0, 20);
    }
    return (profileData.topArtists || []).slice(0, 20);
  }, [profileData, timeRange, serviceType]);

  const displayTracks = useMemo<any[]>(() => {
    if (!profileData) return [];
    return (profileData.topTracks || []).slice(0, 20);
  }, [profileData]);

  const recentlyPlayed = useMemo<any[]>(() => {
    if (!profileData?.recentlyPlayed) return [];
    return profileData.recentlyPlayed.slice(0, 15);
  }, [profileData]);

  const genres = useMemo<{ name: string; count: number; pct: number }[]>(() => {
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

  const statsOverview = useMemo(() => {
    // Estimate listening time from recently played (sum of track duration_ms)
    const totalMs = recentlyPlayed.reduce((sum: number, item: any) => {
      return sum + (item.track?.duration_ms || item.duration_ms || 0);
    }, 0);
    const listeningHours = totalMs > 0 ? Math.round(totalMs / 3_600_000) : null;
    return {
      artistCount: displayArtists.length,
      trackCount: displayTracks.length,
      listeningHours,
      genreCount: genres.length,
    };
  }, [displayArtists, displayTracks, recentlyPlayed, genres]);

  const isSpotify = serviceType === 'spotify';
  const accentColor = isSpotify ? '#1DB954' : '#FC3C44';
  const serviceName = isSpotify ? 'Spotify' : 'Apple Music';
  const hasTimeRanges = isSpotify && !!profileData?.topArtistsByTimeRange;

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
      <div className="min-h-screen bg-gradient-to-b from-white to-pink-50/30 px-4 pt-4 pb-24">
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
            Connect your music app to see your top artists, tracks, and listening habits.
          </p>

          <div className="space-y-3">
            <button
              onClick={handleConnectSpotify}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-[#1DB954]/10 hover:bg-[#1DB954]/20 active:scale-[0.98] transition-all text-left"
            >
              <div className="w-12 h-12 bg-[#1DB954] rounded-full flex items-center justify-center flex-shrink-0">
                <Music className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-semibold text-sm">Connect Spotify</p>
                <p className="text-xs text-muted-foreground">Top artists, tracks, and genres</p>
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

        {/* Stat overview pills */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <User className="w-5 h-5 mb-2" style={{ color: accentColor }} />
            <p className="text-2xl font-bold">{statsOverview.artistCount}</p>
            <p className="text-xs text-muted-foreground">Top Artists</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <Music className="w-5 h-5 mb-2" style={{ color: accentColor }} />
            <p className="text-2xl font-bold">{statsOverview.trackCount}</p>
            <p className="text-xs text-muted-foreground">Top Tracks</p>
          </div>
          {statsOverview.listeningHours !== null && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <Clock className="w-5 h-5 mb-2" style={{ color: accentColor }} />
              <p className="text-2xl font-bold">{statsOverview.listeningHours}h</p>
              <p className="text-xs text-muted-foreground">Listening Time</p>
            </div>
          )}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <BarChart3 className="w-5 h-5 mb-2" style={{ color: accentColor }} />
            <p className="text-2xl font-bold">{statsOverview.genreCount}</p>
            <p className="text-xs text-muted-foreground">Genres</p>
          </div>
        </div>

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

        {/* Tabs */}
        {profileData && (
          <Tabs defaultValue="artists">
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="artists">Artists</TabsTrigger>
              <TabsTrigger value="tracks">Tracks</TabsTrigger>
              <TabsTrigger value="genres">Genres</TabsTrigger>
              <TabsTrigger value="recent">Recent</TabsTrigger>
            </TabsList>

            {/* Artists */}
            <TabsContent value="artists" className="mt-3 space-y-2">
              {displayArtists.length === 0 ? (
                <EmptyTab message="No artist data. Tap ↻ to sync." />
              ) : (
                displayArtists.map((artist: any, i: number) => (
                  <ArtistRow key={artist.id || i} artist={artist} rank={i + 1} accentColor={accentColor} />
                ))
              )}
            </TabsContent>

            {/* Tracks */}
            <TabsContent value="tracks" className="mt-3 space-y-2">
              {displayTracks.length === 0 ? (
                <EmptyTab message="No track data. Tap ↻ to sync." />
              ) : (
                displayTracks.map((track: any, i: number) => (
                  <TrackRow key={track.id || i} track={track} rank={i + 1} accentColor={accentColor} />
                ))
              )}
            </TabsContent>

            {/* Genres */}
            <TabsContent value="genres" className="mt-3 space-y-2">
              {genres.length === 0 ? (
                <EmptyTab message="Genres are derived from your top artists. Tap ↻ to sync." />
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

            {/* Recently Played */}
            <TabsContent value="recent" className="mt-3 space-y-2">
              {recentlyPlayed.length === 0 ? (
                <EmptyTab message="No recently played data. Tap ↻ to sync." />
              ) : (
                recentlyPlayed.map((item: any, i: number) => {
                  const track = item.track || item;
                  const playedAt = item.played_at;
                  const artistName =
                    track.artists?.[0]?.name || track.artist || 'Unknown Artist';
                  const imageUrl =
                    track.album?.images?.[0]?.url ||
                    track.album?.images?.[1]?.url;

                  return (
                    <div
                      key={i}
                      className="bg-white rounded-xl border border-gray-100 shadow-sm flex items-center gap-3 p-3"
                    >
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={track.name}
                          className="w-11 h-11 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div
                          className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: accentColor + '20' }}
                        >
                          <Music className="w-5 h-5" style={{ color: accentColor }} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{track.name || 'Unknown Track'}</p>
                        <p className="text-xs text-muted-foreground truncate">{artistName}</p>
                      </div>
                      {playedAt && (
                        <p className="text-xs text-muted-foreground flex-shrink-0 pl-2">
                          {formatDistanceToNow(new Date(playedAt), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                  );
                })
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
