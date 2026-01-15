import React, { useState, useEffect } from 'react';
import { HorizontalCarousel } from './HorizontalCarousel';
import { CompactEventCard } from './CompactEventCard';
import { BecauseYouLikeService, type BecauseYouLikeCarousel } from '@/services/becauseYouLikeService';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/Icon/Icon';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { supabase } from '@/integrations/supabase/client';
import { UserEventService } from '@/services/userEventService';
import type { JamBaseEvent } from '@/types/eventTypes';

interface BecauseYouLikeSectionProps {
  currentUserId: string;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
}

export const BecauseYouLikeSection: React.FC<BecauseYouLikeSectionProps> = ({
  currentUserId,
  onNavigateToProfile,
  onNavigateToChat,
}) => {
  const [carousels, setCarousels] = useState<BecauseYouLikeCarousel[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissedCarousels, setDismissedCarousels] = useState<Set<string>>(new Set());
  const [selectedEvent, setSelectedEvent] = useState<JamBaseEvent | null>(null);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [selectedEventInterested, setSelectedEventInterested] = useState(false);
  const [interestedEvents, setInterestedEvents] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadCarousels();
    loadInterestedEvents();
    loadDismissedCarousels();
  }, [currentUserId]);

  const loadInterestedEvents = async () => {
    try {
      const interestedSet = await UserEventService.getUserInterestedEventIdSet(currentUserId);
      setInterestedEvents(interestedSet);
    } catch (error) {
      console.error('Error loading interested events:', error);
    }
  };

  const loadDismissedCarousels = async () => {
    try {
      const { data: userPrefs } = await supabase
        .from('users')
        .select('dismissed_recommendations')
        .eq('user_id', currentUserId)
        .single();

      if (userPrefs?.dismissed_recommendations) {
        setDismissedCarousels(new Set(userPrefs.dismissed_recommendations as string[]));
      }
    } catch (error) {
      console.error('Error loading dismissed carousels:', error);
    }
  };

  const loadCarousels = async () => {
    setLoading(true);
    try {
      const allCarousels = await BecauseYouLikeService.getAllBecauseYouLike(currentUserId);
      setCarousels(allCarousels);
    } catch (error) {
      console.error('Error loading because you like carousels:', error);
      setCarousels([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async (carousel: BecauseYouLikeCarousel) => {
    try {
      const dismissalKey = `${carousel.type}:${carousel.title}`;
      setDismissedCarousels(prev => new Set(prev).add(dismissalKey));

      // Store dismissal in database
      const { data: userPrefs } = await supabase
        .from('users')
        .select('dismissed_recommendations')
        .eq('user_id', currentUserId)
        .single();

      const dismissed = (userPrefs?.dismissed_recommendations as string[]) || [];
      if (!dismissed.includes(dismissalKey)) {
        await supabase
          .from('users')
          .update({
            dismissed_recommendations: [...dismissed, dismissalKey],
          })
          .eq('user_id', currentUserId);
      }

      // Remove from carousels
      setCarousels(prev => prev.filter(c => c.title !== carousel.title));
    } catch (error) {
      console.error('Error dismissing carousel:', error);
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

  const visibleCarousels = carousels.filter(c => {
    const dismissalKey = `${c.type}:${c.title}`;
    return !dismissedCarousels.has(dismissalKey);
  });

  if (visibleCarousels.length === 0 && !loading) {
    return null;
  }

  return (
    <>
      <div className="space-y-6">
        {visibleCarousels.map((carousel) => (
          <div key={carousel.title} className="relative">
            <HorizontalCarousel
              title={carousel.title}
              items={carousel.events.slice(0, 10).map((event) => (
                <CompactEventCard
                  key={event.id}
                  event={event}
                  onClick={() => handleEventClick(event)}
                />
              ))}
              loading={loading}
              emptyMessage={`No events found for ${carousel.title}`}
            />
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-0 right-0"
              onClick={() => handleDismiss(carousel)}
            >
              <Icon name="x" size={16} color="var(--neutral-900)" />
            </Button>
          </div>
        ))}
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




















