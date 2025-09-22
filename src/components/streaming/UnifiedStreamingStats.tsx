import React, { useState, useEffect } from 'react';
import { SpotifyStats } from './SpotifyStats';
import { AppleMusicStats } from './AppleMusicStats';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Music, Sync, CheckCircle, AlertCircle } from 'lucide-react';
import { appleMusicService } from '@/services/appleMusicService';
import { useToast } from '@/hooks/use-toast';

interface UnifiedStreamingStatsProps {
  className?: string;
  musicStreamingProfile?: string | null;
}

type StreamingService = 'spotify' | 'apple-music' | 'unknown';
type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export const UnifiedStreamingStats = ({ 
  className, 
  musicStreamingProfile 
}: UnifiedStreamingStatsProps) => {
  const [detectedService, setDetectedService] = useState<StreamingService>('unknown');
  const [showServiceSelector, setShowServiceSelector] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    detectStreamingService();
    checkLastSyncTime();
  }, [musicStreamingProfile]);

  useEffect(() => {
    checkLastSyncTime();
  }, [detectedService]);

  const checkLastSyncTime = () => {
    if (detectedService === 'apple-music') {
      const lastSync = localStorage.getItem('apple-music-last-sync');
      setLastSyncTime(lastSync);
    }
    // Add Spotify sync check here when implemented
  };

  const handleManualSync = async () => {
    if (detectedService !== 'apple-music') {
      toast({
        title: 'Sync Not Available',
        description: 'Manual sync is currently only available for Apple Music.',
        variant: 'destructive',
      });
      return;
    }

    setSyncStatus('syncing');
    
    try {
      const success = await appleMusicService.syncProfileData();
      
      if (success) {
        setSyncStatus('success');
        appleMusicService.markSyncCompleted();
        setLastSyncTime(new Date().toISOString());
        
        toast({
          title: 'Sync Successful',
          description: 'Your Apple Music profile data has been updated.',
        });
        
        // Reset status after 3 seconds
        setTimeout(() => setSyncStatus('idle'), 3000);
      } else {
        throw new Error('Sync failed');
      }
    } catch (error) {
      setSyncStatus('error');
      
      toast({
        title: 'Sync Failed',
        description: 'Failed to sync your Apple Music profile data. Please try again.',
        variant: 'destructive',
      });
      
      // Reset status after 3 seconds
      setTimeout(() => setSyncStatus('idle'), 3000);
    }
  };

  const formatLastSyncTime = (isoString: string | null): string => {
    if (!isoString) return 'Never';
    
    const date = new Date(isoString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)} hours ago`;
    } else {
      return `${Math.floor(diffInHours / 24)} days ago`;
    }
  };

  const getSyncStatusIcon = () => {
    switch (syncStatus) {
      case 'syncing':
        return <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Sync className="w-4 h-4" />;
    }
  };

  const detectStreamingService = (): StreamingService => {
    if (!musicStreamingProfile) {
      setDetectedService('unknown');
      setShowServiceSelector(true);
      return 'unknown';
    }

    const profile = musicStreamingProfile.toLowerCase();
    
    // Check for Spotify indicators
    if (
      profile.includes('spotify.com') ||
      profile.includes('open.spotify') ||
      profile.startsWith('spotify:') ||
      // Check for Spotify user ID patterns (alphanumeric, sometimes with underscores)
      /^[a-zA-Z0-9_]{1,}$/.test(profile)
    ) {
      setDetectedService('spotify');
      setShowServiceSelector(false);
      return 'spotify';
    }
    
    // Check for Apple Music indicators
    if (
      profile.includes('music.apple.com') ||
      profile.includes('apple.com/music') ||
      profile.includes('applemusic') ||
      profile.includes('apple music')
    ) {
      setDetectedService('apple-music');
      setShowServiceSelector(false);
      return 'apple-music';
    }

    // If we can't detect, show selector
    setDetectedService('unknown');
    setShowServiceSelector(true);
    return 'unknown';
  };

  const handleServiceSelection = (service: StreamingService) => {
    setDetectedService(service);
    setShowServiceSelector(false);
  };

  // If no streaming profile is provided and we can't detect
  if (!musicStreamingProfile && detectedService === 'unknown') {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="w-5 h-5" />
            Streaming Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Music className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Streaming Service Connected</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Add your music streaming profile to your account to see your listening stats and connect with others who share your music taste.
            </p>
            <p className="text-sm text-muted-foreground">
              Go to Edit Profile to add your Spotify or Apple Music profile.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show service selector if we couldn't auto-detect
  if (showServiceSelector) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="w-5 h-5" />
            Choose Your Streaming Service
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Music className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Which service do you use?</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              We couldn't automatically detect your streaming service. Please select which one you'd like to connect:
            </p>
            <div className="flex gap-4 justify-center">
              <Button 
                onClick={() => handleServiceSelection('spotify')}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Music className="w-4 h-4 mr-2" />
                Spotify
              </Button>
              <Button 
                onClick={() => handleServiceSelection('apple-music')}
                className="bg-red-500 hover:bg-red-600 text-white"
              >
                <Music className="w-4 h-4 mr-2" />
                Apple Music
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Render the appropriate streaming service component with sync controls
  const renderStreamingComponent = () => {
    switch (detectedService) {
      case 'spotify':
        return <SpotifyStats className={className} />;
      case 'apple-music':
        return (
          <div className="space-y-4">
            {/* Sync Controls */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Music className="w-4 h-4 text-red-500" />
                    Profile Sync
                  </CardTitle>
                  <Badge variant={syncStatus === 'success' ? 'default' : 'secondary'}>
                    Last sync: {formatLastSyncTime(lastSyncTime)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Automatically sync your Apple Music data to keep your profile up to date.
                  </p>
                  <Button
                    onClick={handleManualSync}
                    disabled={syncStatus === 'syncing'}
                    size="sm"
                    variant="outline"
                  >
                    {getSyncStatusIcon()}
                    {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            {/* Apple Music Stats Component */}
            <AppleMusicStats className={className} />
          </div>
        );
      default:
        return (
          <Card className={className}>
            <CardContent className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Detecting streaming service...</p>
              </div>
            </CardContent>
          </Card>
        );
    }
  };

  return renderStreamingComponent();
};

// Export utility function for other components to use
export const detectStreamingServiceType = (profile: string | null | undefined): StreamingService => {
  if (!profile) return 'unknown';

  const profileLower = profile.toLowerCase();
  
  if (
    profileLower.includes('spotify.com') ||
    profileLower.includes('open.spotify') ||
    profileLower.startsWith('spotify:') ||
    /^[a-zA-Z0-9_]{1,}$/.test(profile)
  ) {
    return 'spotify';
  }
  
  if (
    profileLower.includes('music.apple.com') ||
    profileLower.includes('apple.com/music') ||
    profileLower.includes('applemusic') ||
    profileLower.includes('apple music')
  ) {
    return 'apple-music';
  }

  return 'unknown';
};