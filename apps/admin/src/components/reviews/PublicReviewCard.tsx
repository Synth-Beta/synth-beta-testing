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
      <CardContent className="pt-0">
        {review.review_text && (
          <p className="text-[15px] leading-6 text-gray-800 mb-3">{review.review_text}</p>
        )}

        {(review.performance_rating || review.venue_rating || review.overall_experience_rating) && (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {review.performance_rating && (
              <div className="rounded-lg border-l-4 border-yellow-400 bg-yellow-50/60 p-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-yellow-900 font-medium">Performance</span>
                  <div className="flex items-center">
                    {renderStars(review.performance_rating)}
                    <span className="ml-1 text-yellow-900 font-semibold">{review.performance_rating.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            )}
            {review.venue_rating && (
              <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50/60 p-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-blue-900 font-medium">Venue</span>
                  <div className="flex items-center">
                    {renderStars(review.venue_rating)}
                    <span className="ml-1 text-blue-900 font-semibold">{review.venue_rating.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            )}
            {review.overall_experience_rating && (
              <div className="rounded-lg border-l-4 border-emerald-500 bg-emerald-50/60 p-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-emerald-900 font-medium">Experience</span>
                  <div className="flex items-center">
                    {renderStars(review.overall_experience_rating)}
                    <span className="ml-1 text-emerald-900 font-semibold">{review.overall_experience_rating.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
