import React from 'react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Calendar, MapPin } from 'lucide-react';

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
  onClick?: () => void;
  className?: string;
}

export const CompactEventCard: React.FC<CompactEventCardProps> = ({
  event,
  onClick,
  className,
}) => {
  const imageUrl = event.poster_image_url || event.image_url;
  const eventDate = event.event_date ? new Date(event.event_date) : null;

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden cursor-pointer',
        'bg-gray-100 hover:shadow-lg transition-all duration-200',
        'relative group',
        className
      )}
    >
      {/* Event Image */}
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

      {/* Overlay with event info */}
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

      {/* Bottom info bar (always visible) */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm p-1.5">
        <p className="text-[10px] font-medium text-white line-clamp-1 truncate">
          {event.title}
        </p>
      </div>
    </div>
  );
};

