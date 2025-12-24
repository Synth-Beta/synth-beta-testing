import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { DiscoverVibeService, type VibeType, type VibeResult, type VibeFilters } from '@/services/discoverVibeService';
import { CompactEventCard } from './CompactEventCard';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { UserEventService } from '@/services/userEventService';
import { supabase } from '@/integrations/supabase/client';
import type { JamBaseEvent } from '@/types/eventTypes';

interface DiscoverResultsViewProps {
  vibeType: VibeType;
  userId: string;
  filters?: VibeFilters;
  onBack: () => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
}

export const DiscoverResultsView: React.FC<DiscoverResultsViewProps> = ({
  vibeType,
  userId,
  filters,
  onBack,
  onNavigateToProfile,
  onNavigateToChat,
}) => {
  const [results, setResults] = useState<VibeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<JamBaseEvent | null>(null);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [selectedEventInterested, setSelectedEventInterested] = useState(false);
  const [interestedEvents, setInterestedEvents] = useState<Set<string>>(new Set());

  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    loadResults();
    loadInterestedEvents();
  }, [vibeType, userId, filters]);

  const loadInterestedEvents = async () => {
    try {
      const { data } = await supabase
        .from('user_event_relationships')
        .select('event_id')
        .eq('user_id', userId)
        .eq('relationship_type', 'interest');

      if (data) {
        setInterestedEvents(new Set(data.map(r => r.event_id)));
      }
    } catch (error) {
      console.error('Error loading interested events:', error);
    }
  };

  const loadResults = async () => {
    setLoading(true);
    try {
      const result = await DiscoverVibeService.executeVibe(vibeType, userId, ITEMS_PER_PAGE * 3, filters);
      setResults(result);
      setPage(1);
    } catch (error) {
      console.error('Error loading vibe results:', error);
      setResults({
        events: [],
        title: 'Error',
        description: 'Unable to load results',
        totalCount: 0,
      });
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
        const interested = await UserEventService.isUserInterested(userId, data.id);
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
      await UserEventService.setEventInterest(userId, eventId, interested);
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

  const displayedEvents = results?.events.slice(0, page * ITEMS_PER_PAGE) || [];
  const hasMore = results ? displayedEvents.length < results.events.length : false;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 pt-4 pb-6">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Discover
          </Button>
          {results && (
            <>
              <h1 className="text-2xl font-bold mb-2">{results.title}</h1>
              <p className="text-muted-foreground">{results.description}</p>
            </>
          )}
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : results && results.events.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No events found for this vibe.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedEvents.map((event) => (
                <CompactEventCard
                  key={event.id}
                  event={event}
                  onClick={() => handleEventClick(event)}
                  socialProofCount={undefined}
                />
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => setPage(prev => prev + 1)}
                >
                  Load More
                </Button>
              </div>
            )}

            {!hasMore && results && results.events.length > 0 && (
              <div className="text-center py-4 text-sm text-muted-foreground">
                Showing all {results.events.length} events
              </div>
            )}
          </div>
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
          currentUserId={userId}
          isInterested={selectedEventInterested}
          onInterestToggle={handleInterestToggle}
          onReview={() => {
            console.log('Review event:', selectedEvent.id);
          }}
          onNavigateToProfile={onNavigateToProfile}
          onNavigateToChat={onNavigateToChat}
        />
      )}
    </div>
  );
};

