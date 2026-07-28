import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Star, Music, MapPin, ChevronDown, ChevronUp, User, Calendar } from 'lucide-react';
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

interface Review {
  artist_name: boolean;
  venue_name: boolean;
  id: string;
  rating: number;
  performance_rating: number;
  venue_rating_new: number;
  overall_experience_rating: number;
  review_text: string;
  performance_review_text: string;
  venue_review_text: string;
  overall_experience_review_text: string;
  created_at: string;
  reviewer_name: string;
  reviewer_avatar: string;
  event_title: string;
  event_date: string;
  mood_tags: string[];
  genre_tags: string[];
  reaction_emoji: string;
}

type SortOption = 'newest' | 'oldest' | 'highest_rating' | 'lowest_rating';

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
  
  const [artistReviews, setArtistReviews] = useState<Review[]>([]);
  const [venueReviews, setVenueReviews] = useState<Review[]>([]);
  const [artistSortBy, setArtistSortBy] = useState<SortOption>('newest');
  const [venueSortBy, setVenueSortBy] = useState<SortOption>('newest');
  const [showArtistReviews, setShowArtistReviews] = useState(false);
  const [showVenueReviews, setShowVenueReviews] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      console.log('🔍 ArtistVenueReviews - Searching for:', {
        artistName: artistName,
        venueName: venueName
      });
      // Fetch artist stats and reviews
      try {
        
        // Query reviews where the event's artist_name matches - using original working query structure
        const { data: artistReviewsData, error: artistError } = await (supabase as any)
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
        } else if (artistReviewsData && artistReviewsData.length > 0) {
        
          // Calculate average of performance_rating and overall_experience_rating
          const validRatings = artistReviewsData
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

          // Fetch detailed review data for individual review display - using separate queries
          const { data: detailedReviews, error: detailedError } = await (supabase as any)
            .from('user_reviews')
            .select(`
              id,
              user_id,
              event_id,
              rating,
              performance_rating,
              overall_experience_rating,
              venue_rating_new,
              review_text,
              performance_review_text,
              venue_review_text,
              overall_experience_review_text,
              created_at,
              mood_tags,
              genre_tags,
              reaction_emoji
            `)
            .eq('is_public', true);

          if (!detailedError && detailedReviews) {
            // Filter reviews by artist name - get all reviews and filter by matching event data
            const filteredReviews = detailedReviews.filter(review => {
              // We need to check if this review's event matches our artist
              // Since we can't join here, we'll need to get event data for each review
              return true; // We'll filter after getting event data
            });

            // Get user profiles
            const userIds = filteredReviews.map(r => r.user_id).filter(Boolean);
            const { data: profiles } = await (supabase as any)
              .from('profiles')
              .select('user_id, name, avatar_url')
              .in('user_id', userIds);

            // Get event data
            const eventIds = filteredReviews.map(r => r.event_id).filter(Boolean);
            const { data: events } = await (supabase as any)
              .from('jambase_events')
              .select('id, artist_name, venue_name, event_date, title')
              .in('id', eventIds);

            // Combine the data and filter by artist name
            const transformedReviews = filteredReviews
              .map(review => {
                const profile = profiles?.find(p => p.user_id === review.user_id);
                const event = events?.find(e => e.id === review.event_id);
                
                
                return {
                  id: review.id,
                  rating: review.rating,
                  performance_rating: review.performance_rating,
                  venue_rating_new: review.venue_rating_new,
                  overall_experience_rating: review.overall_experience_rating,
                  review_text: review.review_text,
                  performance_review_text: review.performance_review_text,
                  venue_review_text: review.venue_review_text,
                  overall_experience_review_text: review.overall_experience_review_text,
                  created_at: review.created_at,
                  reviewer_name: profile?.name || 'Anonymous',
                  reviewer_avatar: profile?.avatar_url || null,
                  event_title: event?.title || '',
                  event_date: event?.event_date || '',
                  mood_tags: review.mood_tags || [],
                  genre_tags: review.genre_tags || [],
                  reaction_emoji: review.reaction_emoji || null,
                  artist_name: event?.artist_name || '',
                  venue_name: event?.venue_name || ''
                };
              })
              .filter(review => 
                review.artist_name && 
                review.artist_name.toLowerCase().includes(artistName.toLowerCase())
              );
            
            setArtistReviews(transformedReviews);
          }
        } else {
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
        setArtistReviews([]);
      }

      // Fetch venue stats and reviews - get ALL reviews for this venue
      try {
        console.log('🏢 Fetching venue reviews for:', venueName);
        
        // Query ALL reviews where the venue_name matches (regardless of artist)
        // Check for both venue_rating_new and venue_rating fields
        const { data: venueReviewsData, error: venueError } = await (supabase as any)
          .from('user_reviews')
          .select(`
            venue_rating_new,
            venue_rating,
            jambase_events!inner(venue_name, event_date, artist_name)
          `)
          .eq('is_public', true)
          .ilike('jambase_events.venue_name', venueName)
          .or('venue_rating_new.not.is.null,venue_rating.not.is.null');
        
        console.log('🏢 Venue reviews query result:', {
          data: venueReviewsData?.length || 0,
          error: venueError,
          venueName: venueName
        });
        
        // Also check for any reviews for this venue (not just venue ratings)
        const { data: allVenueReviews, error: allVenueError } = await (supabase as any)
          .from('user_reviews')
          .select(`
            id,
            jambase_events!inner(venue_name, artist_name, title)
          `)
          .eq('is_public', true)
          .ilike('jambase_events.venue_name', venueName);
        
        console.log('🏢 All reviews for venue:', {
          count: allVenueReviews?.length || 0,
          error: allVenueError,
          sampleReviews: allVenueReviews?.slice(0, 3).map(r => ({
            id: r.id,
            venue_name: r.jambase_events?.venue_name,
            artist_name: r.jambase_events?.artist_name
          }))
        });
        
        if (venueError) {
          console.error('Error fetching venue reviews:', venueError);
          setVenueStats({
            totalReviews: 0,
            averageRating: 0,
            loading: false,
            error: 'Failed to load venue reviews'
          });
        } else if (venueReviewsData && venueReviewsData.length > 0) {
          
          // Use venue_rating_new if available, otherwise fall back to venue_rating
          const validRatings = venueReviewsData
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

          // Fetch detailed review data for ALL venue reviews - using separate queries
          const { data: detailedReviews, error: detailedError } = await (supabase as any)
            .from('user_reviews')
            .select(`
              id,
              user_id,
              event_id,
              rating,
              performance_rating,
              venue_rating_new,
              overall_experience_rating,
              review_text,
              performance_review_text,
              venue_review_text,
              overall_experience_review_text,
              created_at,
              mood_tags,
              genre_tags,
              reaction_emoji
            `)
            .eq('is_public', true);

          if (!detailedError && detailedReviews) {
            // Get all reviews that have venue ratings (these are the ones we want to show for venue reviews)
            const venueReviews = detailedReviews.filter(review => 
              review.venue_rating_new || review.venue_rating
            );

            // Get user profiles for venue reviews
            const userIds = venueReviews.map(r => r.user_id).filter(Boolean);
            const { data: profiles } = await (supabase as any)
              .from('profiles')
              .select('user_id, name, avatar_url')
              .in('user_id', userIds);

            // Get event data for venue reviews
            const eventIds = venueReviews.map(r => r.event_id).filter(Boolean);
            const { data: events } = await (supabase as any)
              .from('jambase_events')
              .select('id, artist_name, venue_name, event_date, title')
              .in('id', eventIds);

            // Combine the data and filter by venue name
            const transformedReviews = venueReviews
              .map(review => {
                const profile = profiles?.find(p => p.user_id === review.user_id);
                const event = events?.find(e => e.id === review.event_id);
                
                
                return {
                  id: review.id,
                  rating: review.rating,
                  performance_rating: review.performance_rating,
                  venue_rating_new: review.venue_rating_new,
                  overall_experience_rating: review.overall_experience_rating,
                  review_text: review.review_text,
                  performance_review_text: review.performance_review_text,
                  venue_review_text: review.venue_review_text,
                  overall_experience_review_text: review.overall_experience_review_text,
                  created_at: review.created_at,
                  reviewer_name: profile?.name || 'Anonymous',
                  reviewer_avatar: profile?.avatar_url || null,
                  event_title: event?.title || '',
                  event_date: event?.event_date || '',
                  mood_tags: review.mood_tags || [],
                  genre_tags: review.genre_tags || [],
                  reaction_emoji: review.reaction_emoji || null,
                  artist_name: event?.artist_name || '',
                  venue_name: event?.venue_name || ''
                };
              })
              .filter(review => {
                const matches = review.venue_name && 
                  review.venue_name.toLowerCase().includes(venueName.toLowerCase());
                console.log('🔍 Venue matching:', {
                  reviewVenue: review.venue_name,
                  searchVenue: venueName,
                  matches: matches
                });
                return matches;
              });
            
            setVenueReviews(transformedReviews);
          }
        } else {
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
        setVenueReviews([]);
      }
    };

    fetchStats();
  }, [artistName, venueName]);


  const sortReviews = (reviews: Review[], sortBy: SortOption) => {
    const sorted = [...reviews];
    switch (sortBy) {
      case 'newest':
        return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case 'oldest':
        return sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case 'highest_rating':
        return sorted.sort((a, b) => {
          const aRating = a.performance_rating || a.venue_rating_new || 0;
          const bRating = b.performance_rating || b.venue_rating_new || 0;
          return bRating - aRating;
        });
      case 'lowest_rating':
        return sorted.sort((a, b) => {
          const aRating = a.performance_rating || a.venue_rating_new || 0;
          const bRating = b.performance_rating || b.venue_rating_new || 0;
          return aRating - bRating;
        });
      default:
        return sorted;
    }
  };

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const renderReviewCard = (review: Review, isArtistReview: boolean = true) => {
    const primaryRating = isArtistReview 
      ? (review.performance_rating + review.overall_experience_rating) / 2
      : review.venue_rating_new;
    
    return (
      <div key={review.id} className="border rounded-lg p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <img 
              src={review.reviewer_avatar || '/placeholder.svg'} 
              alt={review.reviewer_name}
              className="w-8 h-8 rounded-full"
            />
            <div>
              <div className="font-medium text-sm">{review.reviewer_name}</div>
              <div className="text-xs text-gray-500 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(review.event_date)}
              </div>
              {isArtistReview && review.venue_name && (
                <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                  <MapPin className="w-3 h-3" />
                  {review.venue_name}
                </div>
              )}
              {!isArtistReview && review.artist_name && (
                <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                  <Music className="w-3 h-3" />
                  {review.artist_name}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-1">
            {renderStars(primaryRating)}
            <span className="text-sm font-medium ml-1">{primaryRating.toFixed(1)}</span>
          </div>
        </div>
        
        {review.review_text && (
          <p className="text-sm text-gray-700">{review.review_text}</p>
        )}
        
        {isArtistReview && review.performance_review_text && (
          <div className="text-sm">
            <span className="font-medium text-gray-600">Performance: </span>
            <span className="text-gray-700">{review.performance_review_text}</span>
          </div>
        )}
        
        {!isArtistReview && review.venue_review_text && (
          <div className="text-sm">
            <span className="font-medium text-gray-600">Venue: </span>
            <span className="text-gray-700">{review.venue_review_text}</span>
          </div>
        )}
        
        {(review.mood_tags && review.mood_tags.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {review.mood_tags.map((tag, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
        
        {review.reaction_emoji && (
          <div className="text-lg">{review.reaction_emoji}</div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 mb-6">
      {/* Artist Reviews */}
      <Card className="border-gray-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Music className="w-5 h-5 text-pink-500" />
              <CardTitle className="text-lg">Artist Reviews</CardTitle>
            </div>
            {artistStats.totalReviews > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowArtistReviews(!showArtistReviews)}
                className="flex items-center gap-1"
              >
                {showArtistReviews ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showArtistReviews ? 'Hide' : 'View'} Reviews
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {artistStats.loading ? (
            <div className="text-sm text-gray-500">Loading...</div>
          ) : artistStats.totalReviews > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {renderStars(artistStats.averageRating)}
                <span className="text-sm font-medium">
                  {artistStats.averageRating.toFixed(1)}
                </span>
                <span className="text-sm text-gray-600">
                  ({artistStats.totalReviews} review{artistStats.totalReviews !== 1 ? 's' : ''})
                </span>
              </div>
              
              {showArtistReviews && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Sort by:</span>
                    <select 
                      value={artistSortBy} 
                      onChange={(e) => setArtistSortBy(e.target.value as SortOption)}
                      className="w-40 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
                    >
                      <option value="newest">Newest</option>
                      <option value="oldest">Oldest</option>
                      <option value="highest_rating">Highest Rating</option>
                      <option value="lowest_rating">Lowest Rating</option>
                    </select>
                  </div>
                  
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {sortReviews(artistReviews, artistSortBy).map(review => renderReviewCard(review, true))}
                  </div>
                </div>
              )}
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
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-pink-500" />
              <CardTitle className="text-lg">Venue Reviews</CardTitle>
            </div>
            {venueStats.totalReviews > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowVenueReviews(!showVenueReviews)}
                className="flex items-center gap-1"
              >
                {showVenueReviews ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showVenueReviews ? 'Hide' : 'View'} Reviews
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {venueStats.loading ? (
            <div className="text-sm text-gray-500">Loading...</div>
          ) : venueStats.totalReviews > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {renderStars(venueStats.averageRating)}
                <span className="text-sm font-medium">
                  {venueStats.averageRating.toFixed(1)}
                </span>
                <span className="text-sm text-gray-600">
                  ({venueStats.totalReviews} review{venueStats.totalReviews !== 1 ? 's' : ''})
                </span>
              </div>
              
              {showVenueReviews && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Sort by:</span>
                    <select 
                      value={venueSortBy} 
                      onChange={(e) => setVenueSortBy(e.target.value as SortOption)}
                      className="w-40 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
                    >
                      <option value="newest">Newest</option>
                      <option value="oldest">Oldest</option>
                      <option value="highest_rating">Highest Rating</option>
                      <option value="lowest_rating">Lowest Rating</option>
                    </select>
                  </div>
                  
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {sortReviews(venueReviews, venueSortBy).map(review => renderReviewCard(review, false))}
                  </div>
                </div>
              )}
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
