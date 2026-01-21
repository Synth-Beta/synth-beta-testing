import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/Icon/Icon';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { JamBaseEvent } from '@/types/eventTypes';
import { replaceJambasePlaceholder } from '@/utils/eventImageFallbacks';
import { JamBaseAttribution } from '@/components/attribution';
import { getCompliantEventLink } from '@/utils/jambaseLinkUtils';
import { Ticket, ExternalLink } from 'lucide-react';

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

  const rawImageUrl = event.images?.[0]?.url || (event as any).event_media_url || (event as any).media_urls?.[0];
  const imageUrl = rawImageUrl ? replaceJambasePlaceholder(rawImageUrl) : null;

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
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2 flex-wrap">
          {event.event_date && (
            <div className="flex items-center gap-1">
              <Icon name="calendar" size={16} />
              <span>{formatDate(event.event_date)}</span>
            </div>
          )}
          {(event.venue_city || event.venue_state) && (
            <div className="flex items-center gap-1">
              <Icon name="location" size={16} />
              <span className="line-clamp-1">
                {event.venue_city 
                  ? (event.venue_state ? `${event.venue_city}, ${event.venue_state}` : event.venue_city)
                  : event.venue_state || ''}
              </span>
            </div>
          )}
          {(event.price_min || event.price_max || event.price_range) && (
            <div className="flex items-center gap-1 text-xs font-medium text-foreground">
              {event.price_range || (
                event.price_min && event.price_max
                  ? `$${event.price_min}${event.price_min !== event.price_max ? `-$${event.price_max}` : ''}`
                  : event.price_min
                  ? `$${event.price_min}+`
                  : event.price_max
                  ? `Up to $${event.price_max}`
                  : ''
              )}
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

        {/* Ticket Link */}
        {(() => {
          const eventLink = getCompliantEventLink(event);
          if (!eventLink) return null;
          return (
            <div className="pt-2">
              <a
                href={eventLink}
                target="_blank"
                rel="nofollow noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline"
                style={{
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-meta-size, 14px)',
                  fontWeight: 'var(--typography-meta-weight, 500)',
                  lineHeight: 'var(--typography-meta-line-height, 1.5)',
                }}
              >
                <Ticket className="w-3 h-3" />
                <span>Tickets</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          );
        })()}

        {/* JamBase Attribution */}
        <div className="pt-2 mt-2 border-t border-gray-100">
          <JamBaseAttribution variant="inline" />
        </div>
      </CardContent>
    </Card>
  );
};

