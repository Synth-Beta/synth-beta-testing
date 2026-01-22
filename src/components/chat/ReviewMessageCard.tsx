import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar, 
  MapPin, 
  Star, 
  ExternalLink,
  ThumbsUp,
  MessageCircle,
  FileText
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
  metadata?: { review_text?: string; rating?: number; artist_name?: string; venue_name?: string; };
}

interface ReviewData {
  id: string;
  user_id: string;
  event_id: string;
  rating: number;
  review_text: string;
  created_at: string;
  likes_count: number;
  comments_count: number;
  artist_name?: string;
  venue_name?: string;
  event_title?: string;
  event_date?: string;
  venue_city?: string;
  venue_state?: string;
  genres?: string[];
}

export function ReviewMessageCard({
  reviewId,
  customMessage,
  onReviewClick,
  currentUserId,
  className = '',
  metadata
}: ReviewMessageCardProps) {
  const [review, setReview] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReview();
  }, [reviewId]);

  const loadReview = async () => {
    try {
      setLoading(true);
      
      // Fetch review first
      const { data: reviewData, error: reviewError } = await supabase
        .from('reviews')
        .select('id, user_id, event_id, rating, review_text, created_at, likes_count, comments_count')
        .eq('id', reviewId)
        .single();

      if (reviewError || !reviewData) {
        console.error('Error loading shared review:', reviewError);
        return;
      }

      // Fetch event data separately
      let eventData: any = {};
      if (reviewData.event_id) {
        const { data: event, error: eventError } = await supabase
          .from('events')
          .select('title, event_date, artist_name, venue_name, venue_city, venue_state, genres')
          .eq('id', reviewData.event_id)
          .single();
        
        if (!eventError && event) {
          eventData = event;
        }
      }
      
      setReview({
        id: reviewData.id,
        user_id: reviewData.user_id,
        event_id: reviewData.event_id || '',
        rating: reviewData.rating,
        review_text: reviewData.review_text || '',
        created_at: reviewData.created_at,
        likes_count: reviewData.likes_count || 0,
        comments_count: reviewData.comments_count || 0,
        artist_name: eventData.artist_name || metadata?.artist_name,
        venue_name: eventData.venue_name || metadata?.venue_name,
        event_title: eventData.title,
        event_date: eventData.event_date,
        venue_city: eventData.venue_city,
        venue_state: eventData.venue_state,
        genres: eventData.genres || [],
      });
    } catch (error) {
      console.error('Error loading shared review:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      return format(parseISO(dateString), 'EEE, MMM d, yyyy');
    } catch {
      return dateString;
    }
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return '';
    try {
      return format(parseISO(dateString), 'h:mm a');
    } catch {
      return '';
    }
  };

  const truncateText = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-3 h-3 ${
          i < Math.floor(rating)
            ? 'text-yellow-400 fill-current'
            : i < rating
            ? 'text-yellow-400 fill-current opacity-50'
            : 'text-gray-300'
        }`}
      />
    ));
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

  const isPastEvent = review.event_date ? new Date(review.event_date) < new Date() : false;

  return (
    <Card 
      className={`overflow-hidden bg-gradient-to-br from-white via-pink-50/30 to-purple-50/30 border-2 border-pink-200 hover:border-pink-300 transition-all duration-200 hover:shadow-lg cursor-pointer ${className}`}
      onClick={() => {
        // Convert to ReviewWithEngagement format for onReviewClick
        const reviewWithEngagement: ReviewWithEngagement = {
          id: review.id,
          user_id: review.user_id,
          event_id: review.event_id,
          rating: review.rating,
          review_text: review.review_text,
          is_public: true,
          created_at: review.created_at,
          updated_at: review.created_at,
          likes_count: review.likes_count,
          comments_count: review.comments_count,
          shares_count: 0,
          is_liked_by_user: false,
          reaction_emoji: '',
          photos: [],
          videos: [],
          mood_tags: [],
          genre_tags: [],
          context_tags: [],
          artist_name: review.artist_name,
          venue_name: review.venue_name,
        };
        onReviewClick?.(reviewWithEngagement);
      }}
    >
      {/* Header with FileText Icon */}
      <div className="bg-gradient-to-r from-pink-500 to-purple-600 p-3 flex items-center gap-2">
        <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-white text-xs font-medium">Concert Review</p>
        </div>
        {isPastEvent && (
          <Badge variant="secondary" className="text-xs">
            Past Event
          </Badge>
        )}
      </div>

      {/* Review Details */}
      <div className="p-4 space-y-3">
        {/* Custom Message */}
        {customMessage && (
          <div className="bg-white/80 rounded-lg p-3 border border-pink-200">
            <p className="text-sm text-gray-700 italic">"{customMessage}"</p>
          </div>
        )}

        {/* Event Title & Artist */}
        {review.event_title && (
          <div>
            <h3 className="font-bold text-lg text-gray-900 leading-tight mb-1">
              {review.event_title}
            </h3>
            {review.artist_name && (
              <p className="text-pink-600 font-semibold text-sm">
                {review.artist_name}
              </p>
            )}
          </div>
        )}

        {/* Rating */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {renderStars(review.rating)}
          </div>
          <span className="text-sm font-semibold text-gray-700">
            {review.rating.toFixed(1)} / 5.0
          </span>
        </div>

        {/* Review Text Snippet */}
        {review.review_text && (
          <div className="bg-white/60 rounded-lg p-3 border border-pink-100">
            <p className="text-sm text-gray-700 italic">
              "{truncateText(review.review_text, 120)}"
            </p>
          </div>
        )}

        {/* Date & Time */}
        {review.event_date && (
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Calendar className="w-4 h-4 text-pink-500" />
            <span className="font-medium">{formatDate(review.event_date)}</span>
            {formatTime(review.event_date) && (
              <>
                <span className="text-gray-400">•</span>
                <span>{formatTime(review.event_date)}</span>
              </>
            )}
          </div>
        )}

        {/* Venue */}
        {review.venue_name && (
          <div className="flex items-start gap-2 text-sm text-gray-700">
            <MapPin className="w-4 h-4 text-pink-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">{review.venue_name}</p>
              {(review.venue_city || review.venue_state) && (
                <p className="text-xs text-gray-500">
                  {[review.venue_city, review.venue_state].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Genres */}
        {review.genres && review.genres.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {review.genres.slice(0, 3).map((genre, index) => (
              <Badge key={index} variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                {genre}
              </Badge>
            ))}
            {review.genres.length > 3 && (
              <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                +{review.genres.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Engagement Stats */}
        <div className="text-xs text-gray-500 pt-1 border-t border-pink-100">
          {review.likes_count > 0 && (
            <span>{review.likes_count} {review.likes_count === 1 ? 'person' : 'people'} found helpful</span>
          )}
          {review.likes_count > 0 && review.comments_count > 0 && <span> · </span>}
          {review.comments_count > 0 && (
            <span>{review.comments_count} {review.comments_count === 1 ? 'comment' : 'comments'}</span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="pt-2 border-t border-pink-100 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 border-pink-300 text-pink-700 hover:bg-pink-50"
            onClick={(e) => {
              e.stopPropagation();
              // Handle helpful action
            }}
          >
            <ThumbsUp className="w-3 h-3 mr-1" />
            Helpful
          </Button>
          
          <Button
            size="sm"
            variant="outline"
            className="flex-1 border-pink-300 text-pink-700 hover:bg-pink-50"
            onClick={(e) => {
              e.stopPropagation();
              // Handle comment action
            }}
          >
            <MessageCircle className="w-3 h-3 mr-1" />
            Comment
          </Button>
        </div>

        {/* View Details Link */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-pink-600 hover:text-pink-700 hover:bg-pink-50"
          onClick={(e) => {
            e.stopPropagation();
            const reviewWithEngagement: ReviewWithEngagement = {
              id: review.id,
              user_id: review.user_id,
              event_id: review.event_id,
              rating: review.rating,
              review_text: review.review_text,
              is_public: true,
              created_at: review.created_at,
              updated_at: review.created_at,
              likes_count: review.likes_count,
              comments_count: review.comments_count,
              shares_count: 0,
              is_liked_by_user: false,
              reaction_emoji: '',
              photos: [],
              videos: [],
              mood_tags: [],
              genre_tags: [],
              context_tags: [],
              artist_name: review.artist_name,
              venue_name: review.venue_name,
            };
            onReviewClick?.(reviewWithEngagement);
          }}
        >
          View Full Details →
        </Button>
      </div>
    </Card>
  );
}
