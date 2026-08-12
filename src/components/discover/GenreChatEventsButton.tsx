import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { getUpcomingEventsForGenreChat } from '@synth/shared';
import { supabase } from '@/integrations/supabase/client';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { UserEventService } from '@/services/userEventService';
import { GENRE_CONFIGS } from '@/services/genreChatService';
import { resolveApproxUserLocation } from '@/hooks/useApproxUserLocation';
import { GenreShowsModal } from './GenreShowsModal';
import type { JamBaseEvent } from '@/types/eventTypes';

interface GenreChatEventsButtonProps {
  genreChatId: string;
  currentUserId: string;
}

/** Button inside a genre chat that opens a full-screen list of upcoming shows for that genre. */
export const GenreChatEventsButton: React.FC<GenreChatEventsButtonProps> = ({
  genreChatId,
  currentUserId,
}) => {
  const [events, setEvents] = useState<JamBaseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showsModalOpen, setShowsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<JamBaseEvent | null>(null);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [selectedEventInterested, setSelectedEventInterested] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void resolveApproxUserLocation()
      .then((near) =>
        getUpcomingEventsForGenreChat(
          supabase,
          genreChatId,
          10,
          near ? { latitude: near.latitude, longitude: near.longitude, radiusMiles: 25 } : undefined
        )
      )
      .then((rows) => {
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
      // Close the shows list while details are open — both are full-screen portaled modals,
      // and the list's higher z-index tier (DETAIL_MODAL_Z) would otherwise hide the event
      // details modal (EVENT_MODAL_Z) behind it even though both are technically mounted.
      setShowsModalOpen(false);
      setEventDetailsOpen(true);
    } catch (error) {
      console.error('Error opening event from genre chat shows:', error);
    }
  };

  if (!loading && events.length === 0) return null;

  const genre = GENRE_CONFIGS.find((g) => g.id === genreChatId);
  const label = genre
    ? `${genre.emoji} ${loading ? 'Upcoming' : events.length} Upcoming ${genre.name} Shows`
    : 'Upcoming Shows';

  return (
    <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--neutral-200)' }}>
      <button
        type="button"
        onClick={() => setShowsModalOpen(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          height: 'var(--size-button-height, 36px)',
          padding: '0 var(--spacing-small, 12px)',
          backgroundColor: 'var(--brand-pink-050)',
          border: 'var(--border-brand)',
          borderRadius: 'var(--radius-corner, 10px)',
          color: 'var(--brand-pink-500)',
          fontFamily: 'var(--font-family)',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <ChevronRight size={16} style={{ flexShrink: 0, color: 'var(--brand-pink-500)' }} />
      </button>

      <GenreShowsModal
        isOpen={showsModalOpen}
        onClose={() => setShowsModalOpen(false)}
        genre={genre}
        events={events}
        loading={loading}
        currentUserId={currentUserId}
        onEventClick={handleEventClick}
      />

      {eventDetailsOpen && selectedEvent && createPortal(
        <EventDetailsModal
          isOpen={eventDetailsOpen}
          onClose={() => {
            setEventDetailsOpen(false);
            setSelectedEvent(null);
            setShowsModalOpen(true);
          }}
          event={selectedEvent}
          currentUserId={currentUserId}
          isInterested={selectedEventInterested}
          onEventChange={(newEvent, isInterested) => {
            setSelectedEvent(newEvent);
            setSelectedEventInterested(isInterested ?? false);
          }}
        />,
        document.body
      )}
    </div>
  );
};
