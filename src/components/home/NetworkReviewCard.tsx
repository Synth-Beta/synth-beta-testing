import React from 'react';
import { Star, Image as ImageIcon } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface NetworkReviewCardProps {
  review: {
    id: string;
    author: {
      id: string;
      name: string;
      avatar_url?: string;
    };
    created_at: string;
    rating?: number;
    content?: string;
    photos?: string[];
    event_info?: {
      artist_name?: string;
      venue_name?: string;
      event_date?: string;
    };
  };
  onClick?: () => void;
  className?: string;
}

export const NetworkReviewCard: React.FC<NetworkReviewCardProps> = ({
  review,
  onClick,
  className,
}) => {
  const authorName = review.author.name || 'User';
  const artistName = review.event_info?.artist_name || 'Artist';
  const venueName = review.event_info?.venue_name || 'Venue';
  // Use Event_date from review if available, otherwise fall back to event_info.event_date or created_at
  const reviewEventDate = (review as any).Event_date || (review as any).event_date;
  const eventDate = reviewEventDate
    ? format(new Date(reviewEventDate), 'MMM d, yyyy')
    : review.event_info?.event_date 
    ? format(new Date(review.event_info.event_date), 'MMM d, yyyy')
    : review.created_at 
    ? format(new Date(review.created_at), 'MMM d, yyyy')
    : '';
  const rating = review.rating || 0;
  const reviewText = review.content || '';
  const photos = review.photos || [];

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white border border-gray-200 rounded-lg p-2 cursor-pointer hover:shadow-md transition-shadow',
        className
      )}
    >
      {/* Header: NAME reviewed ARTIST at VENUE on DATE */}
      <div className="mb-1.5">
        <p className="text-xs font-semibold text-gray-900 leading-tight">
          <span className="font-bold">{authorName}</span>
          {' reviewed '}
          <span className="font-bold">{artistName}</span>
          {venueName && (
            <>
              {' at '}
              <span className="font-bold">{venueName}</span>
            </>
          )}
          {eventDate && (
            <>
              {' on '}
              <span className="font-bold">{eventDate}</span>
            </>
          )}
        </p>
      </div>

      {/* Rating */}
      {rating > 0 && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={cn(
                  'w-3 h-3',
                  i < Math.floor(rating)
                    ? 'fill-synth-pink text-synth-pink'
                    : 'text-gray-300'
                )}
                strokeWidth={1.5}
              />
            ))}
          </div>
          <span className="text-xs font-semibold text-gray-700">{rating.toFixed(1)}</span>
        </div>
      )}

      {/* Review Text */}
      {reviewText && (
        <p className="text-xs text-gray-700 mb-1.5 line-clamp-2 leading-tight">
          {reviewText}
        </p>
      )}

      {/* Review Photos */}
      {photos.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {photos.slice(0, 2).map((photo, index) => (
            <div
              key={index}
              className="flex-shrink-0 w-12 h-12 rounded overflow-hidden bg-gray-100"
            >
              <img
                src={photo}
                alt={`Review photo ${index + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          ))}
          {photos.length > 2 && (
            <div className="flex-shrink-0 w-12 h-12 rounded bg-gray-100 flex items-center justify-center">
              <div className="text-center">
                <ImageIcon className="w-4 h-4 text-gray-400 mx-auto" />
                <span className="text-[9px] text-gray-500">+{photos.length - 2}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

