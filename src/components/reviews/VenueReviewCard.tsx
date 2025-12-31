import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, MapPin, Calendar, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PublicReviewWithProfile } from '@/services/reviewService';

interface VenueReviewCardProps {
  review: PublicReviewWithProfile;
  showVenueInfo?: boolean;
  showArtistInfo?: boolean;
  className?: string;
}

export function VenueReviewCard({ 
  review, 
  showVenueInfo = true, 
  showArtistInfo = true,
  className 
}: VenueReviewCardProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const renderStars = (rating: number, color: string = 'text-yellow-400') => {
    const stars = Math.round(Math.max(0, Math.min(5, rating)) * 2) / 2;
    return (
      <div className="flex">
        {Array.from({ length: 5 }, (_, i) => {
          const idx = i + 1;
          const isFull = stars >= idx;
          const isHalf = !isFull && stars >= idx - 0.5;
          return (
            <div key={i} className="relative w-4 h-4">
              <Star className="w-4 h-4 text-gray-300" />
              {(isHalf || isFull) && (
                <div className={cn('absolute left-0 top-0 h-full overflow-hidden', isFull ? 'w-full' : 'w-1/2')}>
                  <Star className={cn('w-4 h-4 fill-current', color)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-3">
        {/* User Info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {review.reviewer_avatar ? (
              <img
                src={review.reviewer_avatar}
                alt={review.reviewer_name}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                <User className="w-4 h-4 text-gray-500" />
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-gray-900">
                {review.reviewer_name}
              </p>
              <p className="text-xs text-gray-500 flex items-center">
                <Calendar className="w-3 h-3 mr-1" />
                {formatDate((review as any).Event_date || (review as any).event_date || review.created_at)}
              </p>
            </div>
          </div>
          
          {/* Reaction Emoji */}
          {review.reaction_emoji && (
            <span className="text-lg">{review.reaction_emoji}</span>
          )}
        </div>

        {/* Event/Venue Info */}
        {showVenueInfo && (review.venue_name || review.venue_profile_name) && (
          <div className="flex items-center text-sm text-gray-600">
            <MapPin className="w-4 h-4 mr-1" />
            <span>{review.venue_name || review.venue_profile_name}</span>
            {review.venue_address?.addressLocality && (
              <span className="text-gray-500 ml-1">
                • {review.venue_address.addressLocality}
              </span>
            )}
          </div>
        )}

        {showArtistInfo && review.artist_name && (
          <div className="text-sm text-gray-600">
            <span className="font-medium">{review.artist_name}</span>
            {review.event_date && (
              <span className="text-gray-500 ml-2">
                • {formatDate(review.event_date)}
              </span>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Ratings */}
        <div className="space-y-2">
          {review.artist_rating && review.venue_rating ? (
            // Show both ratings for event reviews
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-medium text-gray-600">Artist:</span>
                {renderStars(review.artist_rating, 'text-yellow-400')}
                <span className="text-xs text-gray-500">({review.artist_rating}/5)</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-medium text-gray-600">Venue:</span>
                {renderStars(review.venue_rating, 'text-green-400')}
                <span className="text-xs text-gray-500">({review.venue_rating}/5)</span>
              </div>
            </div>
          ) : (
            // Show single rating for venue-only or artist-only reviews
            <div className="flex items-center space-x-2">
              <span className="text-xs font-medium text-gray-600">
                {review.review_type === 'venue' ? 'Venue:' : 
                 review.review_type === 'artist' ? 'Artist:' : 'Overall:'}
              </span>
              {renderStars(review.rating)}
              <span className="text-xs text-gray-500">({review.rating}/5)</span>
            </div>
          )}
          
          {/* Overall rating if different from individual ratings */}
          {review.artist_rating && review.venue_rating && review.rating !== Math.round((review.artist_rating + review.venue_rating) / 2) && (
            <div className="flex items-center space-x-2 pt-1 border-t border-gray-100">
              <span className="text-xs font-medium text-gray-600">Overall:</span>
              {renderStars(review.rating, 'text-blue-400')}
              <span className="text-xs text-gray-500">({review.rating}/5)</span>
            </div>
          )}
        </div>

        {/* Review Text */}
        {review.review_text && (
          <div className="text-sm text-gray-700 leading-relaxed">
            {review.review_text.split('\n\n').map((paragraph, index) => (
              <p key={index} className={index > 0 ? 'mt-2' : ''}>
                {paragraph}
              </p>
            ))}
          </div>
        )}

        {/* Tags */}
        {(review.venue_tags?.length || review.artist_tags?.length) && (
          <div className="space-y-2">
            {review.venue_tags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-xs font-medium text-green-600 mr-1">Venue:</span>
                {review.venue_tags.map((tag, index) => (
                  <Badge key={index} variant="outline" className="text-xs h-5 bg-green-50 text-green-700 border-green-200">
                    {tag.replace('-', ' ')}
                  </Badge>
                ))}
              </div>
            )}
            {review.artist_tags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-xs font-medium text-yellow-600 mr-1">Artist:</span>
                {review.artist_tags.map((tag, index) => (
                  <Badge key={index} variant="outline" className="text-xs h-5 bg-yellow-50 text-yellow-700 border-yellow-200">
                    {tag.replace('-', ' ')}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Engagement Stats */}
        {(review.likes_count > 0 || review.comments_count > 0) && (
          <div className="flex items-center space-x-4 text-xs text-gray-500 pt-2 border-t border-gray-100">
            {review.likes_count > 0 && (
              <span>{review.likes_count} {review.likes_count === 1 ? 'like' : 'likes'}</span>
            )}
            {review.comments_count > 0 && (
              <span>{review.comments_count} {review.comments_count === 1 ? 'comment' : 'comments'}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
