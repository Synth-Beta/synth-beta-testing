import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Users, Bookmark, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { TrendingEvent } from '@/services/homeFeedService';

interface TrendingEventsSectionProps {
  events: TrendingEvent[];
  onEventClick?: (eventId: string) => void;
  className?: string;
}

export const TrendingEventsSection: React.FC<TrendingEventsSectionProps> = ({
  events,
  onEventClick,
  className,
}) => {
  if (events.length === 0) return null;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-synth-pink" />
        <h2 className="text-lg sm:text-xl font-bold">Trending Near You</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {events.map((event) => (
          <Card
            key={event.event_id}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onEventClick?.(event.event_id)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm mb-1 truncate">{event.title}</h3>
                  <p className="text-xs text-muted-foreground mb-2">
                    {event.artist_name} · {event.venue_name}
                  </p>
                </div>
                {event.trending_label && (
                  <Badge variant="secondary" className="ml-2 flex-shrink-0">
                    {event.trending_label}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                {event.save_velocity > 0 && (
                  <div className="flex items-center gap-1">
                    <Bookmark className="h-3 w-3" />
                    <span>{event.save_velocity} saves</span>
                  </div>
                )}
                {event.attendance_markings > 0 && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{event.attendance_markings} going</span>
                  </div>
                )}
                {event.network_overlap > 0 && (
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    <span>{event.network_overlap} friends</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {format(new Date(event.event_date), 'MMM d, yyyy')}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

