import React from 'react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Calendar, MapPin, Send, Check, Heart } from 'lucide-react';
import { replaceJambasePlaceholder } from '@/utils/eventImageFallbacks';

export type EventReason = 'recommended' | 'trending' | 'friend_interested' | 'following';

interface CompactEventCardProps {
  event: {
    id: string;
    title: string;
    artist_name?: string;
    venue_name?: string;
    event_date?: string;
    venue_city?: string;
    image_url?: string;
    poster_image_url?: string;
  };
  interestedCount?: number;
  isInterested?: boolean;
  isCommunityPhoto?: boolean; // Indicates if image is from a user review photo
  reason?: EventReason; // Why this event is shown: recommended, trending, friend_interested, following
  onInterestClick?: (e: React.MouseEvent) => void;
  onShareClick?: (e: React.MouseEvent) => void;
  onClick?: () => void;
  className?: string;
}

export const CompactEventCard: React.FC<CompactEventCardProps> = ({
  event,
  interestedCount = 0,
  isInterested = false,
  isCommunityPhoto = false,
  reason,
  onInterestClick,
  onShareClick,
  onClick,
  className,
}) => {
  // Get badge text and styling based on reason
  const getReasonBadge = () => {
    if (!reason) return null;
    
    const badgeConfig = {
      recommended: { text: 'Recommended', bgColor: 'rgba(255, 51, 153, 0.9)', textColor: '#ffffff' },
      trending: { text: 'Trending', bgColor: 'rgba(255, 102, 179, 0.9)', textColor: '#ffffff' },
      friend_interested: { text: 'Friend Interested', bgColor: 'rgba(255, 51, 153, 0.85)', textColor: '#ffffff' },
      following: { text: 'Following', bgColor: 'rgba(255, 51, 153, 0.9)', textColor: '#ffffff' },
    };
    
    const config = badgeConfig[reason];
    if (!config) return null;
    
    return (
      <div
        className="absolute left-4 px-3 py-1.5 rounded-lg backdrop-blur-sm"
        style={{
          top: '20px', // Fixed position from top for consistency across all cards
          backgroundColor: config.bgColor,
          color: config.textColor,
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.3)',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          zIndex: 50,
        }}
        aria-label={`Event shown because: ${config.text}`}
      >
        {config.text}
      </div>
    );
  };
  const rawImageUrl = event.poster_image_url || event.image_url;
  const imageUrl = rawImageUrl ? replaceJambasePlaceholder(rawImageUrl) : null;
  const eventDate = event.event_date ? new Date(event.event_date) : null;
  
  const formatDate = (date: Date | null) => {
    if (!date) return '';
    return format(date, 'EEE, MMM d, yyyy');
  };

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
      aria-label={`View event: ${event.title}`}
    >
      {/* Event Image - Full height hero image */}
      <div
        className="relative w-full flex-1 min-h-[60vh] max-h-[70vh] overflow-hidden"
        style={{ outline: 'none' }}
      >
      {imageUrl ? (
        <>
          <img
            src={imageUrl}
            alt={event.title}
            className="w-full h-full object-cover"
          />
          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          
          {/* Reason Badge - Bottom Left - Positioned on image */}
          {reason && getReasonBadge()}
          
          {/* Community Photo Tag - ACCESSIBILITY: Decorative, hide from screen readers */}
          {isCommunityPhoto && (
            <div
              className="absolute top-4 right-4 flex items-center swift-ui-badge z-50"
              aria-hidden="true"
            >
              <span className="swift-ui-badge-text">
                Community Photo
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center swift-ui-gradient-bg">
          <div className="text-center px-4">
            <p className="text-xl font-semibold line-clamp-2 text-white">
              {event.title}
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
          {/* Event title */}
          <h2 className="text-2xl font-bold leading-tight text-neutral-900 line-clamp-2">
            {event.title}
          </h2>

          {/* Event details */}
          <div className="flex flex-col gap-2">
            {event.venue_name && (
              <div className="flex items-center gap-2 text-neutral-700">
                <MapPin 
                  className="w-5 h-5 flex-shrink-0" 
                  style={{ color: 'var(--brand-pink-500)' }}
                />
                <span className="text-base">
                  {event.venue_name}
                  {event.venue_city && ` · ${event.venue_city}`}
                </span>
              </div>
            )}
            {eventDate && (
              <div className="flex items-center gap-2 text-neutral-700">
                <Calendar 
                  className="w-5 h-5 flex-shrink-0" 
                  style={{ color: 'var(--brand-pink-500)' }}
                />
                <span className="text-base">{formatDate(eventDate)}</span>
              </div>
            )}
          </div>

          {/* Interested count */}
          {interestedCount > 0 && (
            <div className="text-base text-neutral-600 font-medium">
              {interestedCount} {interestedCount === 1 ? 'person' : 'people'} interested
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            {/* Interested toggle button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onInterestClick?.(e);
              }}
              className={cn(
                'swift-ui-button swift-ui-button-primary flex-1',
                isInterested && 'swift-ui-button-active'
              )}
              aria-label={isInterested ? 'Remove interest' : 'Mark as interested'}
            >
              <Heart 
                size={18} 
                className={cn(
                  isInterested ? 'fill-white' : 'stroke-current'
                )} 
                strokeWidth={2.5}
                aria-hidden="true"
              />
              <span>{isInterested ? 'Interested' : 'Interested'}</span>
              {isInterested && (
                <Check 
                  size={18} 
                  className="ml-auto" 
                  aria-hidden="true"
                />
              )}
            </button>

            {/* Share button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onShareClick?.(e);
              }}
              className="swift-ui-button swift-ui-button-secondary w-14 h-14"
              aria-label="Share event"
            >
              <Send size={20} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

