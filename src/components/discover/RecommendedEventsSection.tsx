import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { JamBaseEventCard } from '@/components/events/JamBaseEventCard';
import { Loader2 } from 'lucide-react';
import { UnifiedEventSearchService, type UnifiedEvent } from '@/services/unifiedEventSearchService';
import { SimpleEventRecommendationService } from '@/services/simpleEventRecommendationService';
import { UserEventService } from '@/services/userEventService';
import { supabase } from '@/integrations/supabase/client';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';

interface RecommendedEventsSectionProps {
  currentUserId: string;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
}

export const RecommendedEventsSection: React.FC<RecommendedEventsSectionProps> = ({
  currentUserId,
  onNavigateToProfile,
  onNavigateToChat,
}) => {
  const [recommendedEvents, setRecommendedEvents] = useState<UnifiedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [selectedEventInterested, setSelectedEventInterested] = useState<boolean>(false);
  const [interestedEvents, setInterestedEvents] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadRecommendedEvents();
    loadInterestedEvents();
  }, [currentUserId]);

  const loadInterestedEvents = async () => {
    try {
      const { data } = await supabase
        .from('user_event_relationships')
        .select('event_id')
        .eq('user_id', currentUserId)
        .eq('relationship_type', 'interested');

      if (data) {
        setInterestedEvents(new Set(data.map(r => r.event_id)));
      }
    } catch (error) {
      console.error('Error loading interested events:', error);
    }
  };

  const loadRecommendedEvents = async () => {
    try {
      setLoading(true);
      
      // Try to get personalized recommendations first
      try {
        const recommendations = await SimpleEventRecommendationService.getRecommendedEvents({
          userId: currentUserId,
          limit: 10,
        });

        if (recommendations.events && recommendations.events.length > 0) {
          // Convert to UnifiedEvent format
          const unifiedEvents: UnifiedEvent[] = recommendations.events.map(event => ({
            id: event.id,
            source: event.source || 'jambase',
            jambase_event_id: event.jambase_event_id,
            ticketmaster_event_id: event.ticketmaster_event_id,
            title: event.title || event.artist_name || 'Event',
            artist_name: event.artist_name || 'Unknown Artist',
            artist_id: event.artist_id,
            venue_name: event.venue_name || 'Unknown Venue',
            venue_id: event.venue_id,
            event_date: event.event_date,
            doors_time: event.doors_time,
            description: event.description,
            genres: event.genres,
            venue_address: event.venue_address,
            venue_city: event.venue_city,
            venue_state: event.venue_state,
            venue_zip: event.venue_zip,
            latitude: event.latitude,
            longitude: event.longitude,
            ticket_available: event.ticket_available ?? true,
            price_range: event.price_range,
            ticket_urls: event.ticket_urls,
            external_url: event.external_url,
            price_min: event.price_min,
            price_max: event.price_max,
            price_currency: event.price_currency,
            event_status: event.event_status,
            attraction_ids: event.attraction_ids,
            classifications: event.classifications,
            sales_info: event.sales_info,
            images: event.images,
            tour_name: event.tour_name,
            setlist: event.setlist,
          }));

          setRecommendedEvents(unifiedEvents);
          setLoading(false);
          return;
        }
      } catch (error) {
        console.warn('Error loading personalized recommendations, falling back to general search:', error);
      }

      // Fallback: Get upcoming events from database
      const { data: events, error } = await supabase
        .from('events')
        .select('*')
        .gte('event_date', new Date().toISOString())
        .order('event_date', { ascending: true })
        .limit(10);

      if (error) throw error;

      if (events && events.length > 0) {
        const unifiedEvents: UnifiedEvent[] = events.map(event => ({
          id: event.id,
          source: 'jambase',
          jambase_event_id: event.id,
          title: event.title || event.artist_name || 'Event',
          artist_name: event.artist_name || 'Unknown Artist',
          artist_id: event.artist_id,
          venue_name: event.venue_name || 'Unknown Venue',
          venue_id: event.venue_id,
          event_date: event.event_date,
          doors_time: event.doors_time,
          description: event.description,
          genres: event.genres,
          venue_address: event.venue_address,
          venue_city: event.venue_city,
          venue_state: event.venue_state,
          venue_zip: event.venue_zip,
          latitude: event.latitude,
          longitude: event.longitude,
          ticket_available: event.ticket_available ?? true,
          price_range: event.price_range,
          ticket_urls: event.ticket_urls,
          images: event.images,
        }));

        setRecommendedEvents(unifiedEvents);
      } else {
        setRecommendedEvents([]);
      }
    } catch (error) {
      console.error('Error loading recommended events:', error);
      setRecommendedEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleEventClick = async (event: UnifiedEvent) => {
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
        // If event not in database, use the UnifiedEvent directly
        setSelectedEvent(event);
        setSelectedEventInterested(interestedEvents.has(event.id || ''));
        setEventDetailsOpen(true);
      }
    } catch (error) {
      console.error('Error fetching event details:', error);
      // Still show modal with UnifiedEvent data
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

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (recommendedEvents.length === 0) {
    return null; // Don't show section if no events
  }

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <h2 className="text-xl font-bold mb-4">Recommended Events</h2>
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {recommendedEvents.map((event) => (
              <div key={event.id} className="flex-shrink-0 w-[300px]">
                <JamBaseEventCard
                  event={event as any}
                  currentUserId={currentUserId}
                  isInterested={interestedEvents.has(event.id || '')}
                  onInterestToggle={handleInterestToggle}
                  onClick={() => handleEventClick(event)}
                  showInterestButton={true}
                  showReviewButton={false}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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

