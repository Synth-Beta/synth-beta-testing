import React from 'react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Calendar, MapPin, Plus, Send } from 'lucide-react';

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
  onInterestClick?: (e: React.MouseEvent) => void;
  onShareClick?: (e: React.MouseEvent) => void;
  onClick?: () => void;
  className?: string;
}

export const CompactEventCard: React.FC<CompactEventCardProps> = ({
  event,
  interestedCount = 0,
  isInterested = false,
  onInterestClick,
  onShareClick,
  onClick,
  className,
}) => {
  const imageUrl = event.poster_image_url || event.image_url;
  const eventDate = event.event_date ? new Date(event.event_date) : null;

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg overflow-hidden',
        'bg-gray-100 hover:shadow-lg transition-all duration-200',
        'relative group',
        className
      )}
    >
      {/* Event Image */}
      <div
        onClick={onClick}
        className="relative w-full aspect-square cursor-pointer"
      >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={event.title}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-synth-pink/20 to-synth-pink/40 flex items-center justify-center">
          <div className="text-center px-2">
            <p className="text-xs font-semibold text-synth-pink line-clamp-2">
              {event.title}
            </p>
          </div>
        </div>
      )}

        {/* Overlay with event info on hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="absolute bottom-0 left-0 right-0 p-2 text-white">
          <p className="text-xs font-semibold line-clamp-1 mb-1">{event.title}</p>
          {event.artist_name && (
            <p className="text-[10px] opacity-90 line-clamp-1">{event.artist_name}</p>
          )}
          {eventDate && (
            <p className="text-[10px] opacity-75 mt-1">
              {format(eventDate, 'MMM d')}
            </p>
          )}
          </div>
        </div>
      </div>

      {/* Event title */}
      <div className="px-2 pt-2 pb-1 bg-white">
        <p className="text-sm font-semibold text-[#0e0e0e] line-clamp-2 leading-tight">
          {event.title}
        </p>
      </div>

      {/* Footer with interested count and action buttons */}
      <div className="flex items-center justify-between px-2 pb-2 bg-white">
        {/* Interested count on the left */}
        <div className="text-sm text-[#0e0e0e] font-normal">
          {interestedCount} interested
        </div>

        {/* Action buttons on the right */}
        <div className="flex items-center gap-3">
          {/* Share button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShareClick?.(e);
            }}
            className="p-1.5 rounded transition-colors bg-transparent text-[#0e0e0e] hover:bg-gray-100"
            aria-label="Share event"
          >
            <Send className="w-5 h-5" strokeWidth={2} />
          </button>

          {/* Interest button - moved to the right */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInterestClick?.(e);
            }}
            className={cn(
              'p-1.5 rounded transition-colors',
              isInterested 
                ? 'bg-[#b00056] text-white' 
                : 'bg-transparent text-[#0e0e0e] hover:bg-gray-100'
            )}
            aria-label={isInterested ? 'Remove interest' : 'Mark as interested'}
          >
            <Plus className={cn('w-5 h-5', isInterested && 'rotate-45')} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
};

