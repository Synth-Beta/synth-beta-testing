import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Music, RefreshCw, CheckCircle, Loader2, Unlink } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getStreamingLinkStatus } from '@/services/streamingConnectionService';
import type { StreamingLinkStatus } from '@synth/shared';
import { spotifyService } from '@/services/spotifyService';
import { appleMusicService } from '@/services/appleMusicService';
import {
  disconnectStreamingAccount,
  syncStreamingProfile,
} from '@/services/streamingSyncActions';
import { toast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface StreamingAccountSettingsProps {
  onNavigateToStreamingStats?: () => void;
  compact?: boolean;
}

export function StreamingAccountSettings({
  onNavigateToStreamingStats,
  compact = false,
}: StreamingAccountSettingsProps) {
  const { user } = useAuth();
  const [linkStatus, setLinkStatus] = useState<StreamingLinkStatus | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const status = await getStreamingLinkStatus(user.id);
      setLinkStatus(status);

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
  }, [user?.id]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handleConnectSpotify = async () => {
    if (!spotifyService.isConfigured()) {
      toast({
        title: 'Spotify not available',
        description: 'Spotify is not configured for this build.',
        variant: 'destructive',
      });
      return;
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('spotify_connect_source', 'settings');
    }
    await spotifyService.authenticate();
  };

  const handleConnectAppleMusic = async () => {
    try {
      await appleMusicService.authenticate();
      toast({
        title: 'Apple Music connected',
        description: 'Your account is linked. Tap Resync to pull your latest stats.',
      });
      await refreshStatus();
    } catch {
      toast({
        title: 'Apple Music not available',
        description: 'Apple Music linking is not available right now.',
        variant: 'destructive',
      });
    }
  };

  const handleResync = async () => {
    if (!user?.id || !linkStatus?.linked || linkStatus.provider === 'unknown') return;
    setSyncing(true);
    try {
      const result = await syncStreamingProfile(user.id, linkStatus.provider, { manual: true });
      if (result.ok) {
        toast({ title: 'Stats updated', description: 'Your streaming data has been refreshed.' });
        await refreshStatus();
      } else if (result.skipped === 'no-stored-token' || result.skipped === 'no-session') {
        toast({
          title: 'Reconnect to refresh',
          description:
            result.message ||
            'Open Streaming Stats and connect your music app once — then resync will work automatically.',
          variant: 'destructive',
        });
        onNavigateToStreamingStats?.();
      } else {
        toast({
          title: 'Sync failed',
          description: result.message || 'Could not refresh stats. Please try again.',
          variant: 'destructive',
        });
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!user?.id) return;
    const confirmed = window.confirm(
      'Disconnect your streaming account? Your genre preferences stay; stats will stop updating until you connect again.'
    );
    if (!confirmed) return;

    setDisconnecting(true);
    try {
      await disconnectStreamingAccount(user.id);
      setLinkStatus({ linked: false, provider: 'unknown', profileUrl: null });
      setLastSynced(null);
      toast({ title: 'Disconnected', description: 'Your streaming account has been removed.' });
    } catch (error) {
      toast({
        title: 'Could not disconnect',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const serviceLabel =
    linkStatus?.provider === 'spotify'
      ? 'Spotify'
      : linkStatus?.provider === 'apple-music'
        ? 'Apple Music'
        : null;

  if (loading && !linkStatus) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Checking streaming connection…
      </div>
    );
  }

  if (linkStatus?.linked && serviceLabel) {
    return (
      <div className={compact ? 'space-y-3' : 'space-y-4'}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CheckCircle className="w-4 h-4" />
            {serviceLabel} connected
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive h-8 px-2"
            onClick={handleDisconnect}
            disabled={disconnecting || syncing}
          >
            <Unlink className="w-3.5 h-3.5 mr-1" />
            {disconnecting ? 'Removing…' : 'Disconnect'}
          </Button>
        </div>

        {lastSynced ? (
          <p className="text-xs text-muted-foreground">
            Last synced {formatDistanceToNow(new Date(lastSynced), { addSuffix: true })}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Stats linked — tap resync to pull latest data.</p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={handleResync}
            disabled={syncing || disconnecting}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Resync stats'}
          </Button>
          {onNavigateToStreamingStats ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onNavigateToStreamingStats}
              disabled={syncing}
            >
              View streaming stats
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <p className="text-sm text-muted-foreground">
        Connect Spotify or Apple Music to sync listening history and personalize your feed.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 border-green-500 text-green-700 hover:bg-green-50"
          onClick={handleConnectSpotify}
        >
          <Music className="w-4 h-4" />
          Connect Spotify
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 border-red-400 text-red-600 hover:bg-red-50"
          onClick={handleConnectAppleMusic}
        >
          <Music className="w-4 h-4" />
          Connect Apple Music
        </Button>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-0 text-muted-foreground"
        onClick={() => void refreshStatus()}
        disabled={loading}
      >
        <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
        Refresh status
      </Button>
    </div>
  );
}
