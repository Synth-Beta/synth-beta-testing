import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { JamBaseEventCard } from '@/components/events/JamBaseEventCard';
import { Loader2 } from 'lucide-react';
import { UnifiedEventSearchService, type UnifiedEvent } from '@/services/unifiedEventSearchService';
import { UserEventService } from '@/services/userEventService';
import { supabase } from '@/integrations/supabase/client';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';

interface BrowseAllEventsSectionProps {
  currentUserId: string;
  sortOption: 'date' | 'popularity' | 'distance' | 'price';
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
}

export const BrowseAllEventsSection: React.FC<BrowseAllEventsSectionProps> = ({
  currentUserId,
  sortOption,
  onNavigateToProfile,
  onNavigateToChat,
}) => {
  const [events, setEvents] = useState<UnifiedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [selectedEventInterested, setSelectedEventInterested] = useState<boolean>(false);
  const [interestedEvents, setInterestedEvents] = useState<Set<string>>(new Set());
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Load user location for distance sorting
  useEffect(() => {
    const loadUserLocation = async () => {
      try {
        const { data: profile } = await supabase
          .from('users')
          .select('latitude, longitude')
          .eq('user_id', currentUserId)
          .single();

        if (profile?.latitude && profile?.longitude) {
          setUserLocation({ 
            lat: profile.latitude, 
            lng: profile.longitude
          });
        }
      } catch (error) {
        console.warn('Could not get user location:', error);
      }
    };
    loadUserLocation();
  }, [currentUserId]);

  useEffect(() => {
    loadInterestedEvents();
    loadEvents(true);
  }, [currentUserId, sortOption]);

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    if (hasMore && !loadingMore) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && !loadingMore && hasMore) {
            loadMoreEvents();
          }
        },
        { threshold: 0.1, rootMargin: '100px' }
      );

      const attachObserver = () => {
        if (loadMoreRef.current && observerRef.current) {
          observerRef.current.observe(loadMoreRef.current);
        }
      };

      attachObserver();
      const timeoutId = setTimeout(attachObserver, 100);

      return () => {
        clearTimeout(timeoutId);
        if (observerRef.current) {
          observerRef.current.disconnect();
        }
      };
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [loadingMore, hasMore, events.length]);

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

  const loadEvents = async (reset = false) => {
    if (reset) {
      setLoading(true);
      setPage(1);
      setEvents([]);
    } else {
      setLoadingMore(true);
    }

    try {
      const perPage = 20;
      const currentPage = reset ? 1 : page;

      // Build search params based on sort option
      const searchParams: any = {
        page: currentPage,
        perPage,
        includePastEvents: false,
      };

      // Add location for distance sorting
      if (sortOption === 'distance' && userLocation) {
        searchParams.latitude = userLocation.lat;
        searchParams.longitude = userLocation.lng;
        searchParams.radius = 100; // 100 mile radius
      }

      // Use UnifiedEventSearchService for general event browsing (not personalized)
      const result = await UnifiedEventSearchService.searchEvents(searchParams);

      // Sort events based on sort option
      let sortedEvents = [...result.events];
      
      if (sortOption === 'date') {
        sortedEvents.sort((a, b) => {
          const dateA = new Date(a.event_date || 0).getTime();
          const dateB = new Date(b.event_date || 0).getTime();
          return dateA - dateB;
        });
      } else if (sortOption === 'popularity') {
        // Sort by event date as fallback (popularity metric not available in general search)
        sortedEvents.sort((a, b) => {
          const dateA = new Date(a.event_date || 0).getTime();
          const dateB = new Date(b.event_date || 0).getTime();
          return dateA - dateB;
        });
      } else if (sortOption === 'distance' && userLocation) {
        // Calculate distance and sort
        sortedEvents.sort((a, b) => {
          const distA = calculateDistance(userLocation.lat, userLocation.lng, a.latitude || 0, a.longitude || 0);
          const distB = calculateDistance(userLocation.lat, userLocation.lng, b.latitude || 0, b.longitude || 0);
          return distA - distB;
        });
      } else if (sortOption === 'price') {
        sortedEvents.sort((a, b) => {
          const priceA = a.price_min || a.price_max || Infinity;
          const priceB = b.price_min || b.price_max || Infinity;
          return priceA - priceB;
        });
      }

      if (reset) {
        setEvents(sortedEvents);
      } else {
        setEvents(prev => {
          // Filter out duplicates
          const existingIds = new Set(prev.map(e => e.id));
          const newEvents = sortedEvents.filter(e => e.id && !existingIds.has(e.id));
          return [...prev, ...newEvents];
        });
      }

      setHasMore(result.hasNextPage && sortedEvents.length > 0);
      if (!reset) {
        setPage(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error loading events:', error);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMoreEvents = () => {
    if (!loadingMore && hasMore) {
      loadEvents(false);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const handleEventClick = async (event: UnifiedEvent) => {
    try {
      // Try to fetch full event details from database
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
        // Use the event data we already have
        setSelectedEvent(event);
        setSelectedEventInterested(interestedEvents.has(event.id || ''));
        setEventDetailsOpen(true);
      }
    } catch (error) {
      console.error('Error fetching event details:', error);
      // Use the event data we already have
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

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <h2 className="text-xl font-bold mb-4">Browse All Events</h2>
          <div className="space-y-4">
            {events.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No events found. Try adjusting your filters.</p>
              </div>
            ) : (
              <>
                {events.map((event) => (
                  <div key={event.id} className="w-full">
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

                {/* Load more trigger */}
                {hasMore && (
                  <div ref={loadMoreRef} className="h-10 flex items-center justify-center py-4">
                    {loadingMore && (
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                )}
                {!hasMore && events.length > 0 && (
                  <div className="h-10 flex items-center justify-center text-sm text-muted-foreground py-4">
                    You've reached the end
                  </div>
                )}
              </>
            )}
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

