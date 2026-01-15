import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/Icon/Icon';
import { Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { UserEventService } from '@/services/userEventService';

interface AllDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: {
    type: 'user' | 'artist' | 'venue' | 'event';
    id: string;
    name: string;
    image?: string | null;
    rating?: number;
    reviewCount?: number;
  };
  currentUserId: string;
  onNavigateToDetail?: (type: string, id: string) => void;
}

export const AllDetailModal: React.FC<AllDetailModalProps> = ({
  isOpen,
  onClose,
  result,
  currentUserId,
  onNavigateToDetail,
}) => {
  const [isInterested, setIsInterested] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [rating, setRating] = useState<number | null>(result.rating || null);
  const [reviewCount, setReviewCount] = useState<number>(result.reviewCount || 0);

  useEffect(() => {
    if (isOpen && result.id) {
      loadDetails();
    }
  }, [isOpen, result.id]);

  const loadDetails = async () => {
    try {
      if (result.type === 'event') {
        const interested = await UserEventService.isUserInterested(currentUserId, result.id);
        setIsInterested(interested);

        // Get review count and average rating
        const { data: reviews } = await supabase
          .from('reviews')
          .select('rating')
          .eq('event_id', result.id)
          .eq('is_public', true)
          .eq('is_draft', false);

        if (reviews && reviews.length > 0) {
          const avgRating = reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length;
          setRating(avgRating);
          setReviewCount(reviews.length);
        }
      } else if (result.type === 'artist') {
        // Check if following artist (using consolidated follows table)
        const { data: following } = await supabase
          .from('follows')
          .select('id')
          .eq('user_id', currentUserId)
          .eq('followed_entity_type', 'artist')
          .eq('followed_entity_id', result.id)
          .maybeSingle();
        
        setIsFollowing(!!following);
      } else if (result.type === 'venue') {
        // Check if following venue
        const { data: following } = await supabase
          .from('user_venue_relationships')
          .select('id')
          .eq('user_id', currentUserId)
          .eq('venue_id', result.id)
          .maybeSingle();
        
        setIsFollowing(!!following?.data);
      }
    } catch (error) {
      console.error('Error loading details:', error);
    }
  };

  const handleAction = async () => {
    try {
      if (result.type === 'event') {
        const newState = !isInterested;
        setIsInterested(newState);
        
        await UserEventService.setEventInterest(currentUserId, result.id, newState);
      } else {
        // Follow/unfollow for artist or venue
        const newState = !isFollowing;
        setIsFollowing(newState);
        
        if (result.type === 'artist') {
          if (newState) {
            await supabase
              .from('follows')
              .insert({
                user_id: currentUserId,
                followed_entity_type: 'artist',
                followed_entity_id: result.id,
              });
          } else {
            await supabase
              .from('follows')
              .delete()
              .eq('user_id', currentUserId)
              .eq('followed_entity_type', 'artist')
              .eq('followed_entity_id', result.id);
          }
        } else if (result.type === 'venue') {
          if (newState) {
            await supabase
              .from('user_venue_relationships')
              .insert({
                user_id: currentUserId,
                venue_id: result.id,
              });
          } else {
            await supabase
              .from('user_venue_relationships')
              .delete()
              .eq('user_id', currentUserId)
              .eq('venue_id', result.id);
          }
        }
      }
    } catch (error) {
      console.error('Error toggling action:', error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="icon" onClick={onClose}>
              <Icon name="leftArrow" size={16} color="var(--neutral-900)" />
            </Button>
            <DialogTitle className="flex-1">{result.name}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Header Section */}
          <div className="flex items-start gap-4">
            {result.image ? (
              <img
                src={result.image}
                alt={result.name}
                className="w-24 h-24 rounded-full object-cover"
              />
            ) : (
              <Avatar className="w-24 h-24">
                <AvatarFallback className="text-2xl">
                  {result.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            )}
            <div className="flex-1">
              <h2 className="text-2xl font-bold mb-2">{result.name}</h2>
              {rating !== null && (
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        size={16}
                        style={{
                          color: i < Math.floor(rating) ? 'var(--color-yellow)' : 'var(--neutral-300)',
                          fill: i < Math.floor(rating) ? 'var(--color-yellow)' : 'none',
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-medium">{rating.toFixed(1)}</span>
                  {reviewCount > 0 && (
                    <span className="text-sm text-muted-foreground">
                      ({reviewCount} {reviewCount === 1 ? 'review' : 'reviews'})
                    </span>
                  )}
                </div>
              )}
              <Button
                onClick={handleAction}
                variant={result.type === 'event' ? (isInterested ? 'default' : 'outline') : (isFollowing ? 'default' : 'outline')}
                className="mt-2"
              >
                {result.type === 'event' ? (
                  <>
                    <Icon
                      name={isInterested ? 'largeHeart' : 'heart'}
                      size={16}
                      className="mr-2"
                      color={isInterested ? 'var(--brand-pink-500)' : 'var(--neutral-900)'}
                    />
                    {isInterested ? 'Interested' : "I'm Interested"}
                  </>
                ) : (
                  <>
                    {isFollowing ? 'Following' : 'Follow'}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Quick Links */}
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-3">View Full Details</h3>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                onNavigateToDetail?.(result.type, result.id);
                onClose();
              }}
            >
              Open {result.type.charAt(0).toUpperCase() + result.type.slice(1)} Page
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

