import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Star, MapPin, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { VenueFollowButton } from '@/components/venues/VenueFollowButton';
import { ArtistVenueReviews } from '@/components/reviews/ArtistVenueReviews';
import { EventMap } from '@/components/EventMap';
import { useNavigate } from 'react-router-dom';

interface VenueDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  venueId: string;
  venueName: string;
  currentUserId: string;
}

export const VenueDetailModal: React.FC<VenueDetailModalProps> = ({
  isOpen,
  onClose,
  venueId,
  venueName,
  currentUserId,
}) => {
  const navigate = useNavigate();
  const [venueCity, setVenueCity] = useState<string | null>(null);
  const [venueState, setVenueState] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [totalEvents, setTotalEvents] = useState(0);
  const [upcomingEvents, setUpcomingEvents] = useState(0);
  const [pastEvents, setPastEvents] = useState(0);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [totalReviews, setTotalReviews] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadVenueData();
    }
  }, [isOpen, venueId, venueName]);

  const loadVenueData = async () => {
    try {
      setLoading(true);
      
      // Get events for this venue using venue_id (UUID join)
      // This is the primary source of data - events have venue location info
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('id, event_date, venue_city, venue_state, latitude, longitude')
        .eq('venue_id', venueId)
        .limit(100);

      if (eventsError) {
        console.warn('Error fetching venue events:', eventsError);
      }

      // Get venue details if possible (but don't fail if it errors)
      try {
        const { data: venueData } = await supabase
          .from('venues')
          .select('id, name, state, latitude, longitude, street_address, zip, country')
          .eq('id', venueId)
          .maybeSingle();

        // Use venue table data if available (fallback to events)
        if (venueData) {
          if (venueData.state && !venueState) setVenueState(venueData.state);
          if (venueData.latitude && !latitude) setLatitude(Number(venueData.latitude));
          if (venueData.longitude && !longitude) setLongitude(Number(venueData.longitude));
        }
      } catch (venueError) {
        // Silently fail - we'll use event data instead
        console.warn('Could not fetch venue details (non-critical):', venueError);
      }

      if (events && events.length > 0) {
        setTotalEvents(events.length);
        const now = new Date();
        const upcoming = events.filter(e => new Date(e.event_date) >= now).length;
        setUpcomingEvents(upcoming);
        setPastEvents(events.length - upcoming);

        // Get location from first event (most reliable source)
        const firstEvent = events[0];
        if (firstEvent.venue_city) setVenueCity(firstEvent.venue_city);
        if (firstEvent.venue_state) setVenueState(firstEvent.venue_state);
        if (firstEvent.latitude) setLatitude(Number(firstEvent.latitude));
        if (firstEvent.longitude) setLongitude(Number(firstEvent.longitude));
      }

      if (events && events.length > 0) {
        setTotalEvents(events.length);
        const now = new Date();
        const upcoming = events.filter(e => new Date(e.event_date) >= now).length;
        setUpcomingEvents(upcoming);
        setPastEvents(events.length - upcoming);

        // Get location from first event if venue data didn't have it
        if (!venueCity || !venueState) {
          const firstEvent = events[0];
          if (firstEvent.venue_city && !venueCity) setVenueCity(firstEvent.venue_city);
          if (firstEvent.venue_state && !venueState) setVenueState(firstEvent.venue_state);
          if (firstEvent.latitude && !latitude) setLatitude(Number(firstEvent.latitude));
          if (firstEvent.longitude && !longitude) setLongitude(Number(firstEvent.longitude));
        }
      }

      // Get reviews for events at this venue
      const eventIds = events?.map(e => e.id) || [];
      if (eventIds.length > 0) {
        const { data: reviews } = await supabase
          .from('reviews')
          .select('venue_rating, rating')
          .in('event_id', eventIds)
          .eq('is_public', true)
          .eq('is_draft', false);

        if (reviews && reviews.length > 0) {
          const ratings = reviews.map(r => r.venue_rating || r.rating || 0).filter(r => r > 0);
          if (ratings.length > 0) {
            const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
            setAverageRating(avgRating);
          }
          setTotalReviews(reviews.length);
        }
      }
    } catch (error) {
      console.error('Error loading venue data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="icon" onClick={onClose}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <DialogTitle className="flex-1">{venueName}</DialogTitle>
          </div>
          <DialogDescription>
            Venue details and upcoming events
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header Section */}
            <div className="flex items-start gap-4">
              <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <MapPin className="w-12 h-12 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-2">{venueName}</h2>
                {(venueCity || venueState) && (
                  <div className="flex items-center gap-1 text-muted-foreground mb-2">
                    <MapPin className="w-4 h-4" />
                    <span>{[venueCity, venueState].filter(Boolean).join(', ')}</span>
                  </div>
                )}
                {averageRating !== null && (
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${
                            i < Math.floor(averageRating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-sm font-medium">{averageRating.toFixed(1)}</span>
                    {totalReviews > 0 && (
                      <span className="text-sm text-muted-foreground">
                        ({totalReviews} {totalReviews === 1 ? 'review' : 'reviews'})
                      </span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-4 mt-4">
                  <VenueFollowButton
                    venueName={venueName}
                    venueCity={venueCity || undefined}
                    venueState={venueState || undefined}
                    userId={currentUserId}
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigate(`/venue/${encodeURIComponent(venueName)}`);
                      onClose();
                    }}
                  >
                    View All Events
                  </Button>
                </div>
              </div>
            </div>

            {/* Map */}
            {latitude && longitude && (
              <div className="h-64 rounded-lg overflow-hidden border">
                <EventMap
                  center={[latitude, longitude]}
                  zoom={15}
                  events={[{
                    id: venueId,
                    jambase_event_id: venueId,
                    title: venueName,
                    artist_name: venueName,
                    artist_id: '',
                    venue_name: venueName,
                    venue_id: venueId,
                    event_date: new Date().toISOString(),
                    latitude,
                    longitude,
                  }]}
                  onEventClick={() => {}}
                />
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{totalEvents}</div>
                <div className="text-sm text-muted-foreground">Total Events</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{upcomingEvents}</div>
                <div className="text-sm text-muted-foreground">Upcoming</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{pastEvents}</div>
                <div className="text-sm text-muted-foreground">Past</div>
              </div>
            </div>

            {/* Reviews Section */}
            {totalReviews > 0 && (
              <div>
                <h3 className="font-semibold mb-4">Reviews</h3>
                <ArtistVenueReviews
                  venueName={venueName}
                  venueId={venueId}
                />
              </div>
            )}

            {/* View Full Page Button */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                navigate(`/venue/${encodeURIComponent(venueName)}`);
                onClose();
              }}
            >
              View Full Venue Page
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

