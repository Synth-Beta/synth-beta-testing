import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, MapPinned, Loader2 } from 'lucide-react';
import { VenueFollowService } from '@/services/venueFollowService';
import { VerifiedChatService } from '@/services/verifiedChatService';
import { cn } from '@/lib/utils';
import { trackInteraction } from '@/services/interactionTrackingService';

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
      return;
    }

    if (!venueName) {
      return;
    }

    setLoading(true);

    try {
      const newIsFollowing = !isFollowing;
      
      // Get venue ID before following (needed for chat joining)
      let venueId: string | null = null;
      if (newIsFollowing) {
        venueId = await VenueFollowService.getVenueIdByName(venueName, venueCity, venueState);
      }
      
      await VenueFollowService.setVenueFollowByName(
        userId,
        venueName,
        venueCity,
        venueState,
        newIsFollowing
      );

      setIsFollowing(newIsFollowing);
      setFollowerCount(prev => newIsFollowing ? prev + 1 : Math.max(0, prev - 1));

      // If following, automatically join the venue's verified chat
      if (newIsFollowing && venueId) {
        try {
          console.log('🟢 VenueFollowButton: User followed venue, joining verified chat...', {
            venueId,
            venueName,
            venueCity,
            venueState,
            userId
          });
          
          await VerifiedChatService.joinOrOpenVerifiedChat(
            'venue',
            venueId,
            venueName,
            userId
          );
          console.log('🟢 VenueFollowButton: Successfully joined venue verified chat');
        } catch (error) {
          // Don't fail the follow action if chat join fails
          console.error('⚠️ VenueFollowButton: Error joining venue verified chat (non-fatal):', error);
        }
      } else if (newIsFollowing && !venueId) {
        // Fallback: try using venue name as entity_id
        try {
          console.log('🟡 VenueFollowButton: No venueId found, using venue name as entity_id');
          await VerifiedChatService.joinOrOpenVerifiedChat(
            'venue',
            venueName,
            venueName,
            userId
          );
          console.log('🟢 VenueFollowButton: Successfully joined venue verified chat (using name)');
        } catch (error) {
          console.error('⚠️ VenueFollowButton: Error joining venue verified chat with name (non-fatal):', error);
        }
      }

      const locationStr = venueCity && venueState 
        ? ` in ${venueCity}, ${venueState}` 
        : venueCity 
          ? ` in ${venueCity}`
          : '';

      onFollowChange?.(newIsFollowing);
    } catch (error) {
      console.error('Error toggling venue follow:', error);
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

