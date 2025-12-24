import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { UserPlus, UserCheck, Loader2 } from 'lucide-react';
import { ArtistFollowService } from '@/services/artistFollowService';
import { VerifiedChatService } from '@/services/verifiedChatService';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ArtistFollowButtonProps {
  artistId?: string;
  artistName?: string;
  jambaseArtistId?: string;
  userId: string;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showFollowerCount?: boolean;
  className?: string;
  onFollowChange?: (isFollowing: boolean) => void;
}

/**
 * Artist follow button component
 * Handles following/unfollowing artists with real-time updates
 */
export function ArtistFollowButton({
  artistId: propArtistId,
  artistName,
  jambaseArtistId,
  userId,
  variant = 'outline',
  size = 'sm',
  showFollowerCount = false,
  className,
  onFollowChange
}: ArtistFollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [artistId, setArtistId] = useState<string | null>(propArtistId || null);
  const [resolvedArtistId, setResolvedArtistId] = useState<string | null>(null);
  const { toast } = useToast();

  // Resolve artist UUID from jambaseArtistId or name if needed
  useEffect(() => {
    const resolveArtistId = async () => {
      if (propArtistId) {
        setArtistId(propArtistId);
        setResolvedArtistId(propArtistId);
        return;
      }

      if (jambaseArtistId) {
        const uuid = await ArtistFollowService.getArtistUuidByJambaseId(jambaseArtistId);
        if (uuid) {
          setArtistId(uuid);
          setResolvedArtistId(uuid);
          return;
        }
      }

      if (artistName) {
        const uuid = await ArtistFollowService.getArtistUuidByName(artistName);
        if (uuid) {
          setArtistId(uuid);
          setResolvedArtistId(uuid);
          return;
        }
      }

      // If we can't resolve an ID, we'll work with artist name directly
      setResolvedArtistId(null);
    };

    resolveArtistId();
  }, [propArtistId, jambaseArtistId, artistName]);

  // Load follow status and stats
  useEffect(() => {
    const loadFollowStatus = async () => {
      if (!userId) return;

      try {
        let stats;
        
        // Check if resolvedArtistId is a valid UUID
        const isValidUUID = resolvedArtistId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resolvedArtistId);
        
        if (isValidUUID) {
          // We have a valid resolved artist ID, use the normal method
          stats = await ArtistFollowService.getArtistFollowStats(resolvedArtistId, userId);
        } else if (artistName) {
          // We don't have a valid artist ID, but we have a name - check by name
          stats = await ArtistFollowService.getArtistFollowStatsByName(artistName, userId);
        } else {
          return; // No artist information available
        }

        setIsFollowing(stats.is_following);
        setFollowerCount(stats.follower_count);
      } catch (error) {
        console.error('Error loading follow status:', error);
        // Fallback to name-based lookup if ID-based fails
        if (artistName) {
          try {
            const stats = await ArtistFollowService.getArtistFollowStatsByName(artistName, userId);
            setIsFollowing(stats.is_following);
            setFollowerCount(stats.follower_count);
          } catch (fallbackError) {
            console.error('Error in fallback follow status lookup:', fallbackError);
          }
        }
      }
    };

    loadFollowStatus();
  }, [resolvedArtistId, artistName, userId]);

  // Subscribe to real-time follow changes
  useEffect(() => {
    if (!userId) return;

    const channel = ArtistFollowService.subscribeToArtistFollows(
      userId,
      (follow, event) => {
        // Check if this follow is for our artist (by ID only since ArtistFollow doesn't have artist_name)
        const isOurArtist = resolvedArtistId ? follow.artist_id === resolvedArtistId : false;
        
        if (isOurArtist) {
          const newIsFollowing = event === 'INSERT';
          setIsFollowing(newIsFollowing);
          setFollowerCount(prev => newIsFollowing ? prev + 1 : Math.max(0, prev - 1));
        }
      }
    );

    return () => {
      channel.unsubscribe();
    };
  }, [userId, resolvedArtistId, artistName]);

  const handleToggleFollow = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!userId) {
      toast({
        title: 'Error',
        description: 'Please log in to follow artists.',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);

    try {
      const newIsFollowing = !isFollowing;
      
      if (resolvedArtistId) {
        // We have a resolved artist ID, use the normal method
        await ArtistFollowService.setArtistFollow(userId, resolvedArtistId, newIsFollowing);
      } else if (artistName) {
        // We don't have an artist ID, but we have a name - create/find artist and follow
        await ArtistFollowService.setArtistFollowByName(userId, artistName, jambaseArtistId, newIsFollowing);
      } else {
        throw new Error('No artist information available');
      }

      setIsFollowing(newIsFollowing);
      setFollowerCount(prev => newIsFollowing ? prev + 1 : Math.max(0, prev - 1));

      // If following, automatically join the artist's verified chat
      if (newIsFollowing) {
        try {
          console.log('🟢 ArtistFollowButton: User followed artist, joining verified chat...', {
            artistId: resolvedArtistId,
            artistName,
            jambaseArtistId,
            userId
          });
          
          // Use resolvedArtistId if available, otherwise try jambaseArtistId or artistName
          const entityId = resolvedArtistId || jambaseArtistId || artistName || '';
          if (entityId) {
            await VerifiedChatService.joinOrOpenVerifiedChat(
              'artist',
              entityId,
              artistName || 'Artist',
              userId
            );
            console.log('🟢 ArtistFollowButton: Successfully joined artist verified chat');
          } else {
            console.warn('⚠️ ArtistFollowButton: Could not determine entityId for chat join');
          }
        } catch (error) {
          // Don't fail the follow action if chat join fails
          console.error('⚠️ ArtistFollowButton: Error joining artist verified chat (non-fatal):', error);
        }
      }

      toast({
        title: newIsFollowing ? 'Following!' : 'Unfollowed',
        description: newIsFollowing
          ? `You'll receive notifications when ${artistName || 'this artist'} has new events or updates`
          : `You won't receive notifications from ${artistName || 'this artist'} anymore`
      });

      onFollowChange?.(newIsFollowing);
    } catch (error) {
      console.error('Error toggling follow:', error);
      toast({
        title: 'Error',
        description: `Failed to ${isFollowing ? 'unfollow' : 'follow'} artist`,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Always render the button, even if we can't resolve the artist ID
  // The button will handle the case where artistId is null
  
  // Don't render if no userId provided
  if (!userId) {
    console.warn('⚠️ ArtistFollowButton: No userId provided, not rendering');
    return null;
  }

  return (
    <Button
      variant={isFollowing ? 'secondary' : variant}
      size={size}
      className={cn('gap-2', className)}
      onClick={handleToggleFollow}
      disabled={loading}
      data-artist-name={artistName}
      data-testid="artist-follow-button"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isFollowing ? (
        <UserCheck className="h-4 w-4" />
      ) : (
        <UserPlus className="h-4 w-4" />
      )}
      <span>
        {isFollowing ? 'Following' : 'Follow'}
        {showFollowerCount && followerCount > 0 && ` (${followerCount})`}
      </span>
    </Button>
  );
}

