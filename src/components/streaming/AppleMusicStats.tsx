import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Music, 
  ExternalLink, 
  LogOut, 
  Clock, 
  TrendingUp, 
  User,
  Headphones,
  Calendar,
  Star,
  Users,
  Disc,
  Activity
} from 'lucide-react';
import { appleMusicService } from '@/services/appleMusicService';
import { useAuth } from '@/hooks/useAuth';
import {
  AppleMusicSong,
  AppleMusicArtist,
  AppleMusicAlbum,
  AppleMusicPlayHistoryObject,
  AppleMusicTimeRange,
  AppleMusicListeningStats,
  AppleMusicStorefront
} from '@/types/appleMusic';

interface AppleMusicStatsProps {
  className?: string;
}

export const AppleMusicStats = ({ className }: AppleMusicStatsProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [userStorefront, setUserStorefront] = useState<AppleMusicStorefront | null>(null);
  const [topTracks, setTopTracks] = useState<AppleMusicSong[]>([]);
  const [topArtists, setTopArtists] = useState<AppleMusicArtist[]>([]);
  const [topAlbums, setTopAlbums] = useState<AppleMusicAlbum[]>([]);
  const [recentTracks, setRecentTracks] = useState<AppleMusicPlayHistoryObject[]>([]);
  const [listeningStats, setListeningStats] = useState<AppleMusicListeningStats | null>(null);
  const [currentPeriod, setCurrentPeriod] = useState<AppleMusicTimeRange>('last-week');
  const [connectError, setConnectError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
const { user } = useAuth();

  useEffect(() => {
    initializeAppleMusic();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadStats();
    }
  }, [isAuthenticated, currentPeriod]);

  const initializeAppleMusic = async () => {
    try {
      // Check for stored token
      const hasStoredToken = appleMusicService.checkStoredToken();
      if (hasStoredToken) {
        setIsAuthenticated(true);
        await loadUserProfile();
      }
    } catch (error) {
      console.error('Apple Music initialization error:', error);
      } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnectError(null);
    setAuthenticating(true);

    try {
      await appleMusicService.authenticate();

      if (!appleMusicService.checkStoredToken()) {
        throw new Error('Apple Music did not finish authenticating. Please try again.');
      }

      setIsAuthenticated(true);
      await loadUserProfile();
    } catch (error) {
      console.error('Apple Music authentication error:', error);
      const message = error instanceof Error ? error.message : 'Unable to connect to Apple Music right now.';
      setConnectError(message);
    } finally {
      setAuthenticating(false);
    }
  };

  const handleLogout = () => {
    appleMusicService.logout();
    setIsAuthenticated(false);
    setUserStorefront(null);
    setTopTracks([]);
    setTopArtists([]);
    setTopAlbums([]);
    setRecentTracks([]);
    setListeningStats(null);
    setConnectError(null);
    setRefreshError(null);
    
    };

  const loadUserProfile = async () => {
    if (!isAuthenticated && !appleMusicService.checkStoredToken()) {
      return;
    }

    try {
      const storefront = await appleMusicService.getUserStorefront();
      setUserStorefront(storefront);
    } catch (error) {
      console.error('Error loading user profile:', error);
      }
  };

  const loadStats = async () => {
    const hasSession = isAuthenticated || appleMusicService.checkStoredToken();

    if (!hasSession) {
      setIsAuthenticated(false);
      return;
    }

    try {
      setLoading(true);
      setRefreshError(null);

      const [songsResponse, artistsResponse, albumsResponse, recentResponse] = await Promise.allSettled([
        appleMusicService.getLibrarySongs(50),
        appleMusicService.getLibraryArtists(50),
        appleMusicService.getLibraryAlbums(50),
        appleMusicService.getRecentlyPlayed(30)
      ]);

      const songsSuccess = songsResponse.status === 'fulfilled';
      const artistsSuccess = artistsResponse.status === 'fulfilled';
      const albumsSuccess = albumsResponse.status === 'fulfilled';
      const recentSuccess = recentResponse.status === 'fulfilled';

      const newTopTracks = songsSuccess
        ? appleMusicService.processLibraryData(songsResponse.value.data, currentPeriod).slice(0, 20)
        : topTracks;
      const newTopArtists = artistsSuccess
        ? appleMusicService.processLibraryData(artistsResponse.value.data, currentPeriod).slice(0, 20)
        : topArtists;
      const newTopAlbums = albumsSuccess
        ? appleMusicService.processLibraryData(albumsResponse.value.data, currentPeriod).slice(0, 20)
        : topAlbums;
      const newRecentTracks = recentSuccess ? recentResponse.value.data || [] : recentTracks;

      if (songsSuccess) {
        setTopTracks(newTopTracks);
      }
      if (artistsSuccess) {
        setTopArtists(newTopArtists);
      }
      if (albumsSuccess) {
        setTopAlbums(newTopAlbums);
      }
      if (recentSuccess) {
        setRecentTracks(newRecentTracks);
      }

      const finalSongs = songsSuccess ? newTopTracks : topTracks;
      const finalArtists = artistsSuccess ? newTopArtists : topArtists;
      const stats = appleMusicService.calculateListeningStats(finalSongs, finalArtists);
      setListeningStats(stats);

      const failedSections: string[] = [];
      if (!songsSuccess) failedSections.push('songs');
      if (!artistsSuccess) failedSections.push('artists');
      if (!albumsSuccess) failedSections.push('albums');
      if (!recentSuccess) failedSections.push('recent tracks');

      if (failedSections.length > 0) {
        setRefreshError(`Unable to refresh ${failedSections.join(', ')}. Showing last known data.`);
      } else {
        setRefreshError(null);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
      setRefreshError('Unable to refresh Apple Music stats right now.');
    } finally {
      setLoading(false);
    }
  };

  const switchTimePeriod = (period: AppleMusicTimeRange) => {
    setCurrentPeriod(period);
  };

  const getPeriodLabel = (period: AppleMusicTimeRange) => {
    switch (period) {
      case 'last-week': return 'Last Week';
      case 'last-month': return 'Last Month';
      case 'last-6-months': return 'Last 6 Months';
    }
  };

  if (loading && !isAuthenticated) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading Apple Music connection...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isAuthenticated) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="w-5 h-5 var(--status-error-500)" />
            Apple Music Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Music className="w-8 h-8 var(--neutral-0)" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Connect Your Apple Music</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Connect your Apple Music account to see your library stats, top tracks, and favorite artists.
            </p>
            <Button 
              onClick={handleConnect}
              disabled={authenticating}
              className="bg-red-500 hover:bg-red-600 var(--neutral-0)"
            >
              {authenticating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Connecting...
                </>
              ) : (
                <>
                  <Music className="w-4 h-4 mr-2" />
                  Connect to Apple Music
                </>
              )}
            </Button>
            {connectError && (
              <p className="text-sm var(--status-error-500) mt-3">
                {connectError}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Music className="w-5 h-5 var(--status-error-500)" />
            Apple Music Stats
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadStats}
              disabled={loading}
              className="text-muted-foreground hover:text-foreground"
            >
              <Activity className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleLogout}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Disconnect
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {refreshError && (
          <p className="text-sm var(--status-error-500)">
            {refreshError}
          </p>
        )}
        {/* User Profile Section */}
        {userStorefront && (
          <div className="flex items-center gap-4 p-4 rounded-lg bg-red-50 border border-red-200">
            <Avatar className="w-12 h-12">
              <AvatarFallback className="bg-red-500 var(--neutral-0)">
                <User className="w-6 h-6" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h3 className="font-semibold text-red-900">
                Apple Music User
              </h3>
              <p className="text-sm text-red-700">
                Region: {userStorefront.attributes.name}
              </p>
            </div>
          </div>
        )}

        {/* Time Period Controls */}
        <div className="flex gap-2 p-1 bg-muted rounded-lg">
          {(['last-week', 'last-month', 'last-6-months'] as AppleMusicTimeRange[]).map((period) => (
            <Button
              key={period}
              variant={currentPeriod === period ? 'default' : 'ghost'}
              size="sm"
              onClick={() => switchTimePeriod(period)}
              className="flex-1"
            >
              {getPeriodLabel(period)}
            </Button>
          ))}
        </div>

        {/* Stats Overview */}
        {listeningStats && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">{listeningStats.totalTracks}</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Headphones className="w-3 h-3" />
                Library Songs
              </div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">{listeningStats.uniqueArtists}</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Users className="w-3 h-3" />
                Artists
              </div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">{listeningStats.totalHours}h</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Clock className="w-3 h-3" />
                Est. Duration
              </div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">{listeningStats.uniqueAlbums}</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Disc className="w-3 h-3" />
                Albums
              </div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">{Math.round(listeningStats.avgDuration / 60)}m</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Avg Duration
              </div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">{listeningStats.topGenres.length}</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Star className="w-3 h-3" />
                Top Genres
              </div>
            </div>
          </div>
        )}

        {/* Detailed Stats Tabs */}
        <Tabs defaultValue="tracks" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="tracks">Songs</TabsTrigger>
            <TabsTrigger value="artists">Artists</TabsTrigger>
            <TabsTrigger value="albums">Albums</TabsTrigger>
            <TabsTrigger value="recent">Recent</TabsTrigger>
          </TabsList>

          <TabsContent value="tracks" className="mt-4">
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">Loading songs...</p>
                </div>
              ) : topTracks.length === 0 ? (
                <div className="text-center py-8">
                  <Music className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No songs found</p>
                </div>
              ) : (
                topTracks.map((track, index) => (
                  <div key={track.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <span className="text-sm font-medium text-muted-foreground w-6 text-center">
                      {index + 1}
                    </span>
                    <div className="w-12 h-12 rounded overflow-hidden bg-muted flex-shrink-0">
                      {track.attributes.artwork ? (
                        <img 
                          src={appleMusicService.getArtworkUrl(track.attributes.artwork, 50, 50)} 
                          alt={track.attributes.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{track.attributes.name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {track.attributes.artistName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {track.attributes.albumName}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {appleMusicService.formatDuration(track.attributes.durationInMillis)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="artists" className="mt-4">
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">Loading artists...</p>
                </div>
              ) : topArtists.length === 0 ? (
                <div className="text-center py-8">
                  <User className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No artists found</p>
                </div>
              ) : (
                topArtists.map((artist, index) => (
                  <div key={artist.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <span className="text-sm font-medium text-muted-foreground w-6 text-center">
                      {index + 1}
                    </span>
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-muted flex-shrink-0">
                      {artist.attributes.artwork ? (
                        <img 
                          src={appleMusicService.getArtworkUrl(artist.attributes.artwork, 50, 50)} 
                          alt={artist.attributes.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <User className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{artist.attributes.name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {artist.attributes.genreNames?.slice(0, 3).join(', ') || 'Unknown'}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="albums" className="mt-4">
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">Loading albums...</p>
                </div>
              ) : topAlbums.length === 0 ? (
                <div className="text-center py-8">
                  <Disc className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No albums found</p>
                </div>
              ) : (
                topAlbums.map((album, index) => (
                  <div key={album.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <span className="text-sm font-medium text-muted-foreground w-6 text-center">
                      {index + 1}
                    </span>
                    <div className="w-12 h-12 rounded overflow-hidden bg-muted flex-shrink-0">
                      {album.attributes.artwork ? (
                        <img 
                          src={appleMusicService.getArtworkUrl(album.attributes.artwork, 50, 50)} 
                          alt={album.attributes.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Disc className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{album.attributes.name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {album.attributes.artistName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {album.attributes.releaseDate ? new Date(album.attributes.releaseDate).getFullYear() : ''}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {album.attributes.trackCount || 0} tracks
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="recent" className="mt-4">
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">Loading recent tracks...</p>
                </div>
              ) : recentTracks.length === 0 ? (
                <div className="text-center py-8">
                  <Activity className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No recent tracks found</p>
                </div>
              ) : (
                recentTracks.map((item, index) => {
                  const playedAt = item.meta?.playedAt ? new Date(item.meta.playedAt) : new Date();
                  return (
                    <div key={`${item.id}-${index}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="w-12 h-12 rounded overflow-hidden bg-muted flex-shrink-0">
                        {item.attributes.artwork ? (
                          <img 
                            src={appleMusicService.getArtworkUrl(item.attributes.artwork, 50, 50)} 
                            alt={item.attributes.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Music className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.attributes.name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {item.attributes.artistName}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {appleMusicService.formatDate(playedAt)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Top Genres */}
        {listeningStats && listeningStats.topGenres.length > 0 && (
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Star className="w-4 h-4" />
              Top Genres
            </h4>
            <div className="flex flex-wrap gap-2">
              {listeningStats.topGenres.map((genre) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', height: '25px', padding: '0 var(--spacing-small, 12px)', gap: 'var(--spacing-inline, 6px)', backgroundColor: 'var(--brand-pink-050)', color: 'var(--brand-pink-500)', border: '2px solid var(--brand-pink-500)', borderRadius: '999px', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>
                  {genre}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
