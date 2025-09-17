import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Star, X, Check, Camera, Video, Plus, X as XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReviewService, ReviewData, UserReview, PublicReviewWithProfile } from '@/services/reviewService';
import type { JamBaseEvent } from '@/services/jambaseEventsService';
import { ArtistSearchBox } from './ArtistSearchBox';
import { VenueSearchBox } from './VenueSearchBox';
import type { Artist } from '@/types/concertSearch';
import type { VenueSearchResult } from '@/services/unifiedVenueSearchService';

interface EventReviewModalProps {
  event: JamBaseEvent | PublicReviewWithProfile | null;
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onReviewSubmitted?: (review: UserReview) => void;
}

export function EventReviewModal({
  event,
  userId,
  isOpen,
  onClose,
  onReviewSubmitted
}: EventReviewModalProps) {
  const [rating, setRating] = useState(0); // 0-10 scale for backend
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [existingReview, setExistingReview] = useState<UserReview | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [eventName, setEventName] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<VenueSearchResult | null>(null);

  // Qualitative labels for rating scale
  const getRatingLabel = (rating: number) => {
    const labels = [
      'Terrible', 'Poor', 'Below Average', 'Average', 'Good', 
      'Very Good', 'Great', 'Excellent', 'Outstanding', 'Best Ever'
    ];
    return labels[Math.floor(rating / 2)] || 'Not Rated';
  };

  // Load existing review when modal opens
  useEffect(() => {
    if (isOpen && event && userId) {
      loadExistingReview();
      populateEventData();
    }
  }, [isOpen, event, userId]);

  const populateEventData = () => {
    if (!event) return;
    
    if ('event_title' in event) {
      // PublicReviewWithProfile type
      setEventName(event.event_title);
      setLocation(event.venue_name);
      setDate(event.event_date);
    } else {
      // JamBaseEvent type
      setEventName(event.title);
      setLocation(event.venue_name);
      setDate(event.event_date);
    }
  };

  const loadExistingReview = async () => {
    if (!event) return;
    
    try {
      const review = await ReviewService.getUserEventReview(userId, event.id);
      if (review) {
        setExistingReview(review);
        // Convert 1-5 scale to 0-10 scale for display
        setRating(review.rating * 2);
        setReviewText(review.review_text || '');
        setIsPublic(review.is_public);
      } else {
        // Reset form for new review
        setExistingReview(null);
        setRating(0);
        setReviewText('');
        setIsPublic(true);
      }
    } catch (error) {
      console.error('Error loading existing review:', error);
    }
  };

  const handleSubmit = async () => {
    if (!event || rating === 0 || !selectedArtist || !selectedVenue) return;

    setIsLoading(true);
    try {
      // Convert 0-10 scale back to 1-5 scale for backend
      const backendRating = Math.ceil(rating / 2);
      
      const reviewData: ReviewData = {
        rating: backendRating,
        review_text: reviewText.trim() || undefined,
        is_public: isPublic
      };

      // Log the selected data for debugging
      console.log('Selected Artist:', selectedArtist);
      console.log('Selected Venue:', selectedVenue);
      console.log('Event Name:', eventName);
      console.log('Location:', location);
      console.log('Date:', date);

      const review = await ReviewService.setEventReview(userId, event.id, reviewData);

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
      await ReviewService.deleteEventReview(userId, event.id);
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

  const getEventTitle = () => {
    if (!event) return '';
    return 'event_title' in event ? event.event_title : event.title;
  };

  const getVenueName = () => {
    if (!event) return '';
    return 'venue_name' in event ? event.venue_name : (event as JamBaseEvent).venue_name;
  };

  const getEventDate = () => {
    if (!event) return '';
    return 'event_date' in event ? event.event_date : (event as JamBaseEvent).event_date;
  };

  const handleArtistSelect = (artist: Artist) => {
    setSelectedArtist(artist);
    setEventName(artist.name);
  };

  const handleVenueSelect = (venue: VenueSearchResult) => {
    setSelectedVenue(venue);
    setLocation(venue.name);
  };

  if (!event) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="w-5 h-5" />
            {existingReview ? 'Edit Review' : 'Add Concert Review'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Artist Search */}
          <div className="space-y-2">
            <Label>Artist *</Label>
            <ArtistSearchBox
              onArtistSelect={handleArtistSelect}
              placeholder="Search for an artist..."
              className="w-full"
            />
            {selectedArtist && (
              <div className="flex items-center space-x-2 p-2 bg-green-50 rounded-md">
                <div className="w-6 h-6 rounded-full bg-green-200 flex items-center justify-center">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
                <span className="text-sm text-green-800 font-medium">
                  Selected: {selectedArtist.name}
                </span>
              </div>
            )}
          </div>

          {/* Venue Search */}
          <div className="space-y-2">
            <Label>Venue *</Label>
            <VenueSearchBox
              onVenueSelect={handleVenueSelect}
              placeholder="Search for a venue..."
              className="w-full"
            />
            {selectedVenue && (
              <div className="flex items-center space-x-2 p-2 bg-green-50 rounded-md">
                <div className="w-6 h-6 rounded-full bg-green-200 flex items-center justify-center">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
                <span className="text-sm text-green-800 font-medium">
                  Selected: {selectedVenue.name}
                </span>
              </div>
            )}
          </div>

          {/* Date Input */}
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              placeholder="mm/dd/yyyy"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {/* Star Rating Slider */}
          <div className="space-y-4">
            <Label>Rating *</Label>
            <div className="space-y-3">
              {/* Star Display */}
              <div className="flex items-center justify-center space-x-1">
                {Array.from({ length: 5 }, (_, i) => {
                  const starValue = i + 1;
                  const isHalfStar = rating === (starValue * 2) - 1;
                  const isFullStar = rating >= starValue * 2;
                  
                  return (
                    <div key={i} className="relative">
                      <Star
                        className={cn(
                          "w-8 h-8 transition-colors cursor-pointer",
                          isFullStar ? "text-yellow-400 fill-current" : "text-gray-300"
                        )}
                        onMouseEnter={() => setHoverRating(starValue * 2)}
                        onMouseLeave={() => setHoverRating(0)}
                        onClick={() => setRating(starValue * 2)}
                      />
                      {isHalfStar && (
                        <div className="absolute inset-0 overflow-hidden w-1/2">
                          <Star className="w-8 h-8 text-yellow-400 fill-current" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              {/* Rating Label */}
              <div className="text-center">
                <p className="text-lg font-medium text-gray-900">
                  {getRatingLabel(hoverRating || rating)}
                </p>
                <p className="text-sm text-gray-500">
                  {rating > 0 ? `${(rating / 2).toFixed(1)} / 5.0 stars` : 'Not rated'}
                </p>
              </div>
              
              {/* Slider */}
              <div className="px-2">
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="1"
                  value={rating}
                  onChange={(e) => setRating(Number(e.target.value))}
                  disabled={isLoading}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer 
                           [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 
                           [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-yellow-400 
                           [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 
                           [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md
                           [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full 
                           [&::-moz-range-thumb]:bg-yellow-400 [&::-moz-range-thumb]:cursor-pointer 
                           [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow-md"
                  style={{
                    background: `linear-gradient(to right, #fbbf24 0%, #fbbf24 ${(rating / 10) * 100}%, #e5e7eb ${(rating / 10) * 100}%, #e5e7eb 100%)`
                  }}
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0</span>
                  <span>2.5</span>
                  <span>5.0</span>
                </div>
              </div>
            </div>
          </div>

          {/* Review Text */}
          <div className="space-y-2">
            <Label htmlFor="reviewText">Review (Optional)</Label>
            <Textarea
              id="reviewText"
              placeholder="Share your thoughts about this concert..."
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

          {/* Public Review Checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="isPublic"
              checked={isPublic}
              onCheckedChange={(checked) => setIsPublic(checked as boolean)}
              disabled={isLoading}
            />
            <Label htmlFor="isPublic" className="text-sm font-medium">
              Make this review public
            </Label>
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
                disabled={isLoading || rating === 0 || !selectedArtist || !selectedVenue}
                className="bg-pink-500 hover:bg-pink-600"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                {existingReview ? 'Update Review' : 'Add Review'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
