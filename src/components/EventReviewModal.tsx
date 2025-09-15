import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Star, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserEventService, UserEventReview } from '@/services/userEventService';
import type { JamBaseEvent } from '@/services/jambaseEventsService';

interface EventReviewModalProps {
  event: JamBaseEvent | null;
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onReviewSubmitted?: (review: UserEventReview) => void;
}

export function EventReviewModal({
  event,
  userId,
  isOpen,
  onClose,
  onReviewSubmitted
}: EventReviewModalProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [wasThere, setWasThere] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [existingReview, setExistingReview] = useState<UserEventReview | null>(null);

  // Load existing review when modal opens
  useEffect(() => {
    if (isOpen && event && userId) {
      loadExistingReview();
    }
  }, [isOpen, event, userId]);

  const loadExistingReview = async () => {
    if (!event) return;
    
    try {
      const review = await UserEventService.getUserEventReview(userId, event.jambase_event_id);
      if (review) {
        setExistingReview(review);
        setRating(review.rating);
        setReviewText(review.review_text || '');
        setWasThere(review.was_there);
      } else {
        // Reset form for new review
        setExistingReview(null);
        setRating(0);
        setReviewText('');
        setWasThere(false);
      }
    } catch (error) {
      console.error('Error loading existing review:', error);
    }
  };

  const handleSubmit = async () => {
    if (!event || rating === 0) return;

    setIsLoading(true);
    try {
      const review = await UserEventService.setEventReview(userId, event.jambase_event_id, {
        rating,
        review_text: reviewText.trim() || undefined,
        was_there: wasThere
      });

      if (onReviewSubmitted) {
        onReviewSubmitted(review);
      }

      onClose();
    } catch (error) {
      console.error('Error submitting review:', error);
      // TODO: Show error toast
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!event || !existingReview) return;

    setIsLoading(true);
    try {
      await UserEventService.deleteEventReview(userId, event.jambase_event_id);
      onClose();
    } catch (error) {
      console.error('Error deleting review:', error);
      // TODO: Show error toast
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (!event) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="w-5 h-5" />
            {existingReview ? 'Edit Review' : 'Review Event'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Event Info */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold text-lg">{event.title}</h3>
            <p className="text-sm text-muted-foreground">{event.venue_name}</p>
            <p className="text-sm text-muted-foreground">{formatDate(event.event_date)}</p>
          </div>

          {/* Rating */}
          <div className="space-y-2">
            <Label>Rating *</Label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1"
                  disabled={isLoading}
                >
                  <Star
                    className={cn(
                      "w-6 h-6 transition-colors",
                      (hoverRating >= star || rating >= star)
                        ? "text-yellow-400 fill-current"
                        : "text-gray-300"
                    )}
                  />
                </button>
              ))}
              <span className="ml-2 text-sm text-muted-foreground">
                {rating > 0 && `${rating} star${rating !== 1 ? 's' : ''}`}
              </span>
            </div>
          </div>

          {/* Was There Checkbox */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="wasThere"
              checked={wasThere}
              onChange={(e) => setWasThere(e.target.checked)}
              disabled={isLoading}
              className="rounded border-gray-300"
            />
            <Label htmlFor="wasThere" className="text-sm">
              I was at this event
            </Label>
          </div>

          {/* Review Text */}
          <div className="space-y-2">
            <Label htmlFor="reviewText">Review (optional)</Label>
            <Textarea
              id="reviewText"
              placeholder="Share your experience at this event..."
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              disabled={isLoading}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {reviewText.length}/500 characters
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between">
            <div>
              {existingReview && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isLoading}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <X className="w-4 h-4 mr-1" />
                  Delete Review
                </Button>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isLoading || rating === 0}
                className="bg-blue-500 hover:bg-blue-600"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                {existingReview ? 'Update Review' : 'Submit Review'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
