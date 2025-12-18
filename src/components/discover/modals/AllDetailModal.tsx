import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Star, Heart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

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
        const interested = await supabase
          .from('relationships')
          .select('id')
          .eq('user_id', currentUserId)
          .eq('related_entity_id', result.id)
          .eq('related_entity_type', 'event')
          .eq('relationship_type', 'interest')
          .maybeSingle();
        
        setIsInterested(!!interested.data);

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
        // Check if following artist
        const { data: following } = await supabase
          .from('relationships')
          .select('id')
          .eq('user_id', currentUserId)
          .eq('related_entity_id', result.id)
          .eq('related_entity_type', 'artist')
          .eq('relationship_type', 'follow')
          .maybeSingle();
        
        setIsFollowing(!!following?.data);
      } else if (result.type === 'venue') {
        // Check if following venue
        const { data: following } = await supabase
          .from('relationships')
          .select('id')
          .eq('user_id', currentUserId)
          .eq('related_entity_id', result.id)
          .eq('related_entity_type', 'venue')
          .eq('relationship_type', 'follow')
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
        
        if (newState) {
          await supabase
            .from('relationships')
            .insert({
              user_id: currentUserId,
              related_entity_id: result.id,
              related_entity_type: 'event',
              relationship_type: 'interest',
            });
        } else {
          await supabase
            .from('relationships')
            .delete()
            .eq('user_id', currentUserId)
            .eq('related_entity_id', result.id)
            .eq('related_entity_type', 'event')
            .eq('relationship_type', 'interest');
        }
      } else {
        // Follow/unfollow for artist or venue
        const newState = !isFollowing;
        setIsFollowing(newState);
        
        const entityType = result.type === 'artist' ? 'artist' : 'venue';
        
        if (newState) {
          await supabase
            .from('relationships')
            .insert({
              user_id: currentUserId,
              related_entity_id: result.id,
              related_entity_type: entityType,
              relationship_type: 'follow',
            });
        } else {
          await supabase
            .from('relationships')
            .delete()
            .eq('user_id', currentUserId)
            .eq('related_entity_id', result.id)
            .eq('related_entity_type', entityType)
            .eq('relationship_type', 'follow');
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
              <ArrowLeft className="h-4 w-4" />
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
                        className={`w-4 h-4 ${
                          i < Math.floor(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                        }`}
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
                    <Heart className={`w-4 h-4 mr-2 ${isInterested ? 'fill-current' : ''}`} />
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

