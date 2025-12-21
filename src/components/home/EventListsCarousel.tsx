import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FigmaEventCard } from '@/components/cards/FigmaEventCard';
import type { EventList } from '@/services/homeFeedService';

interface EventListsCarouselProps {
  lists: EventList[];
  onEventClick?: (eventId: string) => void;
  className?: string;
}

export const EventListsCarousel: React.FC<EventListsCarouselProps> = ({
  lists,
  onEventClick,
  className,
}) => {
  if (lists.length === 0) return null;

  return (
    <div className={cn('space-y-6', className)}>
      {lists.map((list) => (
        <div key={list.id}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold">{list.title}</h2>
                {list.list_type === 'system_generated' && (
                  <Sparkles className="h-4 w-4 text-synth-pink" />
                )}
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">{list.description}</p>
            </div>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
            {list.events.map((event) => (
              <div key={event.id} className="flex-shrink-0 w-[280px] sm:w-[320px]">
                <FigmaEventCard
                  event={{
                    id: event.id,
                    title: event.title || event.artist_name || 'Event',
                    artist_name: event.artist_name,
                    venue_name: event.venue_name,
                    venue_city: event.venue_city || undefined,
                    event_date: event.event_date,
                    price_range: event.price_range || undefined,
                  }}
                  onClick={() => onEventClick?.(event.id)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

