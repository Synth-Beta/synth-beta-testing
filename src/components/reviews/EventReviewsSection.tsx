import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EventReviewModal } from './EventReviewModal';
// import { EventReviewForm } from './EventReviewForm'; // Removed because module not found
import { ReviewList } from './ReviewList';
import { PublicReviewList } from './PublicReviewList';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Star, MessageSquare } from 'lucide-react';
import type { JamBaseEvent } from '@/services/jambaseEventsService';
import { EventReviewForm } from './EventReviewForm.tsx';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { VenueCard } from './VenueCard';
import { ArtistCard } from '@/components/ArtistCard';
import type { Artist } from '@/types/concertSearch';
import { SimpleArtistVenueService } from '@/services/simpleArtistVenueService';
import { UnifiedEventSearchService } from '@/services/unifiedEventSearchService';
import { JamBaseEventsService } from '@/services/jambaseEventsService';
import { Loader2 } from 'lucide-react';

interface EventReviewsSectionProps {
  event: JamBaseEvent;
  userId?: string;
  onReviewSubmitted?: (reviewId: string) => void;
}

export function EventReviewsSection({
  event,
  userId,
  onReviewSubmitted
}: EventReviewsSectionProps) {
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'reviews' | 'public'>('reviews');
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<JamBaseEvent | null>(null);
  const [venueDialog, setVenueDialog] = useState<{ open: boolean; venueId?: string | null; venueName?: string }>(() => ({ open: false }));
  const [artistDialog, setArtistDialog] = useState<{ open: boolean; artist?: Artist | null; events?: JamBaseEvent[]; totalEvents?: number }>(() => ({ open: false }));
  const [artistDialogLoading, setArtistDialogLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleReviewSubmitted = (review: any) => {
    setIsReviewModalOpen(false);
    setEditingReviewId(null);
    setEditingEvent(null);
    // Trigger refresh of review lists
    setRefreshTrigger(prev => prev + 1);
    if (onReviewSubmitted) {
      onReviewSubmitted(review.id);
    }
  };

  // Fetch events when artist dialog opens
  useEffect(() => {
    const fetchArtistDialogEvents = async () => {
      if (!artistDialog.open || !artistDialog.artist) return;
      
      // If events are already loaded, skip
      if (artistDialog.events && artistDialog.events.length > 0) return;

      setArtistDialogLoading(true);
      try {
        const artistName = artistDialog.artist.name;
        console.log('🎫 Fetching Ticketmaster events for artist dialog:', artistName);

        // Fetch from database first
        const dbEventsResult = await JamBaseEventsService.getEventsFromDatabase(artistName, {
          page: 1,
          perPage: 50,
          eventType: 'all'
        });

        // Call Ticketmaster API
        let ticketmasterEvents: JamBaseEvent[] = [];
        try {
          const tmEvents = await UnifiedEventSearchService.searchByArtist({
            artistName,
            includePastEvents: true,
            pastEventsMonths: 3,
            limit: 200
          });

          ticketmasterEvents = tmEvents.map(event => ({
            id: event.id,
            jambase_event_id: event.jambase_event_id || event.ticketmaster_event_id,
            ticketmaster_event_id: event.ticketmaster_event_id,
            title: event.title,
            artist_name: event.artist_name,
            artist_id: event.artist_id,
            venue_name: event.venue_name,
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
            ticket_available: event.ticket_available,
            price_range: event.price_range,
            ticket_urls: event.ticket_urls,
            external_url: event.external_url,
            setlist: event.setlist,
            tour_name: event.tour_name,
            source: event.source || 'ticketmaster'
          } as JamBaseEvent));
        } catch (tmError) {
          console.warn('⚠️ Ticketmaster API call failed:', tmError);
        }

        // Merge and deduplicate
        const dbEvents: JamBaseEvent[] = (dbEventsResult.events || []).map(event => ({
          ...event,
          source: event.source || 'jambase'
        }));

        const allEvents = [...dbEvents, ...ticketmasterEvents];
        const deduplicatedEvents = deduplicateEvents(allEvents);
        deduplicatedEvents.sort((a, b) => 
          new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
        );

        setArtistDialog(prev => ({
          ...prev,
          events: deduplicatedEvents,
          totalEvents: deduplicatedEvents.length
        }));
      } catch (error) {
        console.error('Error fetching artist dialog events:', error);
      } finally {
        setArtistDialogLoading(false);
      }
    };

    fetchArtistDialogEvents();
  }, [artistDialog.open, artistDialog.artist?.name]);

  // Helper function to deduplicate events
  const deduplicateEvents = (events: JamBaseEvent[]): JamBaseEvent[] => {
    const seen = new Map<string, JamBaseEvent>();
    
    return events.filter(event => {
      const normalizeArtist = (event.artist_name || '').toLowerCase().trim();
      const normalizeVenue = (event.venue_name || '').toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/\bthe\s+/gi, '')
        .replace(/[^\w\s]/g, '')
        .trim();
      
      const dateKey = event.event_date?.split('T')[0] || '';
      const key = `${normalizeArtist}|${normalizeVenue}|${dateKey}`;
      
      if (seen.has(key)) {
        const existing = seen.get(key)!;
        if (event.source === 'ticketmaster' && existing.source !== 'ticketmaster') {
          seen.set(key, event);
          return true;
        }
        return false;
      }
      
      seen.set(key, event);
      return true;
    });
  };

  const handleReviewDeleted = () => {
    console.log('📢 Review deleted, refreshing data');
    setIsReviewModalOpen(false);
    setEditingReviewId(null);
    setEditingEvent(null);
    // Trigger refresh by calling the callback
    if (onReviewSubmitted) {
      onReviewSubmitted(null);
    }
  };

  useEffect(() => {
    const loadEventForEdit = async () => {
      if (!editingReviewId) return;
      try {
        // Look up the review to get event_id
        const { data: reviewRow } = await (supabase as any)
          .from('user_reviews')
          .select('event_id')
          .eq('id', editingReviewId)
          .single();
        const eventId = reviewRow?.event_id;
        if (!eventId) return;
        // Fetch event metadata for nicer context in the form
        const { data: eventRow } = await (supabase as any)
          .from('jambase_events')
          .select('*')
          .eq('id', eventId)
          .single();
        if (eventRow) {
          setEditingEvent(eventRow as JamBaseEvent);
        } else {
          setEditingEvent({ id: eventId } as unknown as JamBaseEvent);
        }
      } catch {
        setEditingEvent(null);
      }
    };
    loadEventForEdit();
  }, [editingReviewId]);

  useEffect(() => {
    const openVenue = async (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (detail.venueName) {
        try {
          // Use the simple service to get venue with events
          const venueWithEvents = await SimpleArtistVenueService.getVenueByName(detail.venueName);
          console.log('Venue with events:', venueWithEvents);
        } catch (error) {
          console.error('Error fetching venue events:', error);
        }
      }
      setVenueDialog({ open: true, venueId: detail.venueId || null, venueName: detail.venueName });
    };
    const openArtist = async (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (detail.artistName) {
        try {
          // Use the simple service to get artist with events
          const artistWithEvents = await SimpleArtistVenueService.getArtistByName(detail.artistName);
          
          if (artistWithEvents) {
            setArtistDialog({ 
              open: true, 
              artist: {
                id: artistWithEvents.id,
                name: artistWithEvents.name,
                image_url: artistWithEvents.image_url,
                popularity_score: artistWithEvents.events.length,
                source: 'database',
                events: artistWithEvents.events
              } as any 
            });
            return;
          }
        } catch (error) {
          console.error('Error fetching artist:', error);
        }
      }
      // Fallback: open with name only
      const artist: Artist = { id: detail.artistId || 'manual', name: detail.artistName || 'Unknown Artist' } as any;
      setArtistDialog({ open: true, artist });
    };
    document.addEventListener('open-venue-card', openVenue as EventListener);
    document.addEventListener('open-artist-card', openArtist as EventListener);
    return () => {
      document.removeEventListener('open-venue-card', openVenue as EventListener);
      document.removeEventListener('open-artist-card', openArtist as EventListener);
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Reviews</h2>
          <p className="text-gray-600">See what others thought about this event</p>
        </div>
        {userId && (
          <Button
            onClick={() => setIsReviewModalOpen(true)}
            className="bg-blue-500 hover:bg-blue-600"
          >
            <Star className="w-4 h-4 mr-2" />
            Write Review
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'reviews' | 'public')}>
        <TabsList>
          <TabsTrigger value="reviews" className="flex items-center space-x-2">
            <MessageSquare className="w-4 h-4" />
            <span>Event Reviews</span>
          </TabsTrigger>
          <TabsTrigger value="public" className="flex items-center space-x-2">
            <Star className="w-4 h-4" />
            <span>All Reviews</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reviews" className="mt-6">
          <ReviewList
            eventId={event.id}
            currentUserId={userId}
            showEventInfo={false}
            refreshTrigger={refreshTrigger}
            onEdit={(review) => {
              if (review.user_id !== userId) return;
              setEditingReviewId(review.id);
            }}
          />
        </TabsContent>

        <TabsContent value="public" className="mt-6">
          <PublicReviewList
            eventId={event.id}
            currentUserId={userId}
          />
        </TabsContent>
      </Tabs>

      {/* Inline Single-Page Review Form (replaces modal for simpler UX) */}
      {userId && isReviewModalOpen && (
        <div className="mt-4">
          <EventReviewForm
            event={event}
            userId={userId}
            onSubmitted={handleReviewSubmitted as any}
            onDeleted={handleReviewDeleted}
          />
        </div>
      )}

      {userId && editingReviewId && editingEvent && (
        <div className="mt-4">
          <EventReviewForm
            event={editingEvent as any}
            userId={userId}
            onSubmitted={handleReviewSubmitted as any}
            onDeleted={handleReviewDeleted}
          />
        </div>
      )}

      <Dialog open={venueDialog.open} onOpenChange={(open) => setVenueDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-2xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>Venue</DialogTitle>
            <DialogDescription className="sr-only">
              View venue details
            </DialogDescription>
          </DialogHeader>
          {venueDialog.open && (
            <VenueCard venueId={venueDialog.venueId} venueName={venueDialog.venueName || 'Venue'} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={artistDialog.open} onOpenChange={(open) => setArtistDialog(prev => ({ ...prev, open, events: undefined, totalEvents: undefined }))}>
        <DialogContent className="max-w-4xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>Artist</DialogTitle>
            <DialogDescription className="sr-only">
              View artist details
            </DialogDescription>
          </DialogHeader>
          {artistDialog.open && artistDialog.artist && (
            artistDialogLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-pink-500" />
                <span className="ml-2">Loading events...</span>
              </div>
            ) : (
              <ArtistCard 
                artist={artistDialog.artist} 
                events={artistDialog.events || []} 
                totalEvents={artistDialog.totalEvents || 0} 
                source={artistDialog.events && artistDialog.events.length > 0 ? 'api' : 'database'} 
              />
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
