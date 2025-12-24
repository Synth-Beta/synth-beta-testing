import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { JamBaseEvent } from '@/types/eventTypes';

interface CompactEventCardProps {
  event: JamBaseEvent;
  onClick?: () => void;
  socialProofCount?: number;
  reasonLabel?: string;
  className?: string;
}

export const CompactEventCard: React.FC<CompactEventCardProps> = ({
  event,
  onClick,
  socialProofCount,
  reasonLabel,
  className,
}) => {
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM d');
    } catch {
      return '';
    }
  };

  const imageUrl = event.images?.[0]?.url || event.poster_image_url;

  return (
    <Card
      className={cn(
        'w-[280px] cursor-pointer transition-all hover:shadow-lg overflow-hidden',
        className
      )}
      onClick={onClick}
    >
      {imageUrl && (
        <div className="w-full h-32 bg-gray-200 overflow-hidden">
          <img
            src={imageUrl}
            alt={event.title || event.artist_name || 'Event'}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <CardContent className="p-3">
        <h4 className="font-semibold text-sm mb-1 line-clamp-1">
          {event.title || event.artist_name || 'Event'}
        </h4>
        {event.artist_name && (
          <p className="text-xs text-muted-foreground mb-2">{event.artist_name}</p>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          {event.event_date && (
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>{formatDate(event.event_date)}</span>
            </div>
          )}
          {event.venue_name && (
            <div className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              <span className="line-clamp-1">{event.venue_name}</span>
            </div>
          )}
        </div>
        {(socialProofCount !== undefined || reasonLabel) && (
          <div className="flex items-center gap-2">
            {socialProofCount !== undefined && socialProofCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {socialProofCount} {socialProofCount === 1 ? 'person' : 'people'}
              </Badge>
            )}
            {reasonLabel && (
              <span className="text-xs text-muted-foreground">{reasonLabel}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

