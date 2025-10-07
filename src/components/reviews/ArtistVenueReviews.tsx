import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Star, Music, MapPin } from 'lucide-react';
import { ReviewService } from '@/services/reviewService';
import { supabase } from '@/integrations/supabase/client';

interface ArtistVenueReviewsProps {
  artistName: string;
  venueName: string;
  artistId?: string;
  venueId?: string;
}

interface ReviewStats {
  totalReviews: number;
  averageRating: number;
  loading: boolean;
  error?: string;
}

export function ArtistVenueReviews({ 
  artistName, 
  venueName, 
  artistId, 
  venueId 
}: ArtistVenueReviewsProps) {
  const [artistStats, setArtistStats] = useState<ReviewStats>({
    totalReviews: 0,
    averageRating: 0,
    loading: true
  });
  const [venueStats, setVenueStats] = useState<ReviewStats>({
    totalReviews: 0,
    averageRating: 0,
    loading: true
  });

  useEffect(() => {
    const fetchStats = async () => {
      // Fetch artist stats by querying reviews through jambase_events
      try {
        console.log('🔍 Fetching artist reviews for:', artistName);
        
        // Query reviews where the event's artist_name matches
        const { data: artistReviews, error: artistError } = await (supabase as any)
          .from('user_reviews')
          .select(`
            performance_rating,
            overall_experience_rating,
            jambase_events!inner(artist_name, event_date)
          `)
          .eq('is_public', true)
          .ilike('jambase_events.artist_name', artistName);
        
        if (artistError) {
          console.error('Error fetching artist reviews:', artistError);
          setArtistStats({
            totalReviews: 0,
            averageRating: 0,
            loading: false,
            error: 'Failed to load artist reviews'
          });
        } else if (artistReviews && artistReviews.length > 0) {
          console.log('✅ Found artist reviews:', artistReviews.length);
          
          // Calculate average of performance_rating and overall_experience_rating
          const validRatings = artistReviews
            .filter(review => review.performance_rating && review.overall_experience_rating)
            .map(review => (review.performance_rating + review.overall_experience_rating) / 2);
          
          const totalReviews = validRatings.length;
          const averageRating = totalReviews > 0 
            ? validRatings.reduce((sum, rating) => sum + rating, 0) / totalReviews 
            : 0;
          
          setArtistStats({
            totalReviews,
            averageRating,
            loading: false
          });
        } else {
          console.log('❌ No artist reviews found for:', artistName);
          setArtistStats({
            totalReviews: 0,
            averageRating: 0,
            loading: false
          });
        }
      } catch (error) {
        console.error('Error fetching artist reviews:', error);
        setArtistStats({
          totalReviews: 0,
          averageRating: 0,
          loading: false,
          error: 'Failed to load artist reviews'
        });
      }

      // Fetch venue stats by querying reviews through jambase_events
      try {
        console.log('🔍 Fetching venue reviews for:', venueName);
        
        // Query reviews where the event's venue_name matches
        const { data: venueReviews, error: venueError } = await (supabase as any)
          .from('user_reviews')
          .select(`
            venue_rating_new,
            venue_rating,
            jambase_events!inner(venue_name, event_date)
          `)
          .eq('is_public', true)
          .ilike('jambase_events.venue_name', venueName);
        
        if (venueError) {
          console.error('Error fetching venue reviews:', venueError);
          setVenueStats({
            totalReviews: 0,
            averageRating: 0,
            loading: false,
            error: 'Failed to load venue reviews'
          });
        } else if (venueReviews && venueReviews.length > 0) {
          console.log('✅ Found venue reviews:', venueReviews.length);
          
          // Use venue_rating_new if available, otherwise fall back to venue_rating
          const validRatings = venueReviews
            .filter(review => review.venue_rating_new || review.venue_rating)
            .map(review => review.venue_rating_new || review.venue_rating);
          
          const totalReviews = validRatings.length;
          const averageRating = totalReviews > 0 
            ? validRatings.reduce((sum, rating) => sum + rating, 0) / totalReviews 
            : 0;
          
          setVenueStats({
            totalReviews,
            averageRating,
            loading: false
          });
        } else {
          console.log('❌ No venue reviews found for:', venueName);
          setVenueStats({
            totalReviews: 0,
            averageRating: 0,
            loading: false
          });
        }
      } catch (error) {
        console.error('Error fetching venue reviews:', error);
        setVenueStats({
          totalReviews: 0,
          averageRating: 0,
          loading: false,
          error: 'Failed to load venue reviews'
        });
      }
    };

    fetchStats();
  }, [artistName, venueName]);

  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    
    for (let i = 0; i < fullStars; i++) {
      stars.push(
        <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
      );
    }
    
    if (hasHalfStar) {
      stars.push(
        <Star key="half" className="w-4 h-4 fill-yellow-400/50 text-yellow-400" />
      );
    }
    
    const emptyStars = 5 - Math.ceil(rating);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(
        <Star key={`empty-${i}`} className="w-4 h-4 text-gray-300" />
      );
    }
    
    return stars;
  };

  return (
    <div className="grid grid-cols-2 gap-4 mb-6">
      {/* Artist Reviews */}
      <Card className="border-gray-200">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Music className="w-5 h-5 text-pink-500" />
            <h3 className="font-semibold text-lg">Artist Reviews</h3>
          </div>
          
          {artistStats.loading ? (
            <div className="text-sm text-gray-500">Loading...</div>
          ) : artistStats.totalReviews > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {renderStars(artistStats.averageRating)}
                <span className="text-sm font-medium">
                  {artistStats.averageRating.toFixed(1)}
                </span>
              </div>
              <div className="text-sm text-gray-600">
                {artistStats.totalReviews} review{artistStats.totalReviews !== 1 ? 's' : ''}
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              No reviews yet for {artistName}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Venue Reviews */}
      <Card className="border-gray-200">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-5 h-5 text-pink-500" />
            <h3 className="font-semibold text-lg">Venue Reviews</h3>
          </div>
          
          {venueStats.loading ? (
            <div className="text-sm text-gray-500">Loading...</div>
          ) : venueStats.totalReviews > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {renderStars(venueStats.averageRating)}
                <span className="text-sm font-medium">
                  {venueStats.averageRating.toFixed(1)}
                </span>
              </div>
              <div className="text-sm text-gray-600">
                {venueStats.totalReviews} review{venueStats.totalReviews !== 1 ? 's' : ''}
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              No reviews yet for {venueName}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
