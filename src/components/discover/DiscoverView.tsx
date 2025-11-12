import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RedesignedSearchPage } from '@/components/search/RedesignedSearchPage';
import { UnifiedFeed } from '@/components/UnifiedFeed';
import { Card, CardContent } from '@/components/ui/card';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { UserEventService } from '@/services/userEventService';
import { supabase } from '@/integrations/supabase/client';
import type { EventSearchResult } from '@/components/search/RedesignedSearchPage';

interface DiscoverViewProps {
  currentUserId: string;
  onBack: () => void;
  onNavigateToNotifications?: () => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
  onViewChange?: (view: 'feed' | 'search' | 'profile') => void;
}

export const DiscoverView: React.FC<DiscoverViewProps> = ({
  currentUserId,
  onBack,
  onNavigateToNotifications,
  onNavigateToProfile,
  onNavigateToChat,
  onViewChange,
}) => {
  const navigate = useNavigate();
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [selectedEventInterested, setSelectedEventInterested] = useState<boolean>(false);

  const handleEventClick = async (event: EventSearchResult) => {
    // Convert EventSearchResult to event format expected by EventDetailsModal
    // We need to fetch the full event data from the database
    try {
      const { data, error } = await supabase
        .from('jambase_events')
        .select('*')
        .eq('id', event.id)
        .single();

      if (error || !data) {
        // If not found in jambase_events, try to construct a basic event object
        const basicEvent = {
          id: event.id,
          event_name: event.title || event.artistName || 'Event',
          artist_name: event.artistName || '',
          venue_name: event.venueName || '',
          event_date: event.eventDate || new Date().toISOString(),
          image_url: event.imageUrl || null,
        };
        setSelectedEvent(basicEvent);
        setSelectedEventInterested(false);
        setEventDetailsOpen(true);
        return;
      }

      setSelectedEvent(data);
      try {
        const interested = await UserEventService.isUserInterested(currentUserId, data.id);
        setSelectedEventInterested(interested);
      } catch {
        setSelectedEventInterested(false);
      }
      setEventDetailsOpen(true);
    } catch (error) {
      console.error('Error fetching event details:', error);
      // Fallback: create a basic event object
      const basicEvent = {
        id: event.id,
        event_name: event.title || event.artistName || 'Event',
        artist_name: event.artistName || '',
        venue_name: event.venueName || '',
        event_date: event.eventDate || new Date().toISOString(),
        image_url: event.imageUrl || null,
      };
      setSelectedEvent(basicEvent);
      setSelectedEventInterested(false);
      setEventDetailsOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <Card className="border-none bg-gradient-to-br from-rose-50 via-white to-amber-50 shadow-sm">
          <CardContent className="p-6 space-y-6">
            <div className="space-y-2">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-synth-black">
                Discover
              </h1>
              <p className="text-synth-black/70 max-w-2xl">
                Search artists, events, and venues, then browse a personalized lineup tailored to your taste.
              </p>
            </div>

            <div className="bg-white/85 rounded-2xl border border-white/60 shadow-inner p-4 md:p-6">
              <RedesignedSearchPage
                userId={currentUserId}
                allowedTabs={['artists', 'events', 'venues']}
                showMap={false}
                layout="compact"
                mode="embedded"
                headerTitle="Search artists, events, venues, or friends"
                headerDescription="Live results update as you type. Tap any result to dive deeper."
                onNavigateToProfile={onNavigateToProfile}
                onNavigateToChat={onNavigateToChat}
                onEventClick={handleEventClick}
              />
            </div>
          </CardContent>
        </Card>

        <UnifiedFeed
          currentUserId={currentUserId}
          onBack={onBack}
          onViewChange={onViewChange}
          onNavigateToNotifications={onNavigateToNotifications}
          onNavigateToProfile={onNavigateToProfile}
          onNavigateToChat={onNavigateToChat}
          headerTitle="Upcoming for you"
          headerSubtitle="A rolling list of events based on artists you follow and where your friends are going next."
          visibleSections={['events']}
          enableMap={false}
          showSectionTabs={false}
        />
      </div>

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
          onInterestToggle={async (eventId, interested) => {
            try {
              await UserEventService.setEventInterest(currentUserId, eventId, interested);
              setSelectedEventInterested(interested);
            } catch (error) {
              console.error('Error toggling interest:', error);
            }
          }}
          onReview={() => {
            // Handle review action if needed
            console.log('Review event:', selectedEvent.id);
          }}
          onNavigateToProfile={onNavigateToProfile}
          onNavigateToChat={onNavigateToChat}
        />
      )}
    </div>
  );
};

