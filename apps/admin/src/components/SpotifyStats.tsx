import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { spotifyService } from '@/services/spotifyService';
import { useToast } from '@/hooks/use-toast';
import {
  SpotifyUser,
  SpotifyTrack,
  SpotifyArtist,
  SpotifyPlayHistoryObject,
  SpotifyTimeRange,
  SpotifyListeningStats
} from '@/types/spotify';

interface SpotifyStatsProps {
  className?: string;
}

export const SpotifyStats = ({ className }: SpotifyStatsProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [userProfile, setUserProfile] = useState<SpotifyUser | null>(null);
  const [topTracks, setTopTracks] = useState<SpotifyTrack[]>([]);
  const [topArtists, setTopArtists] = useState<SpotifyArtist[]>([]);
  const [recentTracks, setRecentTracks] = useState<SpotifyPlayHistoryObject[]>([]);
  const [listeningStats, setListeningStats] = useState<SpotifyListeningStats | null>(null);
  const [currentPeriod, setCurrentPeriod] = useState<SpotifyTimeRange>('short_term');
  const { toast } = useToast();

  useEffect(() => {
    initializeSpotify();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadStats();
    }
  }, [isAuthenticated, currentPeriod]);

  const initializeSpotify = async () => {
    try {
      // Check for callback
      const hasCallback = await spotifyService.handleAuthCallback();
      if (hasCallback) {
        setIsAuthenticated(true);
        await loadUserProfile();
        return;
      }

      // Check for stored token
      const hasStoredToken = spotifyService.checkStoredToken();
      if (hasStoredToken) {
        setIsAuthenticated(true);
        await loadUserProfile();
      }
    } catch (error) {
      console.error('Spotify initialization error:', error);
      toast({
        title: "Spotify Connection Error",
        description: "Failed to connect to Spotify. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = () => {
    // Check if Spotify is configured before attempting authentication
    if (!spotifyService.isConfigured()) {
      toast({
        title: "Spotify Not Configured",
        description: "Spotify integration is not available. This feature is optional and doesn't affect core functionality.",
        variant: "default",
      });
      return;
    }

    setAuthenticating(true);
    try {
      spotifyService.authenticate();
    } catch (error) {
      console.error('Authentication error:', error);
      setAuthenticating(false);
      toast({
        title: "Authentication Error",
        description: error instanceof Error ? error.message : "Failed to start Spotify authentication.",
        variant: "destructive",
      });
    }
  };

  const handleLogout = () => {
    spotifyService.logout();
    setIsAuthenticated(false);
    setUserProfile(null);
    setTopTracks([]);
    setTopArtists([]);
    setRecentTracks([]);
    setListeningStats(null);
    
    toast({
      title: "Disconnected",
      description: "Successfully disconnected from Spotify.",
    });
  };

  const loadUserProfile = async () => {
    try {
      const profile = await spotifyService.getUserProfile();
      setUserProfile(profile);
    } catch (error) {
      console.error('Error loading user profile:', error);
      toast({
        title: "Profile Error",
        description: "Failed to load Spotify profile.",
        variant: "destructive",
      });
    }
  };

  const loadStats = async () => {
    try {
      setLoading(true);
      const [topTracksResponse, topArtistsResponse, recentlyPlayedResponse] = await Promise.all([
        spotifyService.getTopTracks(currentPeriod, 20),
        spotifyService.getTopArtists(currentPeriod, 20),
        spotifyService.getRecentlyPlayed(20)
      ]);

      setTopTracks(topTracksResponse.items);
      setTopArtists(topArtistsResponse.items);
      setRecentTracks(recentlyPlayedResponse.items);

      // Calculate listening stats
      const stats = spotifyService.calculateListeningStats(
        topTracksResponse.items,
        topArtistsResponse.items
      );
      setListeningStats(stats);

    } catch (error) {
      console.error('Error loading stats:', error);
      toast({
        title: "Stats Error",
        description: "Failed to load Spotify statistics.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const switchTimePeriod = (period: SpotifyTimeRange) => {
    setCurrentPeriod(period);
  };

  const getPeriodLabel = (period: SpotifyTimeRange) => {
    switch (period) {
      case 'short_term': return 'Last Month';
      case 'medium_term': return 'Last 6 Months';
      case 'long_term': return 'All Time';
    }
  };

  if (loading && !isAuthenticated) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading Spotify connection...</p>
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
            <Music className="w-5 h-5 text-green-600" />
            Spotify Music Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Music className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Connect Your Spotify</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Connect your Spotify account to see your listening stats, top tracks, and favorite artists.
            </p>
            <Button 
              onClick={handleConnect}
              disabled={authenticating}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {authenticating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Connecting...
                </>
              ) : (
                <>
                  <Music className="w-4 h-4 mr-2" />
                  Connect to Spotify
                </>
              )}
            </Button>
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
            <Music className="w-5 h-5 text-green-600" />
            Spotify Music Stats
          </CardTitle>
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
      </CardHeader>
      <CardContent className="space-y-6">
        {/* User Profile Section */}
        {userProfile && (
          <div className="flex items-center gap-4 p-4 rounded-lg bg-green-50 border border-green-200">
            <Avatar className="w-12 h-12">
              <AvatarImage src={userProfile.images[0]?.url} />
              <AvatarFallback className="bg-green-600 text-white">
                <User className="w-6 h-6" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h3 className="font-semibold text-green-900">
                {userProfile.display_name || 'Spotify User'}
              </h3>
              <p className="text-sm text-green-700">
                {userProfile.followers.total.toLocaleString()} followers
              </p>
            </div>
            <a
              href={userProfile.external_urls.spotify}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-600 hover:text-green-700"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        )}

        {/* Time Period Controls */}
        <div className="flex gap-2 p-1 bg-muted rounded-lg">
          {(['short_term', 'medium_term', 'long_term'] as SpotifyTimeRange[]).map((period) => (
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
                Top Tracks
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
                Est. Time
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
              <div className="text-2xl font-bold text-primary">{listeningStats.avgPopularity}%</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Avg Popular
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="tracks">Top Tracks</TabsTrigger>
            <TabsTrigger value="artists">Top Artists</TabsTrigger>
            <TabsTrigger value="recent">Recent</TabsTrigger>
          </TabsList>

          <TabsContent value="tracks" className="mt-4">
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">Loading tracks...</p>
                </div>
              ) : topTracks.length === 0 ? (
                <div className="text-center py-8">
                  <Music className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No tracks found</p>
                </div>
              ) : (
                topTracks.map((track, index) => (
                  <div key={track.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <span className="text-sm font-medium text-muted-foreground w-6 text-center">
                      {index + 1}
                    </span>
                    <div className="w-12 h-12 rounded overflow-hidden bg-muted flex-shrink-0">
                      {track.album.images[2]?.url ? (
                        <img 
                          src={track.album.images[2].url} 
                          alt={track.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{track.name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {track.artists.map(a => a.name).join(', ')}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {track.album.name}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {track.popularity}%
                    </Badge>
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
                      {artist.images[2]?.url ? (
                        <img 
                          src={artist.images[2].url} 
                          alt={artist.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <User className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{artist.name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {artist.genres.slice(0, 3).join(', ')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {artist.followers.total.toLocaleString()} followers
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {artist.popularity}%
                    </Badge>
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
                  const track = item.track;
                  const playedAt = new Date(item.played_at);
                  return (
                    <div key={`${track.id}-${item.played_at}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="w-12 h-12 rounded overflow-hidden bg-muted flex-shrink-0">
                        {track.album.images[2]?.url ? (
                          <img 
                            src={track.album.images[2].url} 
                            alt={track.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Music className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{track.name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {track.artists.map(a => a.name).join(', ')}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {spotifyService.formatDate(playedAt)}
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
                <Badge key={genre} variant="outline" className="text-xs">
                  {genre}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
