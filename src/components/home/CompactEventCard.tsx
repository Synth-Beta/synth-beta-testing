import React from 'react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Calendar, MapPin, Send, Check } from 'lucide-react';
import { replaceJambasePlaceholder } from '@/utils/eventImageFallbacks';

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
  onInterestClick,
  onShareClick,
  onClick,
  className,
}) => {
  const rawImageUrl = event.poster_image_url || event.image_url;
  const imageUrl = rawImageUrl ? replaceJambasePlaceholder(rawImageUrl) : null;
  const eventDate = event.event_date ? new Date(event.event_date) : null;

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg overflow-hidden',
        'hover:shadow-lg transition-all duration-200',
        'relative group cursor-pointer',
        className
      )}
      style={{ 
        backgroundColor: 'var(--neutral-100)',
        border: '1px solid var(--neutral-200)'
      }}
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
      {/* Event Image */}
      <div
        className="relative w-full aspect-square"
        style={{ outline: 'none' }}
      >
      {imageUrl ? (
        <>
          <img
            src={imageUrl}
            alt={event.title}
            className="w-full h-full object-cover"
          />
          {/* Community Photo Tag - ACCESSIBILITY: Decorative, hide from screen readers */}
          {isCommunityPhoto && (
            <div
              className="absolute top-2 right-2 flex items-center"
              aria-hidden="true"
              style={{
                display: 'flex',
                height: '22px',
                paddingLeft: 'var(--spacing-small, 12px)',
                paddingRight: 'var(--spacing-small, 12px)',
                alignItems: 'center',
                gap: 'var(--spacing-small, 12px)',
                borderRadius: '10px',
                background: 'var(--neutral-50)',
                boxShadow: '0 4px 4px 0 var(--shadow-color)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-meta-size, 16px)',
                  fontWeight: 'var(--typography-medium-weight, 500)',
                  color: 'var(--neutral-900)',
                  lineHeight: '1',
                  whiteSpace: 'nowrap',
                }}
              >
                Community Photo
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: 'var(--neutral-100)' }}>
          {/* TODO: Replace gradient with approved gradient token or neutral background */}
          <div className="text-center px-2">
            <p className="text-xs font-semibold line-clamp-2" style={{ color: 'var(--brand-pink-500)' }}>
              {event.title}
            </p>
          </div>
        </div>
      )}
      </div>

      <div
        className="px-2"
        style={{
          backgroundColor: 'var(--neutral-50)',
          paddingTop: 'var(--spacing-small, 12px)',
          paddingBottom: 'var(--spacing-small, 12px)',
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1
        }}
      >
        {/* Event title */}
        <p className="text-sm font-semibold line-clamp-2 leading-tight" style={{ 
          fontFamily: 'var(--font-family)',
          fontSize: 'var(--typography-body-size, 20px)',
          fontWeight: 'var(--typography-body-weight, 500)',
          lineHeight: 'var(--typography-body-line-height, 1.5)',
          color: 'var(--neutral-900)',
          marginBottom: 'var(--spacing-inline, 6px)'
        }}>
          {event.title}
        </p>

        {/* Interested count */}
        <div style={{
          fontFamily: 'var(--font-family)',
          fontSize: 'var(--typography-meta-size, 16px)',
          fontWeight: 'var(--typography-meta-weight, 500)',
          lineHeight: 'var(--typography-meta-line-height, 1.5)',
          color: 'var(--neutral-600)'
        }}>
          {interestedCount} interested
        </div>

        {/* Actions (Interested left, Share right) */}
        <div
          className="flex items-center justify-between"
          style={{
            width: '100%',
            marginTop: 'auto',
            paddingTop: 'var(--spacing-small, 12px)'
          }}
        >
          {/* Interested toggle button (left-aligned) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInterestClick?.(e);
            }}
            style={{
              height: 'var(--size-button-height, 36px)',
              paddingLeft: 'var(--spacing-small, 12px)',
              paddingRight: 'var(--spacing-small, 12px)',
              borderRadius: 'var(--radius-corner, 10px)',
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-meta-size, 16px)',
              fontWeight: 'var(--typography-meta-weight, 500)',
              lineHeight: 'var(--typography-meta-line-height, 1.5)',
              border: isInterested ? 'none' : '2px solid var(--brand-pink-500)',
              backgroundColor: isInterested ? 'var(--brand-pink-500)' : 'var(--neutral-50)',
              color: isInterested ? 'var(--neutral-50)' : 'var(--brand-pink-500)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 4px 0 var(--shadow-color)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-inline, 6px)'
            }}
            onMouseEnter={(e) => {
              if (!isInterested) {
                e.currentTarget.style.backgroundColor = 'var(--brand-pink-050)';
                e.currentTarget.style.borderColor = 'var(--brand-pink-600)';
              } else {
                e.currentTarget.style.backgroundColor = 'var(--brand-pink-600)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isInterested) {
                e.currentTarget.style.backgroundColor = 'var(--neutral-50)';
                e.currentTarget.style.borderColor = 'var(--brand-pink-500)';
              } else {
                e.currentTarget.style.backgroundColor = 'var(--brand-pink-500)';
              }
            }}
            aria-label={isInterested ? 'Remove interest' : 'Mark as interested'}
          >
            Interested
            {isInterested && (
              <Check 
                size={16} 
                style={{ 
                  color: 'var(--neutral-50)',
                  flexShrink: 0
                }} 
                aria-hidden="true"
              />
            )}
          </button>

          {/* Share button (right-aligned, secondary) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShareClick?.(e);
            }}
            style={{
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderRadius: 'var(--radius-corner, 10px)',
              color: 'var(--neutral-900)',
              transition: 'background-color 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--brand-pink-050)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            aria-label="Share event"
          >
            <Send size={24} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
};

