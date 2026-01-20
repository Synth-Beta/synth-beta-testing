import React from 'react';
import { Star, Calendar, MapPin } from 'lucide-react';
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
    artist_id?: string;
    artist_image_url?: string;
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
  const reviewEventDate = (review as any).Event_date || (review as any).event_date;
  const eventDate = reviewEventDate
    ? format(new Date(reviewEventDate), 'EEE, MMM d, yyyy')
    : review.event_info?.event_date 
    ? format(new Date(review.event_info.event_date), 'EEE, MMM d, yyyy')
    : review.created_at 
    ? format(new Date(review.created_at), 'EEE, MMM d, yyyy')
    : '';
  const rating = review.rating || 0;
  const reviewText = review.content || '';
  
  // Use artist image_url (user requested this specifically)
  // Priority: artist_image_url from review data (already fetched in service)
  const imageUrl = review.artist_image_url || null;

  return (
    <div
      className={cn(
        'swift-ui-card flex flex-col rounded-3xl overflow-hidden',
        'relative group cursor-pointer',
        'w-full h-full max-h-[85vh]',
        className
      )}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`View review by ${authorName}`}
    >
      {/* Review Image - Full height hero image */}
      <div
        className="relative w-full flex-1 min-h-[60vh] max-h-[70vh] overflow-hidden"
        style={{ outline: 'none' }}
      >
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt={`${artistName} at ${venueName}`}
              className="w-full h-full object-cover"
            />
            {/* Gradient overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center swift-ui-gradient-bg">
            <div className="text-center px-4">
              <p className="text-xl font-semibold line-clamp-2 text-white">
                {artistName}
                {venueName && ` at ${venueName}`}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Content overlay - positioned absolutely over image */}
      <div className="absolute bottom-0 left-0 right-0 swift-ui-card-content" style={{ zIndex: 40 }}>
        {/* Gradient background for content */}
        <div className="absolute inset-0 bg-gradient-to-t from-white/95 via-white/90 to-white/70 backdrop-blur-xl" />
        
        {/* Content */}
        <div className="relative p-6 flex flex-col gap-4">
          {/* Event title - matching CompactEventCard style */}
          <h2 className="text-2xl font-bold leading-tight text-neutral-900 line-clamp-2">
            {artistName}
            {venueName && ` at ${venueName}`}
          </h2>

          {/* Event details - matching CompactEventCard style */}
          <div className="flex flex-col gap-2">
            {venueName && (
              <div className="flex items-center gap-2 text-neutral-700">
                <MapPin 
                  className="w-5 h-5 flex-shrink-0" 
                  style={{ color: 'var(--brand-pink-500)' }}
                />
                <span className="text-base">
                  {venueName}
                </span>
              </div>
            )}
            {eventDate && (
              <div className="flex items-center gap-2 text-neutral-700">
                <Calendar 
                  className="w-5 h-5 flex-shrink-0" 
                  style={{ color: 'var(--brand-pink-500)' }}
                />
                <span className="text-base">{eventDate}</span>
              </div>
            )}
          </div>

          {/* Review author and rating */}
          <div className="flex flex-col gap-2">
            <p className="text-base text-neutral-700">
              <span className="font-semibold">{authorName}</span>
              {' reviewed this event'}
            </p>
            {rating > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => {
                    const starValue = i + 1;
                    const isFullStar = starValue <= Math.floor(rating);
                    const isHalfStar = !isFullStar && starValue <= rating;
                    
                    return (
                      <Star
                        key={i}
                        className={cn(
                          'w-5 h-5',
                          isFullStar
                            ? 'fill-[var(--brand-pink-500)] text-[var(--brand-pink-500)]'
                            : isHalfStar
                            ? 'fill-[var(--brand-pink-500)] text-[var(--brand-pink-500)] fill-opacity-50'
                            : 'text-neutral-300 fill-transparent'
                        )}
                        strokeWidth={isFullStar || isHalfStar ? 0 : 1.5}
                      />
                    );
                  })}
                </div>
                <span className="text-lg font-bold" style={{ color: 'var(--brand-pink-500)' }}>
                  {rating.toFixed(1)}
                </span>
              </div>
            )}
          </div>

          {/* Review Text */}
          {reviewText && (
            <p className="text-base text-neutral-800 leading-normal line-clamp-2">
              {reviewText}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

