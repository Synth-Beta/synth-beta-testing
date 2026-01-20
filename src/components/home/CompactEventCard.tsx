import React from 'react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Calendar, MapPin, Send, Check, Heart } from 'lucide-react';
import { replaceJambasePlaceholder } from '@/utils/eventImageFallbacks';
import { trackInteraction } from '@/services/interactionTrackingService';
import { getEventUuid, getEventMetadata } from '@/utils/entityUuidResolver';

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
  isCommunityPhoto?: boolean;
  reason?: EventReason;
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
  const rawImageUrl = event.poster_image_url || event.image_url;
  const imageUrl = rawImageUrl ? replaceJambasePlaceholder(rawImageUrl) : null;
  const eventDate = event.event_date ? new Date(event.event_date) : null;

  const formatDate = (date: Date | null) => {
    if (!date) return '';
    return format(date, 'EEE, MMM d, yyyy');
  };

  const getReasonBadge = () => {
    if (!reason) return null;

    const labelMap: Record<EventReason, string> = {
      recommended: 'Recommended',
      trending: 'Trending',
      friend_interested: 'Friend Interested',
      following: 'Following',
    };

    return (
      <div
        className="absolute left-4 px-3 py-1.5 rounded-lg"
        style={{
          top: 'var(--spacing-grouped, 24px)',
          backgroundColor: 'var(--brand-pink-500)',
          color: 'var(--neutral-50)',
          boxShadow: '0 4px 4px 0 var(--shadow-color)',
          fontFamily: 'var(--font-family)',
          fontSize: 'var(--typography-meta-size, 16px)',
          fontWeight: 'var(--typography-meta-weight, 500)',
          lineHeight: 'var(--typography-meta-line-height, 1.5)',
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          zIndex: 50,
        }}
        aria-label={`Event shown because: ${labelMap[reason]}`}
      >
        {labelMap[reason]}
      </div>
    );
  };

  const handleClick = () => {
    if (onClick) {
      // Track event card click
      try {
        const eventUuid = getEventUuid(event);
        const metadata = getEventMetadata(event);
        trackInteraction.click(
          'event',
          event.id,
          { ...metadata, source: 'feed', reason: reason || 'unknown' },
          eventUuid || undefined
        );
      } catch (error) {
        console.error('Error tracking event card click:', error);
      }
      onClick();
    }
  };

  const handleInterestClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onInterestClick) {
      // Track interest toggle
      try {
        const eventUuid = getEventUuid(event);
        trackInteraction.interest(
          'event',
          event.id,
          !isInterested,
          { source: 'event_card', reason: reason || 'unknown' },
          eventUuid || undefined
        );
      } catch (error) {
        console.error('Error tracking interest toggle:', error);
      }
      onInterestClick(e);
    }
  };

  const handleShareClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onShareClick) {
      // Track share click
      try {
        const eventUuid = getEventUuid(event);
        trackInteraction.share(
          'event',
          event.id,
          'native',
          { source: 'event_card' },
          eventUuid || undefined
        );
      } catch (error) {
        console.error('Error tracking share click:', error);
      }
      onShareClick(e);
    }
  };

  return (
    <div
      className={cn(
        'swift-ui-card flex flex-col overflow-hidden',
        'relative group cursor-pointer',
        'w-full h-full max-h-[85vh]',
        className
      )}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`View event: ${event.title}`}
    >
      {/* Event Image */}
      <div className="relative w-full flex-1 min-h-[60vh] max-h-[70vh] overflow-hidden">
      {imageUrl ? (
        <>
            <img src={imageUrl} alt={event.title} className="w-full h-full object-cover" />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(to top, rgba(14, 14, 14, 0.8) 0%, rgba(14, 14, 14, 0.4) 50%, transparent 100%)',
              }}
            />
            {reason && getReasonBadge()}
            {isCommunityPhoto && (
              <div className="absolute top-4 right-4 swift-ui-badge z-50" aria-hidden="true">
                <span className="swift-ui-badge-text">Community Photo</span>
              </div>
            )}
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
              {event.title}
            </p>
          </div>
        </div>
      )}
      </div>

      {/* Content Overlay */}
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
          {event.title}
          </h2>

          <div className="flex flex-col" style={{ gap: 'var(--spacing-inline, 6px)' }}>
            {event.venue_name && (
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
                  {event.venue_name}
                  {event.venue_city && ` · ${event.venue_city}`}
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
                  {formatDate(eventDate)}
                </span>
              </div>
            )}
        </div>

          {interestedCount > 0 && (
        <div
          style={{
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)',
                color: 'var(--neutral-600)',
          }}
        >
              {interestedCount} {interestedCount === 1 ? 'person' : 'people'} interested
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            {/* Interested toggle button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleInterestClick(e);
              }}
              className={cn(
                'swift-ui-button',
                isInterested ? 'swift-ui-button-primary' : 'swift-ui-button-secondary'
              )}
              aria-label={isInterested ? 'Remove interest' : 'Mark as interested'}
            >
              <span style={{ color: isInterested ? 'var(--neutral-50)' : 'var(--brand-pink-500)' }}>Interested</span>
              <Heart size={24} strokeWidth={2.5} style={{ color: isInterested ? 'var(--neutral-50)' : 'var(--brand-pink-500)' }} aria-hidden="true" />
            </button>

            {/* Share button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleShareClick(e);
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

