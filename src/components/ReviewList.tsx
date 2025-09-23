import React, { useState, useEffect } from 'react';
import { ReviewCard } from './ReviewCard';
import { ReviewService, ReviewWithEngagement } from '@/services/reviewService';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { ReviewCommentsModal } from './reviews/ReviewCommentsModal';

interface ReviewListProps {
  eventId: string;
  currentUserId?: string;
  onReviewClick?: (reviewId: string) => void;
  showEventInfo?: boolean;
}

export function ReviewList({
  eventId,
  currentUserId,
  onReviewClick,
  showEventInfo = false
}: ReviewListProps) {
  const [reviews, setReviews] = useState<ReviewWithEngagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [averageRating, setAverageRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [commentsOpenFor, setCommentsOpenFor] = useState<string | null>(null);

  useEffect(() => {
    loadReviews();
  }, [eventId]);

  const loadReviews = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await ReviewService.getEventReviews(eventId, currentUserId);
      setReviews(result.reviews);
      setAverageRating(result.averageRating);
      setTotalReviews(result.totalReviews);
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

  const handleComment = (reviewId: string) => {
    setCommentsOpenFor(reviewId);
    if (onReviewClick) onReviewClick(reviewId);
  };

  const handleShare = (reviewId: string) => {
    // TODO: Implement share functionality
    console.log('Share review:', reviewId);
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
    <div className="space-y-4">
      {/* Review Summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg">Reviews</h3>
            <p className="text-sm text-gray-600">
              {totalReviews} review{totalReviews !== 1 ? 's' : ''}
              {averageRating > 0 && (
                <span className="ml-2">
                  • Average rating: {averageRating.toFixed(1)}/5
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
          />
        ))}
      </div>

      <ReviewCommentsModal
        reviewId={commentsOpenFor}
        isOpen={Boolean(commentsOpenFor)}
        onClose={() => setCommentsOpenFor(null)}
        currentUserId={currentUserId}
      />
    </div>
  );
}
