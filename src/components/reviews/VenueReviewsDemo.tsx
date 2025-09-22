import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, MapPin, Plus, TrendingUp } from 'lucide-react';
import { ReviewService, VenueStats, TagCount } from '@/services/reviewService';
import { VenueReviewCard } from './VenueReviewCard';
import { EventReviewModal } from './EventReviewModal';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { PublicReviewWithProfile } from '@/services/reviewService';
import type { VenueSearchResult } from '@/services/unifiedVenueSearchService';

interface VenueReviewsDemoProps {
  venue: VenueSearchResult;
  className?: string;
}

export function VenueReviewsDemo({ venue, className }: VenueReviewsDemoProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [reviews, setReviews] = useState<PublicReviewWithProfile[]>([]);
  const [stats, setStats] = useState<VenueStats | null>(null);
  const [popularTags, setPopularTags] = useState<TagCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showReviewModal, setShowReviewModal] = useState(false);

  useEffect(() => {
    loadVenueData();
  }, [venue.id]);

  const loadVenueData = async () => {
    setIsLoading(true);
    try {
      // Load venue reviews
      const reviewsResult = await ReviewService.getPublicReviewsWithProfiles(
        undefined, // eventId
        venue.id, // venueId
        10 // limit
      );
      setReviews(reviewsResult.reviews);

      // Load venue stats (if venue has database ID)
      if (venue.id && !venue.id.startsWith('manual-')) {
        try {
          const venueStats = await ReviewService.getVenueStats(venue.id);
          setStats(venueStats);
        } catch (error) {
          console.log('Could not load venue stats (venue may not be in database yet)');
        }

        // Load popular venue tags
        try {
          const tags = await ReviewService.getPopularVenueTags(venue.id);
          setPopularTags(tags.slice(0, 8));
        } catch (error) {
          console.log('Could not load popular venue tags');
        }
      }
    } catch (error) {
      console.error('Error loading venue data:', error);
      toast({
        title: "Error",
        description: "Failed to load venue reviews. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReviewSubmitted = () => {
    setShowReviewModal(false);
    loadVenueData(); // Reload data after new review
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex">
        {Array.from({ length: 5 }, (_, i) => (
          <Star
            key={i}
            className={`w-4 h-4 ${
              i < rating ? 'text-yellow-400 fill-current' : 'text-gray-300'
            }`}
          />
        ))}
      </div>
    );
  };

  // Create a mock event for the review modal
  const mockEvent = {
    id: `new-review-${venue.id}`,
    title: `Review for ${venue.name}`,
    artist_name: '',
    venue_name: venue.name,
    event_date: new Date().toISOString(),
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-8 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={className}>
      {/* Venue Header */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                {venue.name}
              </CardTitle>
              {venue.address && (
                <p className="text-sm text-gray-600 mt-1">
                  {[
                    venue.address.addressLocality,
                    venue.address.addressRegion
                  ].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
            {user && (
              <Button
                onClick={() => setShowReviewModal(true)}
                className="flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Write Review
              </Button>
            )}
          </div>
        </CardHeader>
        
        {stats && (
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Overall Rating */}
              <div className="text-center">
                <div className="flex items-center justify-center mb-1">
                  {renderStars(Math.round(stats.average_overall_rating))}
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.average_overall_rating.toFixed(1)}
                </p>
                <p className="text-sm text-gray-600">
                  {stats.total_reviews} {stats.total_reviews === 1 ? 'review' : 'reviews'}
                </p>
              </div>

              {/* Artist Rating */}
              {stats.average_artist_rating > 0 && (
                <div className="text-center">
                  <div className="flex items-center justify-center mb-1">
                    {renderStars(Math.round(stats.average_artist_rating))}
                  </div>
                  <p className="text-lg font-semibold text-yellow-600">
                    {stats.average_artist_rating.toFixed(1)}
                  </p>
                  <p className="text-xs text-gray-600">Artist Performance</p>
                </div>
              )}

              {/* Venue Rating */}
              {stats.average_venue_rating > 0 && (
                <div className="text-center">
                  <div className="flex items-center justify-center mb-1">
                    {renderStars(Math.round(stats.average_venue_rating))}
                  </div>
                  <p className="text-lg font-semibold text-green-600">
                    {stats.average_venue_rating.toFixed(1)}
                  </p>
                  <p className="text-xs text-gray-600">Venue Experience</p>
                </div>
              )}
            </div>

            {/* Popular Tags */}
            {popularTags.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Popular Tags</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {popularTags.map((tag) => (
                    <Badge key={tag.tag} variant="secondary" className="text-xs">
                      {tag.tag.replace('-', ' ')} ({tag.count})
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Reviews List */}
      <div className="space-y-4">
        {reviews.length > 0 ? (
          <>
            <h3 className="text-lg font-semibold text-gray-900">
              Recent Reviews ({reviews.length})
            </h3>
            {reviews.map((review) => (
              <VenueReviewCard
                key={review.id}
                review={review}
                showVenueInfo={false} // Don't show venue info since we're on the venue page
                showArtistInfo={true}
              />
            ))}
          </>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No reviews yet
              </h3>
              <p className="text-gray-600 mb-4">
                Be the first to share your experience at {venue.name}!
              </p>
              {user && (
                <Button onClick={() => setShowReviewModal(true)}>
                  Write the First Review
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Review Modal */}
      {showReviewModal && (
        <EventReviewModal
          event={mockEvent as any}
          userId={user?.id || ''}
          isOpen={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          onReviewSubmitted={handleReviewSubmitted}
        />
      )}
    </div>
  );
}
