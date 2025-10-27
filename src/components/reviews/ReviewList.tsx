import React, { useState, useEffect } from 'react';
import { ReviewCard } from './ReviewCard';
import { ReviewService, ReviewWithEngagement } from '@/services/reviewService';
import { EnhancedReviewService } from '@/services/enhancedReviewService';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface ReviewListProps {
  eventId: string;
  currentUserId?: string;
  onReviewClick?: (reviewId: string) => void;
  onEdit?: (review: ReviewWithEngagement) => void;
  showEventInfo?: boolean;
  refreshTrigger?: number;
}

export function ReviewList({
  eventId,
  currentUserId,
  onReviewClick,
  onEdit,
  showEventInfo = false,
  refreshTrigger = 0
}: ReviewListProps) {
  const [reviews, setReviews] = useState<ReviewWithEngagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [averageRating, setAverageRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);

  useEffect(() => {
    loadReviews();
  }, [eventId, refreshTrigger]);

  const loadReviews = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Try enhanced service first, fallback to original if it fails
      try {
        const result = await EnhancedReviewService.getEventReviewsWithArtistVenueIds(eventId, currentUserId);
        setReviews(result.reviews);
        setAverageRating(result.averageRating);
        setTotalReviews(result.totalReviews);
      } catch (enhancedError) {
        console.warn('Enhanced service failed, falling back to original:', enhancedError);
        const result = await ReviewService.getEventReviews(eventId, currentUserId);
        setReviews(result.reviews);
        setAverageRating(result.averageRating);
        setTotalReviews(result.totalReviews);
      }
    } catch (err) {
      console.error('Error loading reviews:', err);
      setError('Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  const handleLike = (reviewId: string, isLiked: boolean) => {
    // Update local state optimistically
    setReviews(prevReviews =>
      prevReviews.map(review =>
        review.id === reviewId
          ? {
              ...review,
              is_liked_by_user: isLiked,
              likes_count: isLiked 
                ? review.likes_count + 1 
                : Math.max(0, review.likes_count - 1)
            }
          : review
      )
    );
  };

  const handleComment = (_reviewId: string) => {
    // No-op to prevent parent flows; comment handled inline in card
  };

  const handleShare = async (reviewId: string) => {
    if (!currentUserId) return;
    try {
      // Optimistic update
      setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, shares_count: (r.shares_count || 0) + 1 } : r));
      await ReviewService.shareReview(currentUserId, reviewId);
    } catch (err) {
      console.error('Error sharing review:', err);
      // Revert on error
      setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, shares_count: Math.max(0, (r.shares_count || 0) - 1) } : r));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="ml-2">Loading reviews...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 mb-4">{error}</p>
        <Button onClick={loadReviews} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  if (totalReviews === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 mb-4">No reviews yet</p>
        <p className="text-sm text-gray-400">Be the first to review this event!</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Review Summary */}
      <div className="bg-gradient-to-r from-gray-50 to-white rounded-lg p-4 border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg text-gray-900">Reviews</h3>
            <p className="text-sm text-gray-600">
              {totalReviews} review{totalReviews !== 1 ? 's' : ''}
              {averageRating > 0 && (
                <span className="ml-2">
                  • Average rating: <span className="font-semibold text-gray-900">{averageRating.toFixed(1)}/5</span>
                </span>
              )}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadReviews}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-4">
        {reviews.map((review) => (
          <ReviewCard
            key={review.id}
            review={review}
            currentUserId={currentUserId}
            onLike={handleLike}
            onComment={handleComment}
            onShare={handleShare}
            showEventInfo={showEventInfo}
            onEdit={onEdit}
          />
        ))}
      </div>

    </div>
  );
}
