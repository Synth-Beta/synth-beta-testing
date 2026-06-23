import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { UserEventService } from '@/services/userEventService';

export function useEventDetailsFromVenue(userId: string | undefined) {
  const [selectedEventFromVenue, setSelectedEventFromVenue] = useState<any>(null);
  const [eventDetailsFromVenueOpen, setEventDetailsFromVenueOpen] = useState(false);
  const [selectedEventFromVenueInterested, setSelectedEventFromVenueInterested] = useState(false);

  const handleEventClickFromVenue = useCallback(async (eventId: string) => {
    if (!eventId || !userId) return;
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*, artists(name), venues(name)')
        .eq('id', eventId)
        .single();

      if (!error && data) {
        const normalizedEvent = {
          ...data,
          artist_name: (data.artists as any)?.name || data.artist_name || null,
          venue_name: (data.venues as any)?.name || data.venue_name || null,
        };
        setSelectedEventFromVenue(normalizedEvent);
        const interested = await UserEventService.isUserInterested(userId, eventId);
        setSelectedEventFromVenueInterested(interested);
        setEventDetailsFromVenueOpen(true);
      }
    } catch (err) {
      console.error('Error opening event from venue:', err);
    }
  }, [userId]);

  return {
    selectedEventFromVenue,
    setSelectedEventFromVenue,
    eventDetailsFromVenueOpen,
    setEventDetailsFromVenueOpen,
    selectedEventFromVenueInterested,
    setSelectedEventFromVenueInterested,
    handleEventClickFromVenue,
  };
}
