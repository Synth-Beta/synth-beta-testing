import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, MapPinned, Loader2 } from 'lucide-react';
import { VenueFollowService } from '@/services/venueFollowService';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface VenueFollowButtonProps {
  venueName: string;
  venueCity?: string;
  venueState?: string;
  userId: string;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showFollowerCount?: boolean;
  className?: string;
  onFollowChange?: (isFollowing: boolean) => void;
}

/**
 * Venue follow button component
 * Handles following/unfollowing venues with real-time updates
 * Uses NAME-BASED matching (not IDs)
 */
export function VenueFollowButton({
  venueName,
  venueCity,
  venueState,
  userId,
  variant = 'outline',
  size = 'sm',
  showFollowerCount = false,
  className,
  onFollowChange
}: VenueFollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Load follow status and stats
  useEffect(() => {
    const loadFollowStatus = async () => {
      if (!userId || !venueName) return;

      try {
        const stats = await VenueFollowService.getVenueFollowStatsByName(
          venueName,
          venueCity,
          venueState,
          userId
        );

        setIsFollowing(stats.is_following);
        setFollowerCount(stats.follower_count);
      } catch (error) {
        console.error('Error loading venue follow status:', error);
      }
    };

    loadFollowStatus();
  }, [venueName, venueCity, venueState, userId]);

  // Subscribe to real-time follow changes
  useEffect(() => {
    if (!userId) return;

    const channel = VenueFollowService.subscribeToVenueFollows(
      userId,
      (follow, event) => {
        // Check if this follow is for our venue
        const isOurVenue = 
          follow.venue_name.toLowerCase() === venueName.toLowerCase() &&
          (!venueCity || follow.venue_city?.toLowerCase() === venueCity.toLowerCase()) &&
          (!venueState || follow.venue_state?.toLowerCase() === venueState.toLowerCase());
        
        if (isOurVenue) {
          const newIsFollowing = event === 'INSERT';
          setIsFollowing(newIsFollowing);
          setFollowerCount(prev => newIsFollowing ? prev + 1 : Math.max(0, prev - 1));
        }
      }
    );

    return () => {
      channel.unsubscribe();
    };
  }, [userId, venueName, venueCity, venueState]);

  const handleToggleFollow = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!userId) {
      toast({
        title: 'Error',
        description: 'Please log in to follow venues.',
        variant: 'destructive'
      });
      return;
    }

    if (!venueName) {
      toast({
        title: 'Error',
        description: 'Venue name is required.',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);

    try {
      const newIsFollowing = !isFollowing;
      
      await VenueFollowService.setVenueFollowByName(
        userId,
        venueName,
        venueCity,
        venueState,
        newIsFollowing
      );

      setIsFollowing(newIsFollowing);
      setFollowerCount(prev => newIsFollowing ? prev + 1 : Math.max(0, prev - 1));

      const locationStr = venueCity && venueState 
        ? ` in ${venueCity}, ${venueState}` 
        : venueCity 
          ? ` in ${venueCity}`
          : '';

      toast({
        title: newIsFollowing ? 'Following!' : 'Unfollowed',
        description: newIsFollowing
          ? `You'll receive notifications when ${venueName}${locationStr} has new events`
          : `You won't receive notifications from ${venueName}${locationStr} anymore`
      });

      onFollowChange?.(newIsFollowing);
    } catch (error) {
      console.error('Error toggling venue follow:', error);
      toast({
        title: 'Error',
        description: `Failed to ${isFollowing ? 'unfollow' : 'follow'} venue`,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Don't render if no userId or venueName provided
  if (!userId) {
    console.warn('⚠️ VenueFollowButton: No userId provided, not rendering');
    return null;
  }

  if (!venueName) {
    console.warn('⚠️ VenueFollowButton: No venueName provided, not rendering');
    return null;
  }

  return (
    <Button
      variant={isFollowing ? 'secondary' : variant}
      size={size}
      className={cn('gap-2', className)}
      onClick={handleToggleFollow}
      disabled={loading}
      data-venue-name={venueName}
      data-testid="venue-follow-button"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isFollowing ? (
        <MapPinned className="h-4 w-4" />
      ) : (
        <MapPin className="h-4 w-4" />
      )}
      <span>
        {isFollowing ? 'Following' : 'Follow'}
        {showFollowerCount && followerCount > 0 && ` (${followerCount})`}
      </span>
    </Button>
  );
}

