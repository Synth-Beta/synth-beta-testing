import React, { useEffect, useState } from 'react';
import { getUpcomingEventsForGenreChat } from '@synth/shared';
import { supabase } from '@/integrations/supabase/client';
import { HorizontalCarousel } from './HorizontalCarousel';
import { CompactEventCard } from './CompactEventCard';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { UserEventService } from '@/services/userEventService';
import { GENRE_CONFIGS } from '@/services/genreChatService';
import type { JamBaseEvent } from '@/types/eventTypes';

interface GenreChatEventsRailProps {
  genreChatId: string;
  currentUserId: string;
}

/** Persistent "Upcoming Shows" strip inside a genre chat, matched via GENRE_CHAT_TAG_MAP. */
export const GenreChatEventsRail: React.FC<GenreChatEventsRailProps> = ({
  genreChatId,
  currentUserId,
}) => {
  const [events, setEvents] = useState<JamBaseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<JamBaseEvent | null>(null);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [selectedEventInterested, setSelectedEventInterested] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getUpcomingEventsForGenreChat(supabase, genreChatId, 10).then((rows) => {
      if (!cancelled) {
        setEvents(rows as unknown as JamBaseEvent[]);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [genreChatId]);

  const handleEventClick = async (event: JamBaseEvent) => {
    try {
      const interested = await UserEventService.isUserInterested(currentUserId, event.id);
      setSelectedEvent(event);
      setSelectedEventInterested(interested);
      setEventDetailsOpen(true);
    } catch (error) {
      console.error('Error opening event from genre chat rail:', error);
    }
  };

  if (!loading && events.length === 0) return null;

  const genre = GENRE_CONFIGS.find((g) => g.id === genreChatId);
  const title = genre ? `${genre.emoji} Upcoming ${genre.name} Shows` : 'Upcoming Shows';

  return (
    <div style={{ borderBottom: '1px solid var(--neutral-200)', paddingBottom: 'var(--spacing-small, 12px)' }}>
      <HorizontalCarousel
        title={title}
        items={events.map((event) => (
          <CompactEventCard key={event.id} event={event} onClick={() => handleEventClick(event)} />
        ))}
        loading={loading}
        emptyMessage="No upcoming shows found for this genre yet"
      />

      {eventDetailsOpen && selectedEvent && (
        <EventDetailsModal
          isOpen={eventDetailsOpen}
          onClose={() => {
            setEventDetailsOpen(false);
            setSelectedEvent(null);
          }}
          event={selectedEvent}
          currentUserId={currentUserId}
          isInterested={selectedEventInterested}
          onEventChange={(newEvent, isInterested) => {
            setSelectedEvent(newEvent);
            setSelectedEventInterested(isInterested ?? false);
          }}
        />
      )}
    </div>
  );
};
