import React, { useState, useEffect } from 'react';
import { HorizontalCarousel } from './HorizontalCarousel';
import { CompactEventCard } from './CompactEventCard';
import { RightNowService, type RightNowData } from '@/services/rightNowService';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { UserEventService } from '@/services/userEventService';
import { supabase } from '@/integrations/supabase/client';
import type { JamBaseEvent } from '@/types/eventTypes';

interface RightNowSectionProps {
  currentUserId: string;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
}

export const RightNowSection: React.FC<RightNowSectionProps> = ({
  currentUserId,
  onNavigateToProfile,
  onNavigateToChat,
}) => {
  const [data, setData] = useState<RightNowData>({
    trending: [],
    justAnnounced: [],
    friendsSaving: [],
  });
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<JamBaseEvent | null>(null);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [selectedEventInterested, setSelectedEventInterested] = useState(false);
  const [interestedEvents, setInterestedEvents] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
    loadInterestedEvents();
  }, [currentUserId]);

  const loadInterestedEvents = async () => {
    try {
      const { data } = await supabase
        .from('user_event_relationships')
        .select('event_id')
        .eq('user_id', currentUserId)
        .eq('relationship_type', 'interest');

      if (data) {
        setInterestedEvents(new Set(data.map(r => r.event_id)));
      }
    } catch (error) {
      console.error('Error loading interested events:', error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // Get user location
      const { data: userProfile } = await supabase
        .from('users')
        .select('latitude, longitude')
        .eq('user_id', currentUserId)
        .single();

      const rightNowData = await RightNowService.getAllRightNowData(
        currentUserId,
        userProfile?.latitude,
        userProfile?.longitude
      );

      setData(rightNowData);
    } catch (error) {
      console.error('Error loading right now data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEventClick = async (event: JamBaseEvent) => {
    try {
      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('id', event.id)
        .single();

      if (data) {
        setSelectedEvent(data);
        const interested = await UserEventService.isUserInterested(currentUserId, data.id);
        setSelectedEventInterested(interested);
        setEventDetailsOpen(true);
      } else {
        setSelectedEvent(event);
        setSelectedEventInterested(interestedEvents.has(event.id || ''));
        setEventDetailsOpen(true);
      }
    } catch (error) {
      console.error('Error fetching event details:', error);
      setSelectedEvent(event);
      setSelectedEventInterested(interestedEvents.has(event.id || ''));
      setEventDetailsOpen(true);
    }
  };

  const handleInterestToggle = async (eventId: string, interested: boolean) => {
    try {
      await UserEventService.setEventInterest(currentUserId, eventId, interested);
      setInterestedEvents(prev => {
        const next = new Set(prev);
        if (interested) {
          next.add(eventId);
        } else {
          next.delete(eventId);
        }
        return next;
      });
      setSelectedEventInterested(interested);
    } catch (error) {
      console.error('Error toggling interest:', error);
    }
  };

  // Only show sections that have data
  const hasData = data.trending.length > 0 || data.justAnnounced.length > 0 || data.friendsSaving.length > 0;

  if (!hasData && !loading) {
    return null;
  }

  return (
    <>
      <div className="space-y-6">
        {data.trending.length > 0 && (
          <HorizontalCarousel
            title="Trending Near You"
            description="Events gaining momentum in your area"
            items={data.trending.map((event) => (
              <CompactEventCard
                key={event.id}
                event={event}
                onClick={() => handleEventClick(event)}
                socialProofCount={event.socialProofCount}
                reasonLabel={event.reasonLabel}
              />
            ))}
            loading={loading}
            emptyMessage="No trending events right now"
          />
        )}

        {data.justAnnounced.length > 0 && (
          <HorizontalCarousel
            title="Just Announced"
            description="Recently added events"
            items={data.justAnnounced.map((event) => (
              <CompactEventCard
                key={event.id}
                event={event}
                onClick={() => handleEventClick(event)}
                socialProofCount={event.socialProofCount}
                reasonLabel={event.reasonLabel}
              />
            ))}
            loading={loading}
            emptyMessage="No new announcements"
          />
        )}

        {data.friendsSaving.length > 0 && (
          <HorizontalCarousel
            title="Friends Are Saving"
            description="Events your friends are interested in"
            items={data.friendsSaving.map((event) => (
              <CompactEventCard
                key={event.id}
                event={event}
                onClick={() => handleEventClick(event)}
                socialProofCount={event.socialProofCount}
                reasonLabel={event.reasonLabel}
              />
            ))}
            loading={loading}
            emptyMessage="No friends saving events"
          />
        )}
      </div>

      {/* Event Details Modal */}
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
          onInterestToggle={handleInterestToggle}
          onReview={() => {
            console.log('Review event:', selectedEvent.id);
          }}
          onNavigateToProfile={onNavigateToProfile}
          onNavigateToChat={onNavigateToChat}
        />
      )}
    </>
  );
};



