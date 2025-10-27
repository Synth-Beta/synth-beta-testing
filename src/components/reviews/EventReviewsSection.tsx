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
  const [artistDialog, setArtistDialog] = useState<{ open: boolean; artist?: Artist | null }>(() => ({ open: false }));
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

      <Dialog open={artistDialog.open} onOpenChange={(open) => setArtistDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-4xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>Artist</DialogTitle>
            <DialogDescription className="sr-only">
              View artist details
            </DialogDescription>
          </DialogHeader>
          {artistDialog.open && artistDialog.artist && (
            <ArtistCard artist={artistDialog.artist} events={[]} totalEvents={0} source="database" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
