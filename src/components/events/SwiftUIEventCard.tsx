import React from 'react';
import { cn } from '@/lib/utils';
import { Calendar, MapPin, Clock, Ticket } from 'lucide-react';
import { format } from 'date-fns';
import { trackInteraction } from '@/services/interactionTrackingService';
import { getEventUuid, getEventMetadata } from '@/utils/entityUuidResolver';
import { getCompliantEventLink } from '@/utils/jambaseLinkUtils';

interface SwiftUIEventCardProps {
  event: {
    id: string;
    title: string;
    event_date: string;
    venue_name?: string;
    venue_city?: string;
    venue_state?: string;
    doors_time?: string | null;
    price_range?: string | null;
    ticket_urls?: string[] | null;
    ticket_available?: boolean;
    genres?: string[];
  };
  onClick?: () => void;
  className?: string;
}

export const SwiftUIEventCard: React.FC<SwiftUIEventCardProps> = ({
  event,
  onClick,
  className,
}) => {
  const eventDate = event.event_date ? new Date(event.event_date) : null;
  const doorsTime = event.doors_time ? new Date(event.doors_time) : null;

  const formatDate = (date: Date | null) => {
    if (!date) return '';
    return format(date, 'EEE, MMM d');
  };

  const formatTime = (date: Date | null) => {
    if (!date) return '';
    return format(date, 'h:mm a');
  };

  const getLocationString = () => {
    const parts = [event.venue_city, event.venue_state].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Location TBD';
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
          { ...metadata, source: 'event_card' },
          eventUuid || undefined
        );
      } catch (error) {
        console.error('Error tracking event card click:', error);
      }
      onClick();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'w-full text-left overflow-hidden relative group',
        'transition-all duration-300 ease-out',
        className
      )}
      style={{
        backgroundColor: 'color-mix(in srgb, var(--neutral-0) 85%, transparent)',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        border: '1px solid color-mix(in srgb, var(--neutral-0) 30%, transparent)',
        boxShadow: '0 4px 4px 0 var(--shadow-color), inset 0 1px 0 0 color-mix(in srgb, var(--neutral-0) 60%, transparent)',
        padding: 'var(--spacing-small, 12px)',
        borderRadius: 'var(--radius-corner, 10px)',
        cursor: onClick ? 'pointer' : 'default',
        outline: 'none',
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(-4px)';
          e.currentTarget.style.boxShadow = '0 12px 40px 0 rgba(0, 0, 0, 0.12), 0 4px 12px 0 rgba(0, 0, 0, 0.08), inset 0 1px 0 0 rgba(255, 255, 255, 0.8)';
          // Use color-mix() to match initial backgroundColor syntax
          e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--neutral-0) 95%, transparent)';
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 8px 32px 0 rgba(0, 0, 0, 0.1), 0 2px 8px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.6)';
          // Use color-mix() to match initial backgroundColor syntax
          e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--neutral-0) 85%, transparent)';
        }
      }}
      onMouseDown={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(-2px) scale(0.98)';
        }
      }}
      onMouseUp={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(-4px) scale(1)';
        }
      }}
      aria-label={`View event: ${event.title}`}
    >
      {/* Glass overlay gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: 'var(--radius-corner, 10px)',
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--neutral-0) 12%, transparent) 0%, transparent 50%, color-mix(in srgb, var(--brand-pink-050) 20%, transparent) 100%)',
        }}
      />

      <div className="relative z-10 flex flex-col" style={{ gap: 'var(--spacing-small, 12px)' }}>
        {/* Event Title */}
        <h3
          className="font-bold leading-tight line-clamp-2"
          style={{
            fontSize: 'var(--typography-meta-size, 16px)',
            fontFamily: 'var(--font-family)',
            fontWeight: 'var(--typography-meta-weight, 500)',
            lineHeight: 'var(--typography-meta-line-height, 1.5)',
            color: 'var(--neutral-900)',
          }}
        >
          {event.title}
        </h3>

        {/* Date and Time */}
        <div className="flex flex-col" style={{ gap: 'var(--spacing-inline, 6px)' }}>
          {eventDate && (
            <div className="flex items-center" style={{ gap: 'var(--spacing-inline, 6px)' }}>
              <Calendar
                size={14}
                className="flex-shrink-0"
                style={{ color: 'var(--brand-pink-500)' }}
              />
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
          {eventDate && (
            <div className="flex items-center" style={{ gap: 'var(--spacing-inline, 6px)' }}>
              <Clock
                size={14}
                className="flex-shrink-0"
                style={{ color: 'var(--brand-pink-500)' }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-meta-size, 16px)',
                  fontWeight: 'var(--typography-meta-weight, 500)',
                  lineHeight: 'var(--typography-meta-line-height, 1.5)',
                  color: 'var(--neutral-600)',
                }}
              >
                {formatTime(eventDate)}
                {doorsTime && ` • Doors: ${formatTime(doorsTime)}`}
              </span>
            </div>
          )}
        </div>

        {/* Venue and Location */}
        {(event.venue_name || event.venue_city || event.venue_state) && (
          <div
            className="flex flex-col pt-1 border-t border-solid"
            style={{
              gap: 'var(--spacing-inline, 6px)',
              borderColor: 'var(--neutral-200)',
            }}
          >
            {event.venue_name && (
              <div className="flex items-center" style={{ gap: 'var(--spacing-inline, 6px)' }}>
                <MapPin
                  size={14}
                  className="flex-shrink-0"
                  style={{ color: 'var(--brand-pink-500)' }}
                />
                <span
                  className="truncate"
                  style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)',
                    color: 'var(--neutral-700)',
                  }}
                  title={event.venue_name}
                >
                  {event.venue_name}
                </span>
              </div>
            )}
            {(event.venue_city || event.venue_state) && (
              <span
                style={{
                  paddingLeft: 'calc(var(--spacing-inline, 6px) * 2)',
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-meta-size, 16px)',
                  fontWeight: 'var(--typography-meta-weight, 500)',
                  lineHeight: 'var(--typography-meta-line-height, 1.5)',
                  color: 'var(--neutral-600)',
                }}
              >
                {getLocationString()}
              </span>
            )}
          </div>
        )}

        {/* Genres */}
        {event.genres && event.genres.length > 0 && (
          <div className="flex flex-wrap pt-1" style={{ gap: 'var(--spacing-inline, 6px)' }}>
            {event.genres.slice(0, 2).map((genre, index) => (
              <span
                key={index}
                className="inline-flex items-center"
                style={{
                  height: '25px',
                  paddingLeft: 'var(--spacing-small, 12px)',
                  paddingRight: 'var(--spacing-small, 12px)',
                  borderRadius: '999px',
                  backgroundColor: 'var(--brand-pink-050)',
                  border: '2px solid var(--brand-pink-500)',
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-meta-size, 16px)',
                  fontWeight: 'var(--typography-meta-weight, 500)',
                  lineHeight: 'var(--typography-meta-line-height, 1.5)',
                  color: 'var(--brand-pink-500)',
                }}
              >
                {genre}
              </span>
            ))}
          </div>
        )}

        {/* Price and Ticket */}
        <div className="flex items-center justify-between pt-1 border-t border-solid" style={{ borderColor: 'rgba(0, 0, 0, 0.08)' }}>
          {event.price_range ? (
            <span
              className="font-semibold"
              style={{
                fontSize: '14px',
                fontFamily: 'var(--font-family)',
                color: 'var(--neutral-900)',
              }}
            >
              {(() => {
                // Remove any leading dollar signs, then add exactly one
                const cleaned = event.price_range.replace(/^\$+/, '');
                return `$${cleaned}`;
              })()}
            </span>
          ) : (
            <span
              className="font-medium"
              style={{
                fontSize: '13px',
                fontFamily: 'var(--font-family)',
                color: 'var(--neutral-500)',
              }}
            >
              Price TBD
            </span>
          )}
          {(() => {
            const eventLink = getCompliantEventLink(event);
            if (!eventLink) return null;
            return (
              <a
                href={eventLink}
                target="_blank"
                rel="nofollow noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all"
              style={{
                backgroundColor: 'var(--brand-pink-500)',
                color: 'white',
                fontSize: '12px',
                fontFamily: 'var(--font-family)',
                boxShadow: '0 2px 8px rgba(236, 72, 153, 0.3)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--brand-pink-600)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--brand-pink-500)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <Ticket size={12} />
              <span>Buy</span>
            </a>
            );
          })()}
        </div>
      </div>
    </button>
  );
};
