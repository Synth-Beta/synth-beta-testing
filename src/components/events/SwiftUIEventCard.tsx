import React from 'react';
import { cn } from '@/lib/utils';
import { Calendar, MapPin, Clock, Ticket } from 'lucide-react';
import { format } from 'date-fns';

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

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-2xl overflow-hidden relative group',
        'transition-all duration-300 ease-out',
        className
      )}
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.1), 0 2px 8px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.6)',
        padding: '16px',
        cursor: onClick ? 'pointer' : 'default',
        outline: 'none',
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(-4px)';
          e.currentTarget.style.boxShadow = '0 12px 40px 0 rgba(0, 0, 0, 0.12), 0 4px 12px 0 rgba(0, 0, 0, 0.08), inset 0 1px 0 0 rgba(255, 255, 255, 0.8)';
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 8px 32px 0 rgba(0, 0, 0, 0.1), 0 2px 8px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.6)';
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
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
        className="absolute inset-0 pointer-events-none rounded-2xl"
        style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, transparent 50%, rgba(236, 72, 153, 0.02) 100%)',
        }}
      />

      <div className="relative z-10 flex flex-col gap-3">
        {/* Event Title */}
        <h3
          className="font-bold leading-tight line-clamp-2"
          style={{
            fontSize: '16px',
            fontFamily: 'var(--font-family)',
            color: 'var(--neutral-900)',
            minHeight: '44px',
          }}
        >
          {event.title}
        </h3>

        {/* Date and Time */}
        <div className="flex flex-col gap-1.5">
          {eventDate && (
            <div className="flex items-center gap-2">
              <Calendar
                size={14}
                className="flex-shrink-0"
                style={{ color: 'var(--brand-pink-500)' }}
              />
              <span
                className="font-semibold"
                style={{
                  fontSize: '14px',
                  fontFamily: 'var(--font-family)',
                  color: 'var(--neutral-700)',
                }}
              >
                {formatDate(eventDate)}
              </span>
            </div>
          )}
          {eventDate && (
            <div className="flex items-center gap-2">
              <Clock
                size={14}
                className="flex-shrink-0"
                style={{ color: 'var(--brand-pink-500)' }}
              />
              <span
                className="font-medium"
                style={{
                  fontSize: '13px',
                  fontFamily: 'var(--font-family)',
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
          <div className="flex flex-col gap-1.5 pt-1 border-t border-solid" style={{ borderColor: 'rgba(0, 0, 0, 0.08)' }}>
            {event.venue_name && (
              <div className="flex items-center gap-2">
                <MapPin
                  size={14}
                  className="flex-shrink-0"
                  style={{ color: 'var(--brand-pink-500)' }}
                />
                <span
                  className="font-semibold truncate"
                  style={{
                    fontSize: '14px',
                    fontFamily: 'var(--font-family)',
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
                className="font-medium pl-6"
                style={{
                  fontSize: '12px',
                  fontFamily: 'var(--font-family)',
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
          <div className="flex flex-wrap gap-1.5 pt-1">
            {event.genres.slice(0, 2).map((genre, index) => (
              <span
                key={index}
                className="inline-flex items-center px-2.5 py-1 rounded-lg"
                style={{
                  backgroundColor: 'rgba(236, 72, 153, 0.1)',
                  border: '1px solid rgba(236, 72, 153, 0.2)',
                  fontFamily: 'var(--font-family)',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: 'var(--brand-pink-600)',
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
          {event.ticket_available && event.ticket_urls && event.ticket_urls.length > 0 && (
            <a
              href={event.ticket_urls[0]}
              target="_blank"
              rel="noopener noreferrer"
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
          )}
        </div>
      </div>
    </button>
  );
};
