import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar as CalendarIcon, Route, Loader2, Trophy, Music, MapPin, X } from 'lucide-react';
import { TourTrackerService, type TourEvent, type ArtistGroupChat } from '@/services/tourTrackerService';
import { ArtistSearchBox } from '@/components/ArtistSearchBox';
import type { Artist } from '@/types/concertSearch';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import { Icon, divIcon, latLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import type { JamBaseEvent } from '@/types/eventTypes';
import { supabase } from '@/integrations/supabase/client';
import type { VibeFilters } from '@/services/discoverVibeService';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { JamBaseEventCard } from '@/components/events/JamBaseEventCard';
import { LocationService } from '@/services/locationService';

// Create numbered marker icon factory
const createNumberedIcon = (number: number) => {
  return divIcon({
    className: 'numbered-marker',
    html: `<div style="
      background-color: #ec4899;
      color: white;
      border: 2px solid white;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 14px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    ">${number}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
});
};

interface MapCalendarTourSectionProps {
  currentUserId: string;
  filters?: VibeFilters;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
}

// Map Updater component for center/zoom
const MapUpdater = ({ center, zoom }: { center: [number, number]; zoom: number }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);
  return null;
};

// Map Bounds Fitter component
const MapBoundsFitter = ({ events }: { events: TourEvent[] }) => {
  const map = useMap();
  
  useEffect(() => {
    if (events.length === 0) return;
    
    const bounds = latLngBounds(
      events.map(event => [event.latitude, event.longitude] as [number, number])
    );
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, events]);
  
  return null;
};

export const MapCalendarTourSection: React.FC<MapCalendarTourSectionProps> = ({
  currentUserId,
  filters,
  onNavigateToProfile,
  onNavigateToChat,
}) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'calendar' | 'leaderboards' | 'tour'>('calendar');
  
  // Calendar view state
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [calendarEvents, setCalendarEvents] = useState<Map<string, JamBaseEvent[]>>(new Map());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedDateEvents, setSelectedDateEvents] = useState<JamBaseEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  
  // Tour tracker state
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [tourEvents, setTourEvents] = useState<TourEvent[]>([]);
  const [tourRoute, setTourRoute] = useState<Array<{ from: { lat: number; lng: number; city: string }; to: { lat: number; lng: number; city: string } }>>([]);
  const [groupChats, setGroupChats] = useState<ArtistGroupChat[]>([]);
  const [tourLoading, setTourLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<JamBaseEvent | null>(null);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);

  // Track the last filter key to prevent unnecessary reloads
  const lastFilterKeyRef = useRef<string>('');
  const hasLoadedOnceRef = useRef(false);

  // Memoize loadCalendarEvents to prevent unnecessary re-renders
  const loadCalendarEvents = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const now = new Date();
      now.setHours(0, 0, 0, 0); // Start of today
      
      console.log('📅 [CALENDAR] Loading upcoming events with optimized spatial filtering');
      
      let filteredEvents: JamBaseEvent[] = [];

      // Use RPC function that properly uses spatial index with BETWEEN operator
      // This is much faster than PostgREST query builder which doesn't use the index efficiently
      if (filters?.latitude && filters?.longitude && filters?.radiusMiles) {
        console.log('📅 [CALENDAR] Using RPC function with spatial index');
        
        const { data: events, error } = await supabase.rpc('get_calendar_events', {
          p_latitude: filters.latitude,
          p_longitude: filters.longitude,
          p_radius_miles: filters.radiusMiles,
          p_min_date: now.toISOString(),
          p_genres: filters?.genres && filters.genres.length > 0 ? filters.genres : null,
          p_limit: 1500
        });

        if (error) throw error;

        // RPC function already filters by exact distance, just use the results
        filteredEvents = (events || []) as JamBaseEvent[];

        console.log(`📅 [CALENDAR] Loaded ${filteredEvents.length} events within ${filters.radiusMiles} miles (using spatial index)`);
      } else if (filters?.cities && filters.cities.length > 0) {
        // Fallback to city name filtering if no coordinates
        // Use direct query for city filtering (not using spatial index)
        let query = supabase
          .from('events')
          .select('*')
          .gte('event_date', now.toISOString())
          .in('venue_city', filters.cities);

        // Apply genre filters if present
        if (filters?.genres && filters.genres.length > 0) {
          query = query.overlaps('genres', filters.genres);
          console.log('📅 [CALENDAR] Applied genre filters:', filters.genres);
        }

        const { data, error } = await query
          .order('event_date', { ascending: true })
          .limit(10000); // Load all events (high limit for calendar view)

        if (error) throw error;
        filteredEvents = (data || []) as JamBaseEvent[];
        console.log('📅 [CALENDAR] City filter:', filteredEvents.length, 'events');
      } else {
        // No location filter - use RPC function without location params
        console.log('📅 [CALENDAR] Using RPC function without location filter');
        
        const { data, error } = await supabase.rpc('get_calendar_events', {
          p_latitude: null,
          p_longitude: null,
          p_radius_miles: null,
          p_min_date: now.toISOString(),
          p_genres: filters?.genres && filters.genres.length > 0 ? filters.genres : null,
          p_limit: 10000
        });

        if (error) throw error;
        filteredEvents = (data || []) as JamBaseEvent[];
        console.log('📅 [CALENDAR] No location filter:', filteredEvents.length, 'events');
      }

      console.log(`📅 [CALENDAR] Final count: ${filteredEvents.length} events`);

      // Group events by date
      const eventsByDate = new Map<string, JamBaseEvent[]>();
      filteredEvents.forEach((event: any) => {
        const eventDate = new Date(event.event_date);
        const dateKey = format(eventDate, 'yyyy-MM-dd');
        if (!eventsByDate.has(dateKey)) {
          eventsByDate.set(dateKey, []);
        }
        eventsByDate.get(dateKey)!.push(event as JamBaseEvent);
      });

      console.log(`📅 [CALENDAR] Grouped events into ${eventsByDate.size} unique dates`);
      setCalendarEvents(eventsByDate);
    } catch (error) {
      console.error('Error loading calendar events:', error);
    } finally {
      setCalendarLoading(false);
    }
  }, [filters?.latitude, filters?.longitude, filters?.radiusMiles, filters?.cities, filters?.genres]);

  // Load calendar events
  useEffect(() => {
    if (activeTab !== 'calendar') {
      return;
    }

    // Create a stable key from filter values
    const filterKey = JSON.stringify({
      lat: filters?.latitude,
      lng: filters?.longitude,
      radius: filters?.radiusMiles,
      cities: filters?.cities,
      genres: filters?.genres,
    });

    // Only reload if filters actually changed
    if (filterKey === lastFilterKeyRef.current) {
      return;
    }

    const hasLocationFilters = filters?.latitude && filters?.longitude && filters?.radiusMiles;
    const hasCityFilters = filters?.cities && filters.cities.length > 0;
    
    // Skip loading if filters are empty/undefined and we've already loaded with location filters
    // This prevents the initial "no location filter" load from overwriting a good result
    if (!hasLocationFilters && !hasCityFilters && hasLoadedOnceRef.current) {
      console.log('📅 [CALENDAR] Skipping load - filters cleared but we already have data');
      return;
    }

    // If filters are empty/undefined and we haven't loaded yet, skip the initial load
    // Wait for filters to be set before loading (they'll trigger another useEffect run)
    if (!hasLocationFilters && !hasCityFilters && !hasLoadedOnceRef.current) {
      console.log('📅 [CALENDAR] Skipping initial load - waiting for filters to be set');
      return;
    }

    lastFilterKeyRef.current = filterKey;
    hasLoadedOnceRef.current = true;
    loadCalendarEvents();
  }, [activeTab, filters?.latitude, filters?.longitude, filters?.radiusMiles, filters?.cities, filters?.genres, loadCalendarEvents]);

  // Load tour events when artist is selected
  useEffect(() => {
    if (activeTab === 'tour' && selectedArtist) {
      loadTourData();
    }
  }, [activeTab, selectedArtist]);

  const loadTourData = async () => {
    if (!selectedArtist || !selectedArtist.id) return;
    setTourLoading(true);
    try {
      // Use artist UUID (id) instead of name for precise filtering
      const events = await TourTrackerService.getArtistTourEvents(selectedArtist.id);
      setTourEvents(events);
      
      const route = TourTrackerService.calculateTourRoute(events);
      setTourRoute(route.route);
      
      const chats = await TourTrackerService.getArtistGroupChats(selectedArtist.id, currentUserId);
      setGroupChats(chats);
    } catch (error) {
      console.error('Error loading tour data:', error);
    } finally {
      setTourLoading(false);
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    if (!date) {
      setSelectedDateEvents([]);
      return;
    }
  };

  // Update selected date events when calendar events or selected date changes
  useEffect(() => {
    if (!selectedDate) {
      setSelectedDateEvents([]);
      return;
    }

    // Get events for the selected single date only
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    const events = calendarEvents.get(dateKey) || [];
    
    // Sort by time
    const sortedEvents = [...events].sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
    setSelectedDateEvents(sortedEvents);
  }, [calendarEvents, selectedDate]);

  const getEventsForDate = (date: Date): JamBaseEvent[] => {
    const dateKey = format(date, 'yyyy-MM-dd');
    return calendarEvents.get(dateKey) || [];
  };

  const handleEventClick = (event: JamBaseEvent) => {
    setSelectedEvent(event);
    setEventDetailsOpen(true);
  };

  // Get sorted events for display (sorted by date)
  const sortedTourEvents = tourEvents.length > 0 
    ? [...tourEvents].sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
    : [];

  // Group events by venue and assign sequential numbers
  // Each unique venue (by name + city) gets a number when it first appears
  // If the same venue appears again later, it gets a new number (different stop on tour)
  interface VenueGroup {
    venueKey: string; // venue_name + venue_city for grouping
    venueName: string;
    venueCity: string;
    venueState?: string;
    latitude: number;
    longitude: number;
    number: number; // Sequential number for this venue stop
    events: TourEvent[]; // All events at this venue in this grouping
    firstEventDate: Date; // Date of first event at this venue
  }

  const getVenueKey = (event: TourEvent): string => {
    // Use venue name + city to identify unique venues
    return `${event.venue_name || ''}|${event.venue_city || ''}|${event.venue_state || ''}`.toLowerCase();
  };

  const groupedVenues = React.useMemo(() => {
    if (sortedTourEvents.length === 0) return [];

    const venueGroups: VenueGroup[] = [];
    const seenVenueKeys = new Set<string>();
    let currentNumber = 1;

    // Process events in chronological order
    for (const event of sortedTourEvents) {
      const venueKey = getVenueKey(event);
      
      // Check if this is a new venue (not seen before)
      // OR if it's a venue we've seen before but after visiting other venues
      const lastSeenIndex = venueGroups.findIndex(g => g.venueKey === venueKey);
      
      if (lastSeenIndex === -1) {
        // New venue - create new group
        venueGroups.push({
          venueKey,
          venueName: event.venue_name || 'Unknown Venue',
          venueCity: event.venue_city || '',
          venueState: event.venue_state,
          latitude: event.latitude,
          longitude: event.longitude,
          number: currentNumber++,
          events: [event],
          firstEventDate: new Date(event.event_date),
        });
        seenVenueKeys.add(venueKey);
      } else {
        // Venue we've seen before - check if it's the last venue in the list
        // (meaning consecutive events at same venue) or a return visit
        const lastGroup = venueGroups[venueGroups.length - 1];
        if (lastGroup.venueKey === venueKey) {
          // Consecutive events at same venue - add to existing group
          lastGroup.events.push(event);
        } else {
          // Return visit to a previous venue - create new group with new number
          venueGroups.push({
            venueKey,
            venueName: event.venue_name || 'Unknown Venue',
            venueCity: event.venue_city || '',
            venueState: event.venue_state,
            latitude: event.latitude,
            longitude: event.longitude,
            number: currentNumber++,
            events: [event],
            firstEventDate: new Date(event.event_date),
          });
        }
      }
    }

    return venueGroups;
  }, [sortedTourEvents]);

  // Create a map from event ID to venue group number for display
  const eventToVenueNumber = React.useMemo(() => {
    const map = new Map<string, number>();
    groupedVenues.forEach(group => {
      group.events.forEach(event => {
        map.set(event.id, group.number);
      });
    });
    return map;
  }, [groupedVenues]);

  // Calculate route based on grouped venues instead of individual events
  const groupedVenueRoute = React.useMemo(() => {
    if (groupedVenues.length < 2) return [];
    
    const route: Array<{ from: { lat: number; lng: number; city: string }; to: { lat: number; lng: number; city: string } }> = [];
    
    for (let i = 0; i < groupedVenues.length - 1; i++) {
      const from = groupedVenues[i];
      const to = groupedVenues[i + 1];
      
      route.push({
        from: {
          lat: from.latitude,
          lng: from.longitude,
          city: `${from.venueCity}${from.venueState ? `, ${from.venueState}` : ''}`,
        },
        to: {
          lat: to.latitude,
          lng: to.longitude,
          city: `${to.venueCity}${to.venueState ? `, ${to.venueState}` : ''}`,
        },
      });
    }
    
    return route;
  }, [groupedVenues]);

  // Calculate map center for initial load (will be overridden by fitBounds)
  const getTourMapCenter = (): [number, number] => {
    if (tourEvents.length === 0) return [39.8283, -98.5795]; // Default center
    const avgLat = tourEvents.reduce((sum, e) => sum + e.latitude, 0) / tourEvents.length;
    const avgLng = tourEvents.reduce((sum, e) => sum + e.longitude, 0) / tourEvents.length;
    return [avgLat, avgLng];
  };

  return (
    <div className="mb-2 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Discover Events</h2>
          <p className="text-sm text-muted-foreground">
            Discover events by date, leaderboards, or artist tour
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="calendar" className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4" />
            Calendar
          </TabsTrigger>
          <TabsTrigger value="leaderboards" className="flex items-center gap-2">
            <Trophy className="w-4 h-4" />
            Leaderboards
          </TabsTrigger>
          <TabsTrigger value="tour" className="flex items-center gap-2">
            <Route className="w-4 h-4" />
            Tour Tracker
          </TabsTrigger>
        </TabsList>

        {/* Calendar View */}
        <TabsContent value="calendar" className="mt-4">
          {calendarLoading ? (
            <div className="flex items-center justify-center h-96">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4 flex flex-col items-center">
              <div className="w-full max-w-2xl">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  month={calendarDate}
                  onMonthChange={setCalendarDate}
                  className="rounded-md border mx-auto"
                  numberOfMonths={1}
                  disabled={(date) => {
                    // Disable dates before today
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const dateToCheck = new Date(date);
                    dateToCheck.setHours(0, 0, 0, 0);
                    return dateToCheck < today;
                  }}
                  modifiers={{
                    hasEvents: (date) => getEventsForDate(date).length > 0,
                  }}
                  modifiersClassNames={{
                    hasEvents: 'bg-synth-pink/20 border-synth-pink',
                  }}
                />
              </div>
              {selectedDate && selectedDateEvents.length > 0 && (
                <div className="mt-4 space-y-2 w-full max-w-2xl">
                  <h3 className="font-semibold">
                    Events on {format(selectedDate, 'MMMM d, yyyy')}
                  </h3>
                  <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto">
                    {selectedDateEvents.map((event) => (
                      <Card key={event.id} className="cursor-pointer hover:shadow-md" onClick={() => handleEventClick(event)}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-semibold">{event.title}</h4>
                              <p className="text-sm text-muted-foreground">{event.venue_name}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {format(new Date(event.event_date), 'MMMM d, yyyy • h:mm a')}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
              {selectedDate && selectedDateEvents.length === 0 && !calendarLoading && (
                <div className="mt-4 text-center text-muted-foreground">
                  <p>No events found for the selected date.</p>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Leaderboards View */}
        <TabsContent value="leaderboards" className="mt-4">
          <div className="flex items-center justify-center h-96">
            <div className="text-center space-y-2">
              <Trophy className="w-12 h-12 mx-auto text-muted-foreground" />
              <h3 className="text-lg font-semibold">Coming Soon</h3>
              <p className="text-sm text-muted-foreground">
                Leaderboards are still in development
              </p>
            </div>
          </div>
        </TabsContent>

        {/* Tour Tracker View */}
        <TabsContent value="tour" className="mt-4">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Search for an Artist</label>
              <ArtistSearchBox
                onArtistSelect={(artist) => setSelectedArtist(artist)}
                placeholder="Search for an artist to track their tour..."
              />
            </div>

            {/* Artist Banner */}
            {selectedArtist && (
              <Card 
                className="overflow-hidden border-2 border-synth-pink/20 shadow-lg cursor-pointer hover:shadow-xl transition-shadow"
                onClick={() => {
                  // Navigate to artist profile page using UUID or encoded name
                  const artistId = selectedArtist.id || encodeURIComponent(selectedArtist.name);
                  navigate(`/artist/${artistId}`);
                }}
              >
                <div 
                  className="relative p-6"
                  style={{
                    background: `linear-gradient(135deg, rgba(255, 51, 153, 0.1) 0%, rgba(255, 51, 153, 0.05) 100%)`,
                  }}
                >
                  <div className="flex items-center gap-4">
                    {/* Artist Image */}
                    <div className="flex-shrink-0">
                      {selectedArtist.image_url ? (
                        <img
                          src={selectedArtist.image_url}
                          alt={selectedArtist.name}
                          className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            target.nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      {!selectedArtist.image_url && (
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-synth-pink to-purple-500 flex items-center justify-center border-4 border-white shadow-lg">
                          <Music className="w-12 h-12 text-white" />
                        </div>
                      )}
                    </div>

                    {/* Artist Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h2 className="text-2xl font-bold text-foreground mb-2 truncate">
                            {selectedArtist.name}
                          </h2>
                          
                          {/* Stats */}
                          <div className="flex items-center gap-4 flex-wrap">
                            {tourEvents.length > 0 && (
                              <div className="flex items-center gap-2">
                                <CalendarIcon className="w-4 h-4 text-synth-pink" />
                                <span className="text-sm font-medium text-foreground">
                                  {tourEvents.length} {tourEvents.length === 1 ? 'Tour Date' : 'Tour Dates'}
                                </span>
                              </div>
                            )}
                            {selectedArtist.genres && selectedArtist.genres.length > 0 && (
                              <div className="flex items-center gap-2">
                                <Music className="w-4 h-4 text-synth-pink" />
                                <div className="flex items-center gap-1 flex-wrap">
                                  {selectedArtist.genres.slice(0, 3).map((genre, idx) => (
                                    <Badge 
                                      key={idx} 
                                      variant="secondary" 
                                      className="text-xs bg-white/80 text-foreground border-synth-pink/20"
                                    >
                                      {genre}
                                    </Badge>
                                  ))}
                                  {selectedArtist.genres.length > 3 && (
                                    <span className="text-xs text-muted-foreground">
                                      +{selectedArtist.genres.length - 3} more
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Clear Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent navigation when clicking clear button
                            setSelectedArtist(null);
                            setTourEvents([]);
                            setTourRoute([]);
                            setGroupChats([]);
                          }}
                          className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {tourLoading ? (
              <div className="flex items-center justify-center h-96">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : selectedArtist && tourEvents.length > 0 ? (
              <>
                <div className="h-96 rounded-lg overflow-hidden border relative z-0">
                  <MapContainer
                    center={getTourMapCenter()}
                    zoom={5}
                    style={{ height: '100%', width: '100%', zIndex: 0 }}
                    boundsOptions={{ padding: [50, 50] }}
                  >
                    <TileLayer
                      url={`https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/{z}/{x}/{y}?access_token=${import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.VITE_MAPBOX_KEY || 'pk.eyJ1Ijoic2xvaXRlcnN0ZWluIiwiYSI6ImNtamhvM3ozOTFnOHIza29yZHJmcGQ0ZGkifQ.5FU9eVyo5DAhSfESdWrI9w'}`}
                      attribution='&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    />
                    <MapBoundsFitter events={sortedTourEvents} />
                    
                    {/* Draw route lines with arrowheads (based on grouped venues) */}
                    {groupedVenueRoute.map((segment, idx) => {
                      const lat1 = segment.from.lat;
                      const lng1 = segment.from.lng;
                      const lat2 = segment.to.lat;
                      const lng2 = segment.to.lng;
                      
                      // Direction vector
                      const dLat = lat2 - lat1;
                      const dLng = lng2 - lng1;
                      
                      // Arrowhead position (85% along the line)
                      const arrowLat = lat1 + dLat * 0.85;
                      const arrowLng = lng1 + dLng * 0.85;
                      
                      // Calculate angle in radians and convert to degrees
                      const angleRad = Math.atan2(dLat, dLng);
                      const angleDeg = angleRad * 180 / Math.PI;
                      
                      // Create SVG arrowhead with proper rotation
                      const arrowSvg = `
                        <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                          <g transform="translate(10,10) rotate(${angleDeg}) translate(-10,-10)">
                            <polygon points="10,2 4,16 16,16" fill="#ec4899" stroke="white" stroke-width="1.5"/>
                          </g>
                        </svg>
                      `;
                      
                      return (
                        <React.Fragment key={idx}>
                      <Polyline
                        positions={[
                              [lat1, lng1],
                              [lat2, lng2],
                        ]}
                        pathOptions={{
                          color: '#ec4899',
                          weight: 3,
                          opacity: 0.7,
                        }}
                      />
                          {/* Arrowhead marker */}
                          <Marker
                            position={[arrowLat, arrowLng]}
                            icon={divIcon({
                              className: 'arrowhead-marker',
                              html: arrowSvg,
                              iconSize: [20, 20],
                              iconAnchor: [10, 10],
                            })}
                          />
                        </React.Fragment>
                      );
                    })}
                    
                    {/* Numbered venue markers (one per unique venue group) */}
                    {groupedVenues.map((venueGroup) => (
                      <Marker
                        key={`${venueGroup.venueKey}-${venueGroup.number}`}
                        position={[venueGroup.latitude, venueGroup.longitude]}
                        icon={createNumberedIcon(venueGroup.number)}
                        eventHandlers={{
                          click: () => {
                            // Click first event in this venue group
                            if (venueGroup.events.length > 0) {
                              handleEventClick(venueGroup.events[0]);
                            }
                          },
                        }}
                      />
                    ))}
                  </MapContainer>
                </div>

                {/* Events Feed */}
                <div className="mt-4">
                  <h3 className="font-semibold mb-3">Tour Dates ({sortedTourEvents.length})</h3>
                  <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto">
                    {sortedTourEvents.map((event) => {
                      const venueNumber = eventToVenueNumber.get(event.id) || 0;
                      const venueGroup = groupedVenues.find(g => g.events.some(e => e.id === event.id));
                      const isFirstEventAtVenue = venueGroup?.events[0]?.id === event.id;
                      
                      return (
                        <Card key={event.id} className="cursor-pointer hover:shadow-md" onClick={() => handleEventClick(event)}>
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              {isFirstEventAtVenue && (
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-synth-pink text-white flex items-center justify-center font-bold text-sm">
                                  {venueNumber}
                                </div>
                              )}
                              {!isFirstEventAtVenue && (
                                <div className="flex-shrink-0 w-8 h-8" />
                              )}
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold">{event.title}</h4>
                                <p className="text-sm text-muted-foreground">{event.venue_name}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {event.venue_city}{event.venue_state ? `, ${event.venue_state}` : ''}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {format(new Date(event.event_date), 'MMMM d, yyyy • h:mm a')}
                                </p>
                                {venueGroup && venueGroup.events.length > 1 && isFirstEventAtVenue && (
                                  <p className="text-xs text-muted-foreground mt-1 italic">
                                    {venueGroup.events.length} {venueGroup.events.length === 1 ? 'show' : 'shows'} at this venue
                                  </p>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>

                {/* Group Chats */}
                {groupChats.length > 0 && (
                  <div className="mt-4">
                    <h3 className="font-semibold mb-2">Related Group Chats</h3>
                    <div className="grid grid-cols-1 gap-2">
                      {groupChats.map((chat) => (
                        <Card key={chat.id} className="cursor-pointer hover:shadow-md" onClick={() => onNavigateToChat && chat.chat_id && onNavigateToChat(chat.chat_id)}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-semibold">{chat.name}</h4>
                                {chat.member_count !== undefined && (
                                  <p className="text-sm text-muted-foreground">
                                    {chat.member_count} members
                                  </p>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : selectedArtist ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No upcoming events found for {selectedArtist.name}</p>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>Search for an artist to see their tour route</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Event Details Modal */}
      <Dialog open={eventDetailsOpen} onOpenChange={setEventDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedEvent && (
            <JamBaseEventCard
              event={selectedEvent}
              currentUserId={currentUserId}
              onInterestToggle={async () => {}}
              onReview={async () => {}}
              isInterested={false}
              hasReviewed={false}
              showInterestButton={true}
              showReviewButton={true}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

