import React, { useState, useEffect } from 'react';
import { PublicReviewCard } from './PublicReviewCard';
import { ReviewService, PublicReviewWithProfile } from '@/services/reviewService';
import { Button } from '@/components/ui/button';
import { Loader2, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ReviewCommentsModal } from './ReviewCommentsModal';

interface PublicReviewListProps {
  eventId?: string;
  currentUserId?: string;
  onReviewClick?: (reviewId: string) => void;
  limit?: number;
}

export function PublicReviewList({
  eventId,
  currentUserId,
  onReviewClick,
  limit = 20
}: PublicReviewListProps) {
  const [reviews, setReviews] = useState<PublicReviewWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [commentsOpenFor, setCommentsOpenFor] = useState<string | null>(null);

  // Filter states
  const [minRating, setMinRating] = useState<number | null>(null);

  useEffect(() => {
    loadReviews();
  }, [eventId, minRating]);

  const loadReviews = async (reset = true) => {
    try {
      setLoading(true);
      setError(null);
      
      const currentOffset = reset ? 0 : offset;
      const result = await ReviewService.getPublicReviewsWithProfiles(
        eventId,
        undefined,
        limit,
        currentOffset
      );
      
      if (reset) {
        setReviews(result.reviews);
        setOffset(limit);
      } else {
        setReviews(prev => [...prev, ...result.reviews]);
        setOffset(prev => prev + limit);
      }
      
      setTotal(result.total);
      setHasMore(result.reviews.length === limit);
    } catch (err) {
      console.error('Error loading reviews:', err);
      setError('Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = () => {
    loadReviews(false);
  };

  const handleLike = (reviewId: string, isLiked: boolean) => {
    // Update local state optimistically
    setReviews(prevReviews =>
      prevReviews.map(review =>
        review.id === reviewId
          ? {
              ...review,
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

  const handleShare = async (reviewId: string) => {
    if (!currentUserId) return;
    try {
      // Optimistic update
      setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, shares_count: (r.shares_count || 0) + 1 } : r));
      await ReviewService.shareReview(currentUserId, reviewId);
    } catch (err) {
      console.error('Error sharing review:', err);
      setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, shares_count: Math.max(0, (r.shares_count || 0) - 1) } : r));
    }
  };

  const clearFilters = () => {
    setMinRating(null);
  };

  // Filter reviews based on selected criteria
  const filteredReviews = reviews.filter(review => {
    if (minRating && review.rating < minRating) return false;
    return true;
  });

  if (loading && reviews.length === 0) {
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
        <Button onClick={() => loadReviews(true)} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 mb-4">No public reviews found</p>
        <p className="text-sm text-gray-400">
          {eventId ? 'This event has no reviews yet.' : 'No reviews available.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">Reviews ({total})</h3>
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4" />
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              disabled={!minRating}
            >
              Clear Filters
            </Button>
          </div>
        </div>

        {/* Rating Filter */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 mb-2 block">Minimum Rating</label>
          <div className="flex space-x-2">
            {[1, 2, 3, 4, 5].map(rating => (
              <Button
                key={rating}
                variant={minRating === rating ? "default" : "outline"}
                size="sm"
                onClick={() => setMinRating(minRating === rating ? null : rating)}
              >
                {rating}+
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-4">
        {filteredReviews.map((review) => (
          <PublicReviewCard
            key={review.id}
            review={review}
            currentUserId={currentUserId}
            onLike={handleLike}
            onComment={handleComment}
            onShare={handleShare}
          />
        ))}
      </div>

      <ReviewCommentsModal
        reviewId={commentsOpenFor}
        isOpen={Boolean(commentsOpenFor)}
        onClose={() => setCommentsOpenFor(null)}
        currentUserId={currentUserId}
      />

      {/* Load More */}
      {hasMore && (
        <div className="text-center py-4">
          <Button
            onClick={handleLoadMore}
            disabled={loading}
            variant="outline"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading...
              </>
            ) : (
              'Load More Reviews'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
