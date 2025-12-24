import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Music, Calendar, MapPin, ExternalLink, Loader2, User, Filter, SortAsc, SortDesc, Star, Building2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArtistFollowService } from '@/services/artistFollowService';
import { VenueFollowService } from '@/services/venueFollowService';
import { UnifiedEventSearchService } from '@/services/unifiedEventSearchService';
import type { ArtistFollowWithDetails } from '@/types/artistFollow';
import type { VenueFollowWithDetails } from '@/types/venueFollow';
import type { JamBaseEvent } from '@/types/eventTypes';
import type { UnifiedEvent } from '@/services/unifiedEventSearchService';
import { format } from 'date-fns';
import { ArtistCard } from '@/components/ArtistCard';
import { JamBaseEventCard } from '@/components/events/JamBaseEventCard';
import { useAuth } from '@/hooks/useAuth';

interface ArtistWithEvents extends ArtistFollowWithDetails {
  upcomingEvents: JamBaseEvent[];
}

interface VenueWithEvents extends VenueFollowWithDetails {
  upcomingEvents: JamBaseEvent[];
}

export function ArtistFollowingPage() {
  const navigate = useNavigate();
  const { userId: urlUserId } = useParams<{ userId?: string }>();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'artists' | 'venues'>('artists');
  const [followedArtists, setFollowedArtists] = useState<ArtistWithEvents[]>([]);
  const [followedVenues, setFollowedVenues] = useState<VenueWithEvents[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allUpcomingEvents, setAllUpcomingEvents] = useState<JamBaseEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<JamBaseEvent | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<ArtistWithEvents | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<VenueWithEvents | null>(null);
  const [rightContentType, setRightContentType] = useState<'events' | 'artist' | 'venue' | 'empty'>('events');
  const [sortBy, setSortBy] = useState<'date' | 'location' | 'price'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filterBy, setFilterBy] = useState<'all' | 'artists' | 'venues'>('all');

  const targetUserId = urlUserId || user?.id || '';
  const isOwnProfile = !urlUserId || urlUserId === user?.id;
  const displayName = user?.user_metadata?.name || 'User';

  useEffect(() => {
    if (targetUserId) {
      loadFollowedArtists();
      loadFollowedVenues();
    }
  }, [targetUserId]);

  // Re-sort and filter events when settings change
  useEffect(() => {
    if (followedArtists.length > 0 || followedVenues.length > 0) {
      loadAllEvents();
    }
  }, [sortBy, sortOrder, filterBy]);

  const loadFollowedArtists = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get followed artists
      const artists = await ArtistFollowService.getUserFollowedArtists(targetUserId);
      
      // Get upcoming events for each artist from database
      const artistsWithEvents = await Promise.all(
        artists.map(async (artist) => {
          try {
            // Query database for upcoming events
              const { data: dbEvents } = await supabase
                .from('events')
                .select('*')
                .ilike('artist_name', `%${artist.artist_name}%`)
                .gte('event_date', new Date().toISOString())
                .order('event_date', { ascending: true })
                .limit(50);
              
            // Convert to JamBaseEvent format
            const events: JamBaseEvent[] = (dbEvents || []).map(event => ({
                id: event.id,
              title: event.title,
              artist_name: event.artist_name || artist.artist_name,
              venue_name: event.venue_name,
              venue_id: event.venue_id,
              venue_city: event.venue_city,
              venue_state: event.venue_state,
              venue_address: event.venue_address,
              venue_zip: event.venue_zip,
              event_date: event.event_date,
              doors_time: event.doors_time,
              description: event.description,
              ticket_urls: event.ticket_urls || [],
              price_range: event.price_range,
              ticket_available: event.ticket_available,
              genres: event.genres,
              source: event.source || 'jambase'
            }));

            console.log(`🔍 Checking events for "${artist.artist_name}":`, {
              totalEvents: events.length,
              events: events.map(e => ({ title: e.title, artist: e.artist_name, date: e.event_date, source: e.source }))
            });

            // Filter to only upcoming events
            const now = new Date();
            const upcomingEvents = events.filter(event => {
              const eventDate = event.event_date;
              const eventDateObj = new Date(eventDate);
              const isUpcoming = eventDateObj > now;
              
              // Check if the event title contains the artist name or artist_name matches
              const titleContainsArtist = event.title?.toLowerCase().includes(artist.artist_name.toLowerCase());
              const exactArtistMatch = event.artist_name?.toLowerCase() === artist.artist_name.toLowerCase();
              
              // Determine if the event matches the artist
              const matches = isUpcoming && (titleContainsArtist || exactArtistMatch);
              
              if (!matches && isUpcoming) {
                console.log(`⚠️ Event not matched for "${artist.artist_name}":`, {
                  title: event.title,
                  artistInEvent: event.artist_name,
                  titleContainsArtist,
                  exactArtistMatch
                });
              }
              
              return matches;
            });

            console.log(`✅ Filtered upcoming events for "${artist.artist_name}":`, {
              count: upcomingEvents.length,
              events: upcomingEvents.map(e => ({ title: e.title, date: e.event_date, source: e.source }))
            });

            return {
              ...artist,
              upcomingEvents
            };
          } catch (error) {
            console.warn(`Error loading events for artist ${artist.artist_name}:`, error);
            return {
              ...artist,
              upcomingEvents: []
            };
          }
        })
      );

      setFollowedArtists(artistsWithEvents);
    } catch (error) {
      console.error('Error loading followed artists:', error);
      setError('Failed to load followed artists');
    } finally {
      setLoading(false);
    }
  };

  const loadFollowedVenues = async () => {
    try {
      // Get followed venues
      const venues = await VenueFollowService.getUserFollowedVenues(targetUserId);
      
      // Get upcoming events for each venue from database
      const venuesWithEvents = await Promise.all(
        venues.map(async (venue) => {
          try {
            // Query database for upcoming events at this venue
            const { data: dbEvents } = await supabase
              .from('events')
              .select('*')
              .ilike('venue_name', `%${venue.venue_name}%`)
              .gte('event_date', new Date().toISOString())
              .order('event_date', { ascending: true })
              .limit(50);

            // Convert to JamBaseEvent format
            const events: JamBaseEvent[] = (dbEvents || []).map(event => ({
                id: event.id,
              title: event.title,
              artist_name: event.artist_name || 'Unknown Artist',
              venue_name: event.venue_name,
              venue_id: event.venue_id,
              venue_city: event.venue_city,
              venue_state: event.venue_state,
              venue_address: event.venue_address,
              venue_zip: event.venue_zip,
              event_date: event.event_date,
              doors_time: event.doors_time,
              description: event.description,
              ticket_urls: event.ticket_urls || [],
              price_range: event.price_range,
              ticket_available: event.ticket_available,
              genres: event.genres,
              source: event.source || 'jambase'
            }));

            // Filter to only upcoming events
            const now = new Date();
            const upcomingEvents = events.filter(event => {
              const eventDate = new Date(event.event_date);
              return eventDate > now;
            });

            console.log(`✅ Filtered upcoming events for "${venue.venue_name}":`, {
              count: upcomingEvents.length,
              events: upcomingEvents.map(e => ({ title: e.title, date: e.event_date, source: e.source }))
            });

            return {
              ...venue,
              upcomingEvents
            };
          } catch (error) {
            console.warn(`Error loading events for venue ${venue.venue_name}:`, error);
            return {
              ...venue,
              upcomingEvents: []
            };
          }
        })
      );

      setFollowedVenues(venuesWithEvents);
    } catch (error) {
      console.error('Error loading followed venues:', error);
      // Don't set error state here, just log it
    }
  };

  // Load all events when both artists and venues are loaded
  useEffect(() => {
    if (followedArtists.length > 0 || followedVenues.length > 0) {
      loadAllEvents();
    }
  }, [followedArtists, followedVenues]);

  const loadAllEvents = () => {
    // Get all events from both artists and venues with source info
    const artistEvents = followedArtists.flatMap(artist => 
      artist.upcomingEvents.map(event => ({
        ...event,
        source: 'artist' as const,
        sourceName: artist.artist_name
      }))
    );

    const venueEvents = followedVenues.flatMap(venue => 
      venue.upcomingEvents.map(event => ({
        ...event,
        source: 'venue' as const,
        sourceName: venue.venue_name
      }))
    );

    const allEvents = [...artistEvents, ...venueEvents];
    const filteredEvents = filterEvents(allEvents);
    const sortedEvents = sortEvents(filteredEvents);
    setAllUpcomingEvents(sortedEvents);
  };

  const handleEventClick = (event: JamBaseEvent) => {
    setSelectedEvent(event);
  };


  const handleArtistClick = (artist: ArtistWithEvents) => {
    setSelectedArtist(artist);
    setSelectedVenue(null);
    setSelectedEvent(null);
    setRightContentType('artist');
  };

  const handleVenueClick = (venue: VenueWithEvents) => {
    setSelectedVenue(venue);
    setSelectedArtist(null);
    setSelectedEvent(null);
    setRightContentType('venue');
  };

  const handleSourceNameClick = (source: string, sourceName: string) => {
    if (source === 'artist') {
      // Find the artist in followedArtists and select it
      const artist = followedArtists.find(a => a.artist_name === sourceName);
      if (artist) {
        handleArtistClick(artist);
      }
    } else if (source === 'venue') {
      // Find the venue in followedVenues and select it
      const venue = followedVenues.find(v => v.venue_name === sourceName);
      if (venue) {
        handleVenueClick(venue);
      }
    }
  };

  const handleBackClick = () => {
    // Store the intended view in localStorage so MainApp can pick it up
    localStorage.setItem('intendedView', 'profile');
    // Navigate back to the main app (root path)
    navigate('/');
  };

  const filterEvents = (events: JamBaseEvent[]) => {
    if (filterBy === 'all') return events;
    
    return events.filter(event => {
      const eventSource = (event as any).source;
      return eventSource === filterBy;
    });
  };

  const sortEvents = (events: JamBaseEvent[]) => {
    return [...events].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
          break;
        case 'location':
          const locationA = `${a.venue_city}, ${a.venue_state}`.toLowerCase();
          const locationB = `${b.venue_city}, ${b.venue_state}`.toLowerCase();
          comparison = locationA.localeCompare(locationB);
          break;
        case 'price':
          // For price, we'll sort by ticket availability first, then by price range if available
          const priceA = a.price_range || '';
          const priceB = b.price_range || '';
          comparison = priceA.localeCompare(priceB);
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };

  const renderArtistDetails = () => {
    if (!selectedArtist) return null;

    return (
      <div className="h-full overflow-y-auto">
        <div className="p-6">
          {/* Header with Back Button */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16">
                <AvatarImage src={selectedArtist.artist_image_url} />
                <AvatarFallback className="bg-pink-100 text-pink-600">
                  <Music className="w-8 h-8" />
                </AvatarFallback>
              </Avatar>
              <div>
                <button
                  className="text-2xl font-bold text-left hover:text-pink-600 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 rounded"
                  onClick={() => {
                    console.log('🎯 Artist name clicked in header:', selectedArtist.artist_name);
                    navigate(`/artist/${selectedArtist.artist_id || encodeURIComponent(selectedArtist.artist_name)}`);
                  }}
                  title={`Click to view ${selectedArtist.artist_name}'s full profile`}
                >
                  {selectedArtist.artist_name}
                </button>
                <p className="text-gray-600">
                  Following since {format(new Date(selectedArtist.created_at), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
            
            {/* Back to All Events Button */}
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                console.log('🎯 Back to all events clicked from artist details');
                setRightContentType('events');
                setSelectedArtist(null);
              }}
              className="bg-pink-500 hover:bg-pink-600 text-white border-0 shadow-sm"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to All Events
            </Button>
          </div>

          {/* Upcoming Events Section */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-pink-500" />
              Upcoming Events ({selectedArtist.upcomingEvents.length})
            </h3>
            
            {selectedArtist.upcomingEvents.length > 0 ? (
              <div className="space-y-4">
                {sortEvents(selectedArtist.upcomingEvents).map((event) => (
                  <div
                    key={event.id}
                    className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => handleEventClick(event)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="mb-2">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-lg">{event.title}</h4>
                          </div>
                          {((event as any).sourceName) && (
                            <p className="text-sm text-gray-600 mt-1">
                              via{' '}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSourceNameClick((event as any).source, (event as any).sourceName);
                                }}
                                className="text-pink-600 hover:text-pink-700 hover:underline cursor-pointer"
                              >
                                {(event as any).sourceName}
                              </button>
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {format(new Date(event.event_date), 'MMM d, yyyy')}
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {event.venue_city}, {event.venue_state}
                          </div>
                        </div>
                        {event.venue_address && event.venue_address !== 'NULL' && (
                          <p className="text-sm text-gray-500 mb-2">{event.venue_address}</p>
                        )}
                        {event.description && event.description !== 'NULL' && (
                          <p className="text-sm text-gray-700 line-clamp-2">{event.description}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {event.ticket_urls && event.ticket_urls.length > 0 && (
                          <ExternalLink className="w-4 h-4 text-pink-500" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No upcoming events found</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderVenueDetails = () => {
    if (!selectedVenue) return null;

    return (
      <div className="h-full overflow-y-auto">
        <div className="p-6">
          {/* Header with Back Button */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16">
                <AvatarFallback className="bg-blue-100 text-blue-600">
                  <Building2 className="w-8 h-8" />
                </AvatarFallback>
              </Avatar>
              <div>
                <button
                  className="text-2xl font-bold text-left hover:text-blue-600 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
                  onClick={() => {
                    console.log('🎯 Venue name clicked in header:', selectedVenue.venue_name);
                    navigate(`/venue/${encodeURIComponent(selectedVenue.venue_name)}`);
                  }}
                  title={`Click to view ${selectedVenue.venue_name}'s full profile`}
                >
                  {selectedVenue.venue_name}
                </button>
                <p className="text-gray-600">
                  {selectedVenue.venue_city}, {selectedVenue.venue_state}
                </p>
                <p className="text-sm text-gray-500">
                  Following since {format(new Date(selectedVenue.created_at), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
            
            {/* Back to All Events Button */}
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setRightContentType('events');
                setSelectedVenue(null);
              }}
              className="bg-blue-500 hover:bg-blue-600 text-white border-0 shadow-sm"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to All Events
            </Button>
          </div>

          {/* Upcoming Events Section */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-500" />
              Upcoming Events ({selectedVenue.upcomingEvents.length})
            </h3>
            
            {selectedVenue.upcomingEvents.length > 0 ? (
              <div className="space-y-4">
                {sortEvents(selectedVenue.upcomingEvents).map((event) => (
                  <div
                    key={event.id}
                    className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => handleEventClick(event)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="mb-2">
                          <h4 className="font-medium text-lg">{event.title}</h4>
                          {event.artist_name && (
                            <p className="text-sm text-gray-600">{event.artist_name}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {format(new Date(event.event_date), 'MMM d, yyyy')}
                          </div>
                        </div>
                        {event.description && event.description !== 'NULL' && (
                          <p className="text-sm text-gray-700 line-clamp-2">{event.description}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {event.ticket_urls && event.ticket_urls.length > 0 && (
                          <ExternalLink className="w-4 h-4 text-blue-500" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No upcoming events found</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderEventFeed = () => {
    if (allUpcomingEvents.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <Calendar className="w-16 h-16 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No Upcoming Events
          </h3>
          <p className="text-gray-500 mb-4">
            {followedArtists.length === 0 && followedVenues.length === 0
              ? (isOwnProfile ? "Start following artists and venues to see their upcoming events here!" : "This user isn't following any artists or venues yet.")
              : "None of your followed artists or venues have upcoming events at the moment."
            }
          </p>
          {isOwnProfile && followedArtists.length === 0 && followedVenues.length === 0 && (
            <Button onClick={() => navigate('/search')} className="bg-pink-500 hover:bg-pink-600">
              <Music className="w-4 h-4 mr-2" />
              Discover Artists & Venues
            </Button>
          )}
        </div>
      );
    }

    return (
      <div className="h-full overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Calendar className="w-6 h-6 text-pink-500" />
              <h2 className="text-xl font-bold">
                {rightContentType === 'artist' ? `${selectedArtist?.artist_name}'s Events` : 'Upcoming Events'}
              </h2>
              <Badge variant="secondary" className="bg-pink-100 text-pink-700">
                {rightContentType === 'artist' ? selectedArtist?.upcomingEvents.length : allUpcomingEvents.length}
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              {/* Filter Controls */}
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <Select value={filterBy} onValueChange={(value: 'all' | 'artists' | 'venues') => setFilterBy(value)}>
                  <SelectTrigger className="w-32 bg-white border border-gray-300 hover:border-pink-300 focus:border-pink-500">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-200 shadow-lg">
                    <SelectItem value="all" className="hover:bg-pink-50 focus:bg-pink-50">All</SelectItem>
                    <SelectItem value="artists" className="hover:bg-pink-50 focus:bg-pink-50">Artists</SelectItem>
                    <SelectItem value="venues" className="hover:bg-pink-50 focus:bg-pink-50">Venues</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Sort Controls */}
              <div className="flex items-center gap-2">
                <Select value={sortBy} onValueChange={(value: 'date' | 'location' | 'price') => setSortBy(value)}>
                  <SelectTrigger className="w-32 bg-white border border-gray-300 hover:border-pink-300 focus:border-pink-500">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-200 shadow-lg">
                    <SelectItem value="date" className="hover:bg-pink-50 focus:bg-pink-50">Date</SelectItem>
                    <SelectItem value="location" className="hover:bg-pink-50 focus:bg-pink-50">Location</SelectItem>
                    <SelectItem value="price" className="hover:bg-pink-50 focus:bg-pink-50">Price</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="px-2"
                >
                  {sortOrder === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
                </Button>
              </div>
              
              {/* Back to All Events Button - Only when viewing specific artist */}
              {rightContentType === 'artist' && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    console.log('🎯 Back to all events clicked');
                    setRightContentType('events');
                    setSelectedArtist(null);
                  }}
                  className="bg-pink-500 hover:bg-pink-600 text-white border-0 shadow-sm"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to All Events
                </Button>
              )}
            </div>
          </div>
          
          <div className="space-y-4">
            {(rightContentType === 'artist' && selectedArtist ? selectedArtist.upcomingEvents : allUpcomingEvents).map((event) => (
              <div
                key={`${event.id}-${event.title}-${event.artist_name}`}
                className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => handleEventClick(event)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-lg">{event.title}</h4>
                      </div>
                      {((event as any).sourceName) && (
                        <p className="text-sm text-gray-600 mt-1">
                          via{' '}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSourceNameClick((event as any).source, (event as any).sourceName);
                            }}
                            className="text-pink-600 hover:text-pink-700 hover:underline cursor-pointer"
                          >
                            {(event as any).sourceName}
                          </button>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {format(new Date(event.event_date), 'MMM d, yyyy')}
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {event.venue_city}, {event.venue_state}
                      </div>
                    </div>
                    {event.venue_address && event.venue_address !== 'NULL' && (
                      <p className="text-sm text-gray-500 mb-2">{event.venue_address}</p>
                    )}
                    {event.description && event.description !== 'NULL' && (
                      <p className="text-sm text-gray-700 line-clamp-2">{event.description}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {event.ticket_urls && event.ticket_urls.length > 0 && (
                      <ExternalLink className="w-4 h-4 text-pink-500" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-pink-500 mx-auto mb-4" />
            <p className="text-gray-600">Loading followed artists...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <Button onClick={handleBackClick} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackClick}
              className="hover:bg-gray-100"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="flex items-center gap-3">
              {activeTab === 'artists' ? (
                <Music className="w-6 h-6 text-pink-500" />
              ) : (
                <Building2 className="w-6 h-6 text-blue-500" />
              )}
              <h1 className="text-2xl font-bold">
                {isOwnProfile ? 'Following' : `${displayName}'s Following`}
              </h1>
              <Badge variant="secondary" className="bg-gray-100 text-gray-700">
                {followedArtists.length + followedVenues.length}
              </Badge>
            </div>
          </div>
          
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(value) => {
            setActiveTab(value as 'artists' | 'venues');
            setSelectedArtist(null);
            setSelectedVenue(null);
            setSelectedEvent(null);
            setRightContentType('events');
          }}>
            <TabsList>
              <TabsTrigger value="artists" className="gap-2">
                <Music className="w-4 h-4" />
                Artists ({followedArtists.length})
              </TabsTrigger>
              <TabsTrigger value="venues" className="gap-2">
                <Building2 className="w-4 h-4" />
                Venues ({followedVenues.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-80px)]">
        {/* Left Sidebar - Artists or Venues List */}
        <div className="w-1/3 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">
              {activeTab === 'artists' ? 'Followed Artists' : 'Followed Venues'}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {activeTab === 'artists' 
                ? `Click an artist to view their details • ${followedArtists.reduce((sum, a) => sum + a.upcomingEvents.length, 0)} upcoming events`
                : `Click a venue to view their details • ${followedVenues.reduce((sum, v) => sum + v.upcomingEvents.length, 0)} upcoming events`
              }
            </p>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'artists' ? (
              followedArtists.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  <Music className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No artists followed</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {followedArtists.map((artist) => (
                    <div
                      key={artist.artist_id}
                      data-artist-id={artist.artist_id}
                      className={`p-4 cursor-pointer transition-colors hover:bg-gray-50 ${
                        selectedArtist?.artist_id === artist.artist_id ? 'bg-pink-50 border-r-2 border-pink-500' : ''
                      }`}
                      onClick={() => handleArtistClick(artist)}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10 flex-shrink-0">
                          <AvatarImage src={artist.artist_image_url} />
                          <AvatarFallback className="bg-pink-100 text-pink-600">
                            <Music className="w-5 h-5" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 truncate">
                            {artist.artist_name}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-gray-500">
                              {artist.upcomingEvents.length} upcoming events
                            </p>
                            {artist.upcomingEvents.length > 0 && (
                              <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                                {artist.upcomingEvents.length}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              followedVenues.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  <Building2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No venues followed</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {followedVenues.map((venue) => (
                    <div
                      key={venue.id}
                      className={`p-4 cursor-pointer transition-colors hover:bg-gray-50 ${
                        selectedVenue?.id === venue.id ? 'bg-blue-50 border-r-2 border-blue-500' : ''
                      }`}
                      onClick={() => handleVenueClick(venue)}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10 flex-shrink-0">
                          <AvatarFallback className="bg-blue-100 text-blue-600">
                            <Building2 className="w-5 h-5" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 truncate">
                            {venue.venue_name}
                          </h3>
                          <p className="text-xs text-gray-500 truncate">
                            {venue.venue_city}, {venue.venue_state}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-gray-500">
                              {venue.upcomingEvents.length} upcoming events
                            </p>
                            {venue.upcomingEvents.length > 0 && (
                              <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                                {venue.upcomingEvents.length}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 bg-white">
          {rightContentType === 'artist' && selectedArtist ? renderArtistDetails() 
            : rightContentType === 'venue' && selectedVenue ? renderVenueDetails()
            : renderEventFeed()}
        </div>
      </div>

      {/* Event Details Modal */}
      {selectedEvent && (
        <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-pink-500" />
                Event Details
              </DialogTitle>
            </DialogHeader>
            <div className="mt-4">
              <JamBaseEventCard
                event={selectedEvent as any}
                currentUserId={user?.id || ''}
                showInterestButton={false}
                showReviewButton={false}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}
