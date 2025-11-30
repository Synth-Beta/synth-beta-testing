import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Heart, MessageCircle, Share2, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PublicReviewWithProfile } from '@/services/reviewService';

interface PublicReviewCardProps {
  review: PublicReviewWithProfile;
  onOpen?: (reviewId: string) => void;
}

export function PublicReviewCard({ review, onOpen }: PublicReviewCardProps) {
  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => {
      const starIndex = i + 1;
      const isFull = rating >= starIndex;
      const isHalf = !isFull && rating >= starIndex - 0.5;
      return (
        <div key={i} className="relative w-4 h-4">
          <Star className="w-4 h-4 text-gray-300" />
          {(isHalf || isFull) && (
            <div className={cn('absolute left-0 top-0 h-full overflow-hidden pointer-events-none', isFull ? 'w-full' : 'w-1/2')}>
              <Star className="w-4 h-4 text-yellow-400 fill-current" />
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <Card className="w-full border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 bg-white" onClick={()=> onOpen?.(review.id)}>
      <CardHeader className="pb-3 bg-gradient-to-r from-gray-50 to-white border-b">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <Avatar className="h-10 w-10 ring-2 ring-pink-100">
              <AvatarImage src={review.reviewer_avatar || undefined} />
              <AvatarFallback>{(review.reviewer_name || 'U').slice(0,2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{review.reviewer_name || 'User'}</p>
              <div className="flex items-center space-x-2">
                <div className="flex items-center">{renderStars(review.rating)}</div>
                {review.event_title && (
                  <span className="text-xs text-gray-500 truncate">{review.event_title}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-1">
            <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-50">
              <Heart className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm">
              <MessageCircle className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm">
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {review.review_text && (
          <p className="text-[15px] leading-6 text-gray-800">{review.review_text}</p>
        )}

        {typeof review.ticket_price_paid === 'number' && review.ticket_price_paid > 0 && (
          <div className="text-xs text-gray-600 bg-gray-100 inline-flex px-2 py-1 rounded">
            Ticket price (private): ${review.ticket_price_paid.toFixed(2)}
          </div>
        )}

        {[
          {
            label: 'Artist performance',
            rating: review.artist_performance_rating,
            feedback: review.artist_performance_feedback,
          },
          {
            label: 'Production',
            rating: review.production_rating,
            feedback: review.production_feedback,
          },
          {
            label: 'Venue',
            rating: review.venue_rating,
            feedback: review.venue_feedback
          },
          {
            label: 'Location',
            rating: review.location_rating,
            feedback: review.location_feedback
          },
          {
            label: 'Value',
            rating: review.value_rating,
            feedback: review.value_feedback
          }
        ]
          .filter(({ rating, feedback }) => rating || feedback)
          .map(({ label, rating, feedback }) => (
            <div key={label} className="rounded-lg border-l-4 border-pink-200 bg-pink-50/40 p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-700 font-medium">{label}</span>
                {typeof rating === 'number' && (
                  <div className="flex items-center gap-1">
                    {renderStars(rating)}
                    <span className="font-semibold text-gray-700">{rating.toFixed(1)}</span>
                  </div>
                )}
              </div>
              {feedback && (
                <div className="text-gray-700 italic">“{feedback}”</div>
              )}
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
