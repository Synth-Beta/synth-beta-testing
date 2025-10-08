import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Calendar, 
  MapPin, 
  Clock, 
  Building2, 
  Ticket,
  ExternalLink,
  Users
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { JamBaseEvent } from '@/services/jambaseEventsService';

interface VenueEventsPageProps {}

export default function VenueEventsPage({}: VenueEventsPageProps) {
  const { venueId } = useParams<{ venueId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [events, setEvents] = useState<JamBaseEvent[]>([]);
  const [venueName, setVenueName] = useState<string>('');
  const [venueLocation, setVenueLocation] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!venueId) {
      setError('No venue ID provided');
      setLoading(false);
      return;
    }

    fetchVenueEvents();
  }, [venueId]);

  // Decode the venue ID (which might be a URL-encoded name)
  const decodedVenueId = venueId ? decodeURIComponent(venueId) : '';

  const fetchVenueEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      // Try to fetch events by venue_id first
      let { data: eventsData, error: eventsError } = await supabase
        .from('jambase_events')
        .select('*')
        .eq('venue_id', venueId)
        .order('event_date', { ascending: true });

      // If no events found by venue_id, try by venue_name
      if (!eventsData || eventsData.length === 0) {
        // Try to find the venue name from the URL parameter
        // For now, let's search by the decodedVenueId as if it were a name
        const { data: nameSearchData, error: nameSearchError } = await supabase
          .from('jambase_events')
          .select('*')
          .ilike('venue_name', `%${decodedVenueId}%`)
          .order('event_date', { ascending: true });
          
        if (!nameSearchError && nameSearchData && nameSearchData.length > 0) {
          eventsData = nameSearchData;
          eventsError = null;
        }
      }

      if (eventsError) throw eventsError;

      if (eventsData && eventsData.length > 0) {
        setEvents(eventsData);
        const firstEvent = eventsData[0];
        setVenueName(firstEvent.venue_name);
        
        const locationParts = [firstEvent.venue_city, firstEvent.venue_state].filter(Boolean);
        setVenueLocation(locationParts.length > 0 ? locationParts.join(', ') : 'Location TBD');
      } else {
        setEvents([]);
        setVenueName(decodedVenueId || 'Unknown Venue');
      }
    } catch (err) {
      console.error('Error fetching venue events:', err);
      setError('Failed to load venue events');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDoorsTime = (doorsTime: string | null) => {
    if (!doorsTime) return null;
    const date = new Date(doorsTime);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const isPastEvent = (eventDate: string) => new Date(eventDate) < new Date();
  const isUpcomingEvent = (eventDate: string) => new Date(eventDate) >= new Date();

  const getLocationString = (event: JamBaseEvent) => {
    const parts = [event.venue_city, event.venue_state].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Location TBD';
  };

  const handleEventClick = (event: JamBaseEvent) => {
    // Navigate to event details - you might want to open a modal or navigate to a detail page
    console.log('Event clicked:', event);
    // For now, we'll just log it. You can implement navigation to event details modal here
  };

  const handleArtistClick = (artistId: string) => {
    navigate(`/artist/${artistId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading venue events...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-red-500 mb-4">{error}</p>
              <Button onClick={() => navigate(-1)}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Go Back
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const upcomingEvents = events.filter(event => isUpcomingEvent(event.event_date));
  const pastEvents = events.filter(event => isPastEvent(event.event_date));

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button 
            variant="ghost" 
            onClick={() => {
              // Check if we have state indicating where we came from
              const fromFeed = location.state?.fromFeed;
              const eventId = location.state?.eventId;
              
              if (eventId) {
                // Store the event ID in localStorage so UnifiedFeed can re-open it
                localStorage.setItem('reopenEventId', eventId);
              }
              
              if (fromFeed) {
                navigate(fromFeed);
              } else {
                // Fallback to main feed
                navigate('/app');
              }
            }}
            className="mb-4 hover-button"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold gradient-text">
                {venueName || 'Unknown Venue'}
              </h1>
              <p className="text-muted-foreground">
                {venueLocation}
              </p>
            </div>
          </div>

          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-green-100 text-green-800">
                {upcomingEvents.length} Upcoming
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {pastEvents.length} Past
              </Badge>
            </div>
          </div>
        </div>

        {/* Upcoming Events */}
        {upcomingEvents.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-semibold mb-4 gradient-text">Upcoming Events</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {upcomingEvents.map((event) => (
                <Card 
                  key={event.id} 
                  className="glass-card hover-card overflow-hidden floating-shadow cursor-pointer"
                  onClick={() => handleEventClick(event)}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg mb-1 line-clamp-2">
                          {event.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-2">
                          {event.description && event.description.length > 100 
                            ? `${event.description.substring(0, 100)}...` 
                            : event.description}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                        <span>{formatDate(event.event_date)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="w-4 h-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                        <span>{formatTime(event.event_date)}</span>
                        {event.doors_time && (
                          <span className="text-muted-foreground">
                            (Doors: {formatDoorsTime(event.doors_time)})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="w-4 h-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                        <span 
                          className="cursor-pointer hover:text-pink-600 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (event.artist_id) handleArtistClick(event.artist_id);
                          }}
                        >
                          {event.artist_name}
                        </span>
                      </div>
                    </div>

                    {event.genres && event.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {event.genres.slice(0, 3).map((genre, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {genre}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      {event.ticket_available && (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          <Ticket className="w-3 h-3 mr-1" />
                          Tickets Available
                        </Badge>
                      )}
                      {event.price_range && (
                        <span className="text-sm font-medium">
                          {event.price_range}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Past Events */}
        {pastEvents.length > 0 && (
          <div>
            <h2 className="text-2xl font-semibold mb-4 gradient-text">Past Events</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pastEvents.map((event) => (
                <Card 
                  key={event.id} 
                  className="glass-card hover-card overflow-hidden floating-shadow cursor-pointer opacity-75"
                  onClick={() => handleEventClick(event)}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg mb-1 line-clamp-2">
                          {event.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-2">
                          {event.description && event.description.length > 100 
                            ? `${event.description.substring(0, 100)}...` 
                            : event.description}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                        <span>{formatDate(event.event_date)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="w-4 h-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                        <span>{formatTime(event.event_date)}</span>
                        {event.doors_time && (
                          <span className="text-muted-foreground">
                            (Doors: {formatDoorsTime(event.doors_time)})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="w-4 h-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                        <span 
                          className="cursor-pointer hover:text-pink-600 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (event.artist_id) handleArtistClick(event.artist_id);
                          }}
                        >
                          {event.artist_name}
                        </span>
                      </div>
                    </div>

                    {event.genres && event.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {event.genres.slice(0, 3).map((genre, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {genre}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-sm">
                        Past Event
                      </Badge>
                      {event.price_range && (
                        <span className="text-sm font-medium text-muted-foreground">
                          {event.price_range}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* No Events Message */}
        {events.length === 0 && (
          <div className="text-center py-12">
            <Building2 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Events Found</h3>
            <p className="text-muted-foreground mb-4">
              No events found for {venueName || 'this venue'}.
            </p>
            <Button onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
