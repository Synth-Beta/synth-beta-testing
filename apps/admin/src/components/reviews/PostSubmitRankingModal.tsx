import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { GripVertical, Star, Calendar, MapPin, Music } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReviewService, type UserReview } from '@/services/reviewService';
import { useToast } from '@/hooks/use-toast';

interface ReviewWithEventData extends UserReview {
  event_title?: string;
  artist_name?: string;
  venue_name?: string;
  event_date?: string;
  rank_order?: number;
}

interface PostSubmitRankingModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  newReview: UserReview;
  rating: number; // The exact rating (can be decimal like 4.5)
}

export function PostSubmitRankingModal({
  isOpen,
  onClose,
  userId,
  newReview,
  rating,
}: PostSubmitRankingModalProps) {
  console.log('🎬 PostSubmitRankingModal MOUNTED/RENDERING with props:', {
    isOpen,
    userId: userId?.slice(0, 8),
    newReviewId: newReview?.id?.slice(0, 8),
    rating,
  });
  
  const [reviews, setReviews] = useState<ReviewWithEventData[]>([]);
  const [orderedReviewIds, setOrderedReviewIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const { toast } = useToast();

  // Round rating to nearest 0.5 for display
  const displayRating = Math.round(rating * 2) / 2;

  useEffect(() => {
    console.log('🎭 PostSubmitRankingModal useEffect triggered:', { isOpen, userId: userId?.slice(0, 8), rating, newReviewId: newReview?.id?.slice(0, 8) });
    if (isOpen && userId) {
      console.log('  ➡️ Conditions met, loading reviews...');
      loadReviewsWithSameRating();
    } else {
      console.log('  ⏸️ Conditions not met, skipping load');
    }
  }, [isOpen, userId, rating]);

  const loadReviewsWithSameRating = async () => {
    setIsLoading(true);
    try {
      console.log('🔍 Loading reviews for rating:', displayRating, 'userId:', userId);
      
      // Get all user's reviews with the same rating (rounded to 0.5)
      const { reviews: userReviews } = await ReviewService.getUserReviewHistory(userId);
      
      console.log('📊 Total user reviews fetched:', userReviews.length);
      
      // Calculate effective rating for each review (considering 3-category average)
      const matchingReviews = userReviews
        .map(({ review, event }) => ({
          ...review,
          event_title: event?.title,
          artist_name: event?.artist_name,
          venue_name: event?.venue_name,
          event_date: event?.event_date,
          effectiveRating: calculateEffectiveRating(review),
          rank_order: (review as any).rank_order || null,
        }))
        .filter(review => {
          const reviewRating = Math.round(review.effectiveRating * 2) / 2;
          const matches = reviewRating === displayRating;
          console.log(`  Review ${review.id.slice(0, 8)}: rating=${review.rating}, effective=${review.effectiveRating}, rounded=${reviewRating}, matches=${matches}`);
          return matches;
        });

      console.log(`✅ Found ${matchingReviews.length} reviews matching ${displayRating}★`);

      // Sort by existing rank_order (if any), then by created_at
      matchingReviews.sort((a, b) => {
        if (a.rank_order != null && b.rank_order != null) {
          return a.rank_order - b.rank_order;
        }
        if (a.rank_order != null) return -1;
        if (b.rank_order != null) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setReviews(matchingReviews);
      setOrderedReviewIds(matchingReviews.map(r => r.id));
    } catch (error) {
      console.error('❌ Error loading reviews with same rating:', error);
      toast({
        title: 'Error',
        description: 'Failed to load reviews for ranking',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const calculateEffectiveRating = (review: UserReview): number => {
    // If we have the 3-category ratings, use their average
    if (
      review.performance_rating != null &&
      review.venue_rating != null &&
      review.overall_experience_rating != null
    ) {
      return (
        (review.performance_rating +
          review.venue_rating +
          review.overall_experience_rating) /
        3
      );
    }
    // Otherwise use the overall rating
    return review.rating;
  };

  // Debug logging
  useEffect(() => {
    console.log('🎯 PostSubmitRankingModal state:', {
      isOpen,
      reviewsCount: reviews.length,
      displayRating,
      newReviewId: newReview.id,
    });
  }, [isOpen, reviews.length, displayRating, newReview.id]);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newOrder = [...orderedReviewIds];
    const draggedId = newOrder[draggedIndex];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(index, 0, draggedId);

    setOrderedReviewIds(newOrder);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const moveReview = (index: number, direction: 'up' | 'down') => {
    console.log('🔄 Moving review:', { index, direction, total: orderedReviewIds.length });
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= orderedReviewIds.length) {
      console.log('⚠️ Cannot move - out of bounds');
      return;
    }

    const newOrder = [...orderedReviewIds];
    const temp = newOrder[index];
    newOrder[index] = newOrder[newIndex];
    newOrder[newIndex] = temp;
    
    console.log('✅ New order:', newOrder);
    setOrderedReviewIds(newOrder);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await ReviewService.setRankOrderForRatingGroup(
        userId,
        displayRating,
        orderedReviewIds
      );
      
      toast({
        title: 'Rankings Saved! 🎉',
        description: `Your ${displayRating}★ reviews have been ranked.`,
      });
      onClose();
    } catch (error) {
      console.error('Error saving rankings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save rankings. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  const getReviewById = (id: string): ReviewWithEventData | undefined => {
    return reviews.find(r => r.id === id);
  };

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Loading reviews...</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-8 w-8 border-4 border-pink-500 border-t-transparent rounded-full" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Don't show modal if there's only the new review (no other reviews to rank against)
  // Wait for reviews to load before making this decision
  if (!isLoading && reviews.length <= 1) {
    console.log('⚠️ Only 1 or fewer reviews found, closing modal');
    // Auto-close if opened
    if (isOpen) {
      setTimeout(() => onClose(), 100);
    }
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-400 fill-current" />
            Rank Your {displayRating}★ Reviews
          </DialogTitle>
          <DialogDescription>
            You have {reviews.length} reviews rated {displayRating}★. Drag to reorder them
            from your favorite (top) to least favorite (bottom). This helps us give you
            better recommendations!
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {orderedReviewIds.map((reviewId, index) => {
            const review = getReviewById(reviewId);
            if (!review) return null;

            const isNewReview = review.id === newReview.id;

            return (
              <Card
                key={review.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={cn(
                  'p-4 cursor-move transition-all',
                  draggedIndex === index && 'opacity-50',
                  isNewReview && 'border-2 border-pink-500 bg-pink-50/50'
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Drag Handle */}
                  <div className="flex flex-col items-center justify-center pt-1">
                    <GripVertical className="w-5 h-5 text-gray-400" />
                    <div className="mt-1 flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-sm font-semibold text-gray-700">
                      {index + 1}
                    </div>
                  </div>

                  {/* Review Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 truncate">
                          {review.event_title || review.artist_name || 'Concert'}
                        </h4>
                        
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                          {review.artist_name && (
                            <div className="flex items-center gap-1">
                              <Music className="w-3.5 h-3.5" />
                              <span className="truncate">{review.artist_name}</span>
                            </div>
                          )}
                          {review.venue_name && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" />
                              <span className="truncate">{review.venue_name}</span>
                            </div>
                          )}
                        </div>

                        {review.event_date && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                            <Calendar className="w-3 h-3" />
                            <span>
                              {new Date(review.event_date).toLocaleDateString()}
                            </span>
                          </div>
                        )}

                        {review.review_text && (
                          <p className="mt-2 text-sm text-gray-700 line-clamp-2">
                            {review.review_text}
                          </p>
                        )}
                      </div>

                      {isNewReview && (
                        <div className="flex-shrink-0">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-pink-100 text-pink-800">
                            New
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Move buttons for mobile/accessibility */}
                    <div className="flex gap-2 mt-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          moveReview(index, 'up');
                        }}
                        disabled={index === 0}
                        className="text-xs"
                      >
                        ⬆ Move Up
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          moveReview(index, 'down');
                        }}
                        disabled={index === orderedReviewIds.length - 1}
                        className="text-xs"
                      >
                        ⬇ Move Down
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleSkip}
            disabled={isSaving}
          >
            Skip for Now
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="bg-pink-500 hover:bg-pink-600"
          >
            {isSaving ? 'Saving...' : 'Save Rankings'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

