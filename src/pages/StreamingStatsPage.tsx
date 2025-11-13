import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, 
  Music, 
  TrendingUp, 
  Clock, 
  Headphones, 
  Disc, 
  RefreshCw,
  User,
  BarChart3,
  PlayCircle,
  ExternalLink,
  LogIn
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { UserStreamingStatsService, type UserStreamingStatsSummary, type TimeRange } from '@/services/userStreamingStatsService';
import { spotifyService } from '@/services/spotifyService';
import { appleMusicService } from '@/services/appleMusicService';
import { detectStreamingServiceType } from '@/components/streaming/UnifiedStreamingStats';
import { format } from 'date-fns';

export const StreamingStatsPage = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [streamingProfile, setStreamingProfile] = useState<string | null>(null);
  const [stats, setStats] = useState<UserStreamingStatsSummary | null>(null);
  const [serviceType, setServiceType] = useState<'spotify' | 'apple-music' | 'unknown'>('unknown');
  const [needsConnection, setNeedsConnection] = useState(false);
  const [hasCheckedStats, setHasCheckedStats] = useState(false);
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>('all_time');
  const [availableTimeRanges, setAvailableTimeRanges] = useState<TimeRange[]>([]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    
    if (!user) {
      window.location.href = '/';
      return;
    }
    
    loadUserProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;

    if (streamingProfile !== null) {
      // Profile loaded - detect service type and load stats
      const detected = detectStreamingServiceType(streamingProfile);
      const newServiceType = detected === 'spotify' ? 'spotify' : detected === 'apple-music' ? 'apple-music' : 'unknown';
      setServiceType(newServiceType);
      if (newServiceType !== 'unknown') {
        loadStats(selectedTimeRange);
      } else {
        setLoading(false);
        setNeedsConnection(true);
      }
    } else if (streamingProfile === null && !hasCheckedStats && !loading) {
      // No profile link - check if user has stats in database (only once, after loading is done)
      setHasCheckedStats(true);
      checkForExistingStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamingProfile, user]);

  // Note: Time range changes are handled by onClick in the time range buttons
  // This ensures stats are loaded when the component first mounts with a time range

  const checkForExistingStats = async () => {
    if (!user) return;
    try {
      setLoading(true);
      // Check both services in parallel, defaulting to 'all_time'
      const [spotifyStats, appleStats] = await Promise.all([
        UserStreamingStatsService.getStats(user.id, 'spotify', 'all_time'),
        UserStreamingStatsService.getStats(user.id, 'apple-music', 'all_time')
      ]);
      
      // Check available time ranges for the service that has stats
      if (spotifyStats) {
        setServiceType('spotify');
        setStats(spotifyStats);
        const ranges = await UserStreamingStatsService.getAllTimeRanges(user.id, 'spotify');
        setAvailableTimeRanges(ranges.length > 0 ? ranges : ['all_time']);
        setSelectedTimeRange(ranges.includes('all_time') ? 'all_time' : ranges[0] || 'all_time');
        setLoading(false);
      } else if (appleStats) {
        setServiceType('apple-music');
        setStats(appleStats);
        const ranges = await UserStreamingStatsService.getAllTimeRanges(user.id, 'apple-music');
        setAvailableTimeRanges(ranges.length > 0 ? ranges : ['all_time']);
        setSelectedTimeRange(ranges.includes('all_time') ? 'all_time' : ranges[0] || 'all_time');
        setLoading(false);
      } else {
        setLoading(false);
        setNeedsConnection(true);
      }
    } catch (error) {
      // Error already handled in getStats, just set loading state
      setLoading(false);
      setNeedsConnection(true);
    }
  };

  const loadUserProfile = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('music_streaming_profile')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading profile:', error);
        setStreamingProfile(null);
        setLoading(false);
        setNeedsConnection(true);
        return;
      }

      const profile = data?.music_streaming_profile || null;
      setStreamingProfile(profile);
      // Loading state will be managed by loadStats or checkForExistingStats
    } catch (error) {
      console.error('Error in loadUserProfile:', error);
      setStreamingProfile(null);
      setLoading(false);
      setNeedsConnection(true);
    }
  };

  const loadStats = async (timeRange?: TimeRange) => {
    if (!user || serviceType === 'unknown') {
      setLoading(false);
      setNeedsConnection(true);
      return;
    }

    try {
      setLoading(true);
      const rangeToLoad = timeRange || selectedTimeRange;
      const statsData = await UserStreamingStatsService.getStats(
        user.id,
        serviceType as 'spotify' | 'apple-music',
        rangeToLoad
      );
      
      if (statsData) {
        setStats(statsData);
        setNeedsConnection(false);
        
        // Update available time ranges
        const ranges = await UserStreamingStatsService.getAllTimeRanges(
          user.id,
          serviceType as 'spotify' | 'apple-music'
        );
        setAvailableTimeRanges(ranges.length > 0 ? ranges : ['all_time']);
      } else {
        // No stats found for this time range - try all_time as fallback
        if (rangeToLoad !== 'all_time') {
          const fallbackStats = await UserStreamingStatsService.getStats(
            user.id,
            serviceType as 'spotify' | 'apple-music',
            'all_time'
          );
          if (fallbackStats) {
            setStats(fallbackStats);
            setSelectedTimeRange('all_time');
            setNeedsConnection(false);
            return;
          }
        }
        
        // No stats found - check if user needs to connect
        if (serviceType === 'spotify' && !spotifyService.isAuthenticated()) {
          setNeedsConnection(true);
        } else if (serviceType === 'apple-music' && !appleMusicService.checkStoredToken()) {
          setNeedsConnection(true);
        } else {
          // Service is connected but no stats yet - show connection screen to sync
          setNeedsConnection(true);
        }
      }
    } catch (error) {
      // Error already handled in getStats
      setNeedsConnection(true);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectSpotify = async () => {
    try {
      if (!spotifyService.isConfigured()) {
        toast({
          title: "Spotify Not Configured",
          description: "Spotify integration is not available.",
          variant: "destructive",
        });
        return;
      }
      await spotifyService.authenticate();
    } catch (error) {
      console.error('Error connecting Spotify:', error);
      toast({
        title: "Connection Failed",
        description: "Failed to connect to Spotify. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleConnectAppleMusic = async () => {
    try {
      setSyncing(true);
      toast({
        title: "Connecting to Apple Music",
        description: "Please authorize in the popup window...",
      });
      
      await appleMusicService.authenticate();
      
      // Wait for sync to complete (autoSync is called after auth)
      toast({
        title: "Connected!",
        description: "Syncing your Apple Music data... This may take a moment.",
      });
      
      // Give it a moment for the sync to start, then wait a bit
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Trigger manual sync to ensure data is saved
      const profileData = await appleMusicService.generateProfileData();
      if (profileData) {
        await appleMusicService.uploadProfileData(profileData);
      }
      
      // Reload stats after sync
      await loadStats(selectedTimeRange);
      setNeedsConnection(false);
      
      toast({
        title: "Sync Complete",
        description: "Your Apple Music stats have been synced and stored permanently.",
      });
    } catch (error) {
      console.error('Error connecting Apple Music:', error);
      toast({
        title: "Connection Failed",
        description: "Failed to connect to Apple Music. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleSync = async () => {
    if (!user || serviceType === 'unknown') return;

    try {
      setSyncing(true);
      toast({
        title: "Syncing Stats",
        description: "Fetching comprehensive streaming data... This may take a moment.",
      });
      
      if (serviceType === 'spotify') {
        if (!spotifyService.isAuthenticated()) {
          toast({
            title: "Not Connected",
            description: "Please connect your Spotify account first.",
            variant: "destructive",
          });
          setNeedsConnection(true);
          return;
        }
        
        // This will pull ALL data and store for all time ranges
        await spotifyService.syncUserMusicPreferences();
      } else if (serviceType === 'apple-music') {
        if (!appleMusicService.checkStoredToken()) {
          toast({
            title: "Not Connected",
            description: "Please connect your Apple Music account first.",
            variant: "destructive",
          });
          setNeedsConnection(true);
          return;
        }

        const profileData = await appleMusicService.generateProfileData();
        if (profileData) {
          await appleMusicService.uploadProfileData(profileData);
          
          const topArtists = profileData.topArtists || [];
          const topGenres = profileData.topGenres || [];
          
          const statsInsert = {
            user_id: user.id,
            service_type: 'apple-music' as const,
            top_artists: topArtists.map((artist: any) => ({
              name: artist.name || artist.attributes?.name || '',
              popularity: artist.popularity || 0,
              id: artist.id
            })),
            top_genres: topGenres.map((genre: any) => ({
              genre: typeof genre === 'string' ? genre : genre.genre || '',
              count: typeof genre === 'string' ? 1 : genre.count || 1
            })),
            total_tracks: profileData.totalTracks || 0,
            unique_artists: topArtists.length,
            total_listening_hours: profileData.totalListeningHours || 0
          };

          await UserStreamingStatsService.upsertStats(statsInsert);
        }
      }

      // Reload stats after sync
      await loadStats(selectedTimeRange);
      setNeedsConnection(false);

      toast({
        title: "Sync Complete",
        description: "Your comprehensive streaming stats have been updated and stored permanently.",
      });
    } catch (error) {
      console.error('Error syncing stats:', error);
      toast({
        title: "Sync Failed",
        description: "Failed to sync streaming stats. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-beige-50 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading streaming stats...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-beige-50 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <p className="text-muted-foreground">Please log in to view streaming stats.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show connection screen if no service connected
  if (needsConnection && !stats) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-beige-50 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center mb-6">
            <Button
              variant="ghost"
              onClick={() => {
                console.log('🎵 StreamingStatsPage: Back button clicked');
                window.location.href = '/';
                localStorage.setItem('intendedView', 'profile');
              }}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Profile
            </Button>
          </div>

          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Music className="w-6 h-6 text-pink-500" />
                Connect Your Streaming Service
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center py-12 space-y-6">
              <div className="w-20 h-20 bg-pink-100 rounded-full flex items-center justify-center mx-auto">
                <Music className="w-10 h-10 text-pink-500" />
              </div>
              <h3 className="text-xl font-semibold">Connect Your Music</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Connect your Spotify or Apple Music account to view your comprehensive streaming statistics and personalize your feed.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                <Card className="border-2 hover:border-green-500 transition-colors cursor-pointer" onClick={handleConnectSpotify}>
                  <CardContent className="pt-6">
                    <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Music className="w-6 h-6 text-white" />
                    </div>
                    <h4 className="font-semibold mb-2">Connect Spotify</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      View your top artists, tracks, and listening habits
                    </p>
                    <Button className="w-full bg-green-500 hover:bg-green-600">
                      <LogIn className="w-4 h-4 mr-2" />
                      Connect Spotify
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-2 hover:border-red-500 transition-colors cursor-pointer" onClick={handleConnectAppleMusic}>
                  <CardContent className="pt-6">
                    <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Music className="w-6 h-6 text-white" />
                    </div>
                    <h4 className="font-semibold mb-2">Connect Apple Music</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Sync your library and listening history
                    </p>
                    <Button className="w-full bg-red-500 hover:bg-red-600">
                      <LogIn className="w-4 h-4 mr-2" />
                      Connect Apple Music
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Show stats if we have them, or if service is detected
  if (stats || serviceType !== 'unknown') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-beige-50 p-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <Button
              variant="ghost"
              onClick={() => {
                window.location.href = '/';
                localStorage.setItem('intendedView', 'profile');
              }}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="flex items-center gap-3">
              {syncing && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="w-4 h-4 animate-spin text-pink-500" />
                  <span>Syncing your stats...</span>
                </div>
              )}
              <Button
                onClick={handleSync}
                disabled={syncing}
                variant="outline"
                className="bg-pink-50 hover:bg-pink-100 border-pink-200"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Refresh Stats'}
              </Button>
            </div>
          </div>

          {/* Time Range Selector */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold mb-1">Time Period</h3>
                  {stats?.last_updated && (
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-pink-600">Last synced:</span>{' '}
                      {format(new Date(stats.last_updated), 'MMM d, yyyy h:mm a')}
                      <span className="ml-2 text-xs text-muted-foreground">
                        (Data is permanently stored)
                      </span>
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(['last_day', 'last_week', 'last_month', 'last_3_months', 'last_6_months', 'last_year', 'last_3_years', 'last_5_years', 'all_time'] as TimeRange[]).map((range) => {
                  // All ranges are available if we have any stats (we filter client-side)
                  const isAvailable = stats !== null;
                  const isSelected = selectedTimeRange === range;
                  return (
                    <Button
                      key={range}
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      disabled={!isAvailable}
                      onClick={() => {
                        setSelectedTimeRange(range);
                        loadStats(range);
                      }}
                      className={
                        isSelected
                          ? "bg-pink-500 hover:bg-pink-600 text-white"
                          : isAvailable
                          ? "hover:bg-pink-50"
                          : "opacity-50 cursor-not-allowed"
                      }
                    >
                      {range === 'last_day' && 'Day'}
                      {range === 'last_week' && 'Week'}
                      {range === 'last_month' && 'Month'}
                      {range === 'last_3_months' && '3 Months'}
                      {range === 'last_6_months' && '6 Months'}
                      {range === 'last_year' && 'Year'}
                      {range === 'last_3_years' && '3 Years'}
                      {range === 'last_5_years' && '5 Years'}
                      {range === 'all_time' && 'All Time'}
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Hero Section */}
          <Card className="mb-6 border-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                    serviceType === 'spotify' ? 'bg-green-500' : 'bg-red-500'
                  }`}>
                    <Music className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-3xl">
                      {serviceType === 'spotify' ? 'Spotify' : 'Apple Music'} Streaming Stats
                    </CardTitle>
                    {stats && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Last updated: {format(new Date(stats.last_updated), 'PPp')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Stats Overview */}
          {stats ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center">
                        <Headphones className="w-6 h-6 text-pink-500" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Tracks</p>
                        <p className="text-3xl font-bold">{stats.total_tracks}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center">
                        <User className="w-6 h-6 text-pink-500" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Unique Artists</p>
                        <p className="text-3xl font-bold">{stats.unique_artists}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center">
                        <Clock className="w-6 h-6 text-pink-500" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Listening Hours</p>
                        <p className="text-3xl font-bold">{Math.round(stats.total_listening_hours)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center">
                        <BarChart3 className="w-6 h-6 text-pink-500" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Top Genres</p>
                        <p className="text-3xl font-bold">{stats.top_genres.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Detailed Stats Tabs */}
              <Tabs defaultValue="artists" className="space-y-4">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="artists">Top Artists</TabsTrigger>
                  <TabsTrigger value="genres">Top Genres</TabsTrigger>
                  <TabsTrigger value="insights">Insights</TabsTrigger>
                </TabsList>

                <TabsContent value="artists" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Your Top Artists</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {stats.top_artists.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {stats.top_artists.slice(0, 20).map((artist, index) => (
                            <div
                              key={artist.id || artist.name}
                              className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                            >
                              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                                {index + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-lg truncate">{artist.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  Popularity: {artist.popularity}/100
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12">
                          <Music className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                          <p className="text-muted-foreground">No artist data available. Sync your stats to see your top artists.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="genres" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Your Top Genres</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {stats.top_genres.length > 0 ? (
                        <div className="space-y-3">
                          {stats.top_genres.map((genre, index) => (
                            <div
                              key={genre.genre}
                              className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 font-bold">
                                  {index + 1}
                                </div>
                                <span className="font-semibold text-lg">{genre.genre}</span>
                              </div>
                              <Badge variant="secondary" className="text-lg px-3 py-1">
                                {genre.count} {genre.count === 1 ? 'artist' : 'artists'}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12">
                          <BarChart3 className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                          <p className="text-muted-foreground">No genre data available. Sync your stats to see your top genres.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="insights" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <TrendingUp className="w-5 h-5" />
                          Listening Activity
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Tracks</p>
                          <p className="text-2xl font-bold">{stats.total_tracks}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Estimated Listening Time</p>
                          <p className="text-2xl font-bold">{Math.round(stats.total_listening_hours)} hours</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Artist Diversity</p>
                          <p className="text-2xl font-bold">{stats.unique_artists} unique artists</p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Disc className="w-5 h-5" />
                          Music Preferences
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">Top Genre</p>
                          {stats.top_genres.length > 0 ? (
                            <Badge variant="default" className="text-lg px-3 py-1">
                              {stats.top_genres[0].genre}
                            </Badge>
                          ) : (
                            <p className="text-muted-foreground">No data</p>
                          )}
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">Top Artist</p>
                          {stats.top_artists.length > 0 ? (
                            <p className="text-lg font-semibold">{stats.top_artists[0].name}</p>
                          ) : (
                            <p className="text-muted-foreground">No data</p>
                          )}
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Genre Diversity</p>
                          <p className="text-2xl font-bold">{stats.top_genres.length} genres</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground mb-4">No stats available yet.</p>
                <Button onClick={handleSync} disabled={syncing}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing...' : 'Sync Your Stats'}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-beige-50 p-4">
      <div className="max-w-7xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => {
            window.location.href = '/';
            localStorage.setItem('intendedView', 'profile');
          }}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Unable to load streaming stats.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
