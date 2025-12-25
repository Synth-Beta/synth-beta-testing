import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Star, 
  MapPin,
  Music,
  Calendar,
  User
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';
import type { ReviewWithEngagement } from '@/services/reviewService';

interface ReviewMessageCardProps {
  reviewId: string;
  customMessage?: string;
  onReviewClick?: (review: ReviewWithEngagement) => void;
  currentUserId?: string;
  className?: string;
  metadata?: {
    review_text?: string;
    rating?: number;
    artist_name?: string;
    venue_name?: string;
    event_title?: string;
  };
}

export function ReviewMessageCard({
  reviewId,
  customMessage,
  onReviewClick,
  currentUserId,
  className = '',
  metadata
}: ReviewMessageCardProps) {
  const [review, setReview] = useState<ReviewWithEngagement | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorName, setAuthorName] = useState<string>('User');
  const [authorAvatar, setAuthorAvatar] = useState<string | null>(null);

  useEffect(() => {
    loadReview();
  }, [reviewId]);

  const loadReview = async () => {
    try {
      setLoading(true);
      
      // Fetch review data
      const { data: reviewData, error: reviewError } = await supabase
        .from('reviews')
        .select(`
          id,
          user_id,
          event_id,
          rating,
          review_text,
          photos,
          created_at,
          updated_at,
          likes_count,
          comments_count,
          shares_count
        `)
        .eq('id', reviewId)
        .single();

      if (reviewError) {
        console.error('Error loading review:', reviewError);
        setLoading(false);
        return;
      }

      if (!reviewData) {
        setLoading(false);
        return;
      }

      // Fetch user data separately
      let userName = 'User';
      let userAvatar: string | null = null;
      if (reviewData.user_id) {
        const { data: userData } = await supabase
          .from('users')
          .select('user_id, name, avatar_url')
          .eq('user_id', reviewData.user_id)
          .single();
        
        if (userData) {
          userName = userData.name || 'User';
          userAvatar = userData.avatar_url || null;
        }
      }

      // Fetch event data separately (3NF compliant - use FK join, not metadata)
      let artistName = '';
      let venueName = '';
      let eventTitle = '';
      
      if (reviewData.event_id) {
        const { data: eventData } = await supabase
          .from('events_with_artist_venue')
          .select('id, title, artist_name_normalized, venue_name_normalized, event_date')
          .eq('id', reviewData.event_id)
          .single();
        
        if (eventData) {
          // Use normalized column names (artist_name and venue_name columns removed)
          artistName = (eventData as any).artist_name_normalized || '';
          venueName = (eventData as any).venue_name_normalized || '';
          eventTitle = eventData.title || '';
        }
      }

      const reviewWithEngagement: ReviewWithEngagement = {
        id: reviewData.id,
        user_id: reviewData.user_id,
        event_id: reviewData.event_id || '',
        rating: reviewData.rating || 0,
        review_text: reviewData.review_text || '',
        is_public: true,
        created_at: reviewData.created_at,
        updated_at: reviewData.updated_at || reviewData.created_at,
        likes_count: reviewData.likes_count || 0,
        comments_count: reviewData.comments_count || 0,
        shares_count: reviewData.shares_count || 0,
        is_liked_by_user: false,
        reaction_emoji: '',
        photos: Array.isArray(reviewData.photos) ? reviewData.photos : [],
        videos: [],
        mood_tags: [],
        genre_tags: [],
        context_tags: [],
        artist_name: artistName,
        artist_id: '',
        venue_name: venueName,
        venue_id: '',
      };

      setReview(reviewWithEngagement);
      setAuthorName(userName);
      setAuthorAvatar(userAvatar);
    } catch (error) {
      console.error('Error loading review:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className={`p-4 bg-gradient-to-r from-pink-50 to-purple-50 border-pink-200 animate-pulse ${className}`}>
        <div className="space-y-3">
          <div className="h-4 bg-pink-200 rounded w-3/4"></div>
          <div className="h-3 bg-pink-200 rounded w-1/2"></div>
          <div className="h-3 bg-pink-200 rounded w-2/3"></div>
        </div>
      </Card>
    );
  }

  if (!review) {
    return (
      <Card className={`p-4 bg-gray-50 border-gray-200 ${className}`}>
        <p className="text-sm text-gray-500">Review not found</p>
      </Card>
    );
  }

  // 3NF compliant: Get event title from review data (fetched via FK join), not metadata
  const eventTitle = review.artist_name && review.venue_name 
    ? `${review.artist_name} at ${review.venue_name}`
    : review.artist_name || review.venue_name || 'Concert Review';

  const reviewPreview = review.review_text 
    ? (review.review_text.length > 100 
        ? review.review_text.substring(0, 100) + '...' 
        : review.review_text)
    : 'No review text';

  const eventDate = review.created_at 
    ? format(parseISO(review.created_at), 'MMM d, yyyy')
    : '';

  return (
    <Card 
      className={`overflow-hidden bg-gradient-to-br from-white via-pink-50/30 to-purple-50/30 border-2 border-pink-200 hover:border-pink-300 transition-all duration-200 hover:shadow-lg cursor-pointer ${className}`}
      onClick={() => onReviewClick?.(review)}
    >
      {/* Header with Star Icon */}
      <div className="bg-gradient-to-r from-pink-500 to-purple-600 p-3 flex items-center gap-2">
        <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
          <Star className="w-5 h-5 text-white fill-white" />
        </div>
        <div className="flex-1">
          <p className="text-white text-xs font-medium">Shared Review</p>
        </div>
      </div>

      {/* Review Details */}
      <div className="p-4 space-y-3">
        {/* Custom Message */}
        {customMessage && (
          <div className="bg-white/80 rounded-lg p-3 border border-pink-200">
            <p className="text-sm text-gray-700">{customMessage}</p>
          </div>
        )}

        {/* Author Info */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold overflow-hidden">
            {authorAvatar ? (
              <img src={authorAvatar} alt={authorName} className="w-full h-full object-cover" />
            ) : (
              <User className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{authorName}</p>
            {eventDate && (
              <p className="text-xs text-gray-500">{eventDate}</p>
            )}
          </div>
        </div>

        {/* Event Title */}
        <div>
          <h3 className="font-semibold text-gray-900 text-sm mb-1">{eventTitle}</h3>
        </div>

        {/* Rating */}
        {review.rating > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }, (_, i) => {
                const starValue = i + 1;
                const isFull = starValue <= Math.floor(review.rating || 0);
                const isHalf = !isFull && starValue - 0.5 <= (review.rating || 0);
                return (
                  <div key={i} className="relative w-4 h-4">
                    <Star className={`w-4 h-4 ${isFull || isHalf ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
                    {isHalf && (
                      <div className="absolute left-0 top-0 h-full w-1/2 overflow-hidden pointer-events-none">
                        <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <span className="text-sm font-medium text-gray-700">{review.rating}/5</span>
          </div>
        )}

        {/* Review Text Preview */}
        <div className="bg-white/60 rounded-lg p-3 border border-pink-100">
          <p className="text-sm text-gray-700 line-clamp-3">{reviewPreview}</p>
        </div>

        {/* Event Details */}
        {(review.artist_name || review.venue_name) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
            {review.artist_name && (
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">
                <Music className="w-3 h-3 mr-1" />
                {review.artist_name}
              </Badge>
            )}
            {review.venue_name && (
              <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">
                <MapPin className="w-3 h-3 mr-1" />
                {review.venue_name}
              </Badge>
            )}
          </div>
        )}

        {/* Engagement Stats */}
        <div className="flex items-center gap-4 text-xs text-gray-500 pt-2 border-t border-pink-100">
          <span>{review.likes_count || 0} likes</span>
          <span>{review.comments_count || 0} comments</span>
        </div>
      </div>
    </Card>
  );
}

