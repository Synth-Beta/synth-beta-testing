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
  const imageUrl = review.artist_image_url || null;

  return (
    <div
      className={cn(
        'swift-ui-card flex flex-col overflow-hidden',
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
      <div className="relative w-full flex-1 min-h-[60vh] max-h-[70vh] overflow-hidden">
        {imageUrl ? (
          <>
            <img src={imageUrl} alt={`${artistName} at ${venueName}`} className="w-full h-full object-cover" />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(to top, rgba(14, 14, 14, 0.8) 0%, rgba(14, 14, 14, 0.4) 50%, transparent 100%)',
              }}
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center swift-ui-gradient-bg">
            <div className="text-center px-4">
              <p
                className="line-clamp-2"
                style={{
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-h2-size, 24px)',
                  fontWeight: 'var(--typography-h2-weight, 700)',
                  lineHeight: 'var(--typography-h2-line-height, 1.3)',
                  color: 'var(--neutral-0)',
                }}
              >
                {artistName}
                {venueName && ` at ${venueName}`}
        </p>
      </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 swift-ui-card-content" style={{ zIndex: 40 }}>
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, color-mix(in srgb, var(--neutral-0) 96%, transparent) 0%, color-mix(in srgb, var(--neutral-0) 90%, transparent) 60%, color-mix(in srgb, var(--neutral-0) 70%, transparent) 100%)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
          }}
        />

        <div
          className="relative flex flex-col"
          style={{ padding: 'var(--spacing-grouped, 24px)', gap: 'var(--spacing-small, 12px)' }}
        >
          <h2
            className="line-clamp-2"
            style={{
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-h2-size, 24px)',
              fontWeight: 'var(--typography-h2-weight, 700)',
              lineHeight: 'var(--typography-h2-line-height, 1.3)',
              color: 'var(--neutral-900)',
            }}
          >
            {artistName}
            {venueName && ` at ${venueName}`}
          </h2>

          <div className="flex flex-col" style={{ gap: 'var(--spacing-inline, 6px)' }}>
            {venueName && (
              <div className="flex items-center" style={{ gap: 'var(--spacing-inline, 6px)' }}>
                <MapPin size={20} style={{ color: 'var(--brand-pink-500)' }} />
                <span
                  style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)',
                    color: 'var(--neutral-700)',
                  }}
                >
                  {venueName}
                </span>
        </div>
      )}
            {eventDate && (
              <div className="flex items-center" style={{ gap: 'var(--spacing-inline, 6px)' }}>
                <Calendar size={20} style={{ color: 'var(--brand-pink-500)' }} />
                <span
                  style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)',
                    color: 'var(--neutral-700)',
                  }}
                >
                  {eventDate}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col" style={{ gap: 'var(--spacing-inline, 6px)' }}>
            <p
              style={{
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)',
                color: 'var(--neutral-700)',
              }}
            >
              <span style={{ fontWeight: 'var(--typography-bold-weight, 700)' }}>{authorName}</span>
              {' reviewed this event'}
            </p>

            {rating > 0 && (
              <div className="flex items-center" style={{ gap: 'var(--spacing-inline, 6px)' }}>
                <div className="flex items-center" style={{ gap: 'var(--spacing-inline, 6px)' }}>
                  {Array.from({ length: 5 }).map((_, i) => {
                    const starValue = i + 1;
                    const isFullStar = starValue <= Math.floor(rating);
                    const isHalfStar = !isFullStar && starValue <= rating;

                    return (
                      <Star
                        key={i}
                        className={cn('w-5 h-5')}
                        style={{
                          color: isFullStar || isHalfStar ? 'var(--brand-pink-500)' : 'var(--neutral-200)',
                          fill: isFullStar || isHalfStar ? 'var(--brand-pink-500)' : 'transparent',
                          fillOpacity: isHalfStar ? 0.5 : 1,
                        }}
                        strokeWidth={isFullStar || isHalfStar ? 0 : 1.5}
              />
                    );
                  })}
            </div>
                <span
                  style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)',
                    color: 'var(--brand-pink-500)',
                  }}
                >
                  {rating.toFixed(1)}
                </span>
              </div>
            )}
            </div>

          {reviewText && (
            <p
              className="line-clamp-2"
              style={{
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-body-size, 20px)',
                fontWeight: 'var(--typography-body-weight, 500)',
                lineHeight: 'var(--typography-body-line-height, 1.5)',
                color: 'var(--neutral-900)',
              }}
            >
              {reviewText}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

