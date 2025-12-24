import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MapPin, Calendar as CalendarIcon, Route, Loader2, Search, X } from 'lucide-react';
import { EventMap } from '@/components/EventMap';
import { VenueCard } from '@/components/reviews/VenueCard';
import { LocationService } from '@/services/locationService';
import { TourTrackerService, type TourEvent, type ArtistGroupChat } from '@/services/tourTrackerService';
import { ArtistSearchBox } from '@/components/ArtistSearchBox';
import type { Artist } from '@/types/concertSearch';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import { Icon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, getDaysInMonth } from 'date-fns';
import type { JamBaseEvent } from '@/types/eventTypes';
import { supabase } from '@/integrations/supabase/client';
import type { VibeFilters } from '@/services/discoverVibeService';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { JamBaseEventCard } from '@/components/events/JamBaseEventCard';

// Fix for default markers
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const eventIcon = new Icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface MapCalendarTourSectionProps {
  currentUserId: string;
  filters?: VibeFilters;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
}

// Map Updater component
const MapUpdater = ({ center, zoom }: { center: [number, number]; zoom: number }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);
  return null;
};

export const MapCalendarTourSection: React.FC<MapCalendarTourSectionProps> = ({
  currentUserId,
  filters,
  onNavigateToProfile,
  onNavigateToChat,
}) => {
  const [activeTab, setActiveTab] = useState<'map' | 'calendar' | 'tour'>('map');
  
  // Map view state
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapEvents, setMapEvents] = useState<JamBaseEvent[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<{ id: string; name: string; lat: number; lng: number } | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  
  // Calendar view state
  const [calendarDate, setCalendarDate] = useState<Date>(() => {
    // Initialize to filtered date range start if available, otherwise current date
    return filters?.dateRange?.from || new Date();
  });
  const [calendarEvents, setCalendarEvents] = useState<Map<string, JamBaseEvent[]>>(new Map());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
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
  const mapLoadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLoadingMapRef = useRef(false);

  // Load user location and update when filters change
  useEffect(() => {
    const loadLocation = async () => {
      try {
        if (filters?.latitude && filters?.longitude) {
          setUserLocation({ latitude: filters.latitude, longitude: filters.longitude });
        } else if (!userLocation) {
          const location = await LocationService.getCurrentLocation();
          setUserLocation(location);
        }
      } catch (error) {
        console.error('Error loading location:', error);
      }
    };
    loadLocation();
  }, [filters?.latitude, filters?.longitude]);

  const loadMapEvents = useCallback(async () => {
    if (isLoadingMapRef.current) return; // Prevent concurrent calls
    
    const location = userLocation || (filters?.latitude && filters?.longitude ? { latitude: filters.latitude, longitude: filters.longitude } : null);
    if (!location) return;
    
    isLoadingMapRef.current = true;
    setMapLoading(true);
    try {
      const events = await LocationService.searchEventsByLocation({
        latitude: location.latitude,
        longitude: location.longitude,
        radius: filters?.radiusMiles || 30,
        limit: 100,
        startDate: filters?.dateRange?.from?.toISOString(),
        endDate: filters?.dateRange?.to?.toISOString(),
      });
      setMapEvents(events as JamBaseEvent[]);
    } catch (error) {
      console.error('Error loading map events:', error);
    } finally {
      setMapLoading(false);
      isLoadingMapRef.current = false;
    }
  }, [userLocation, filters?.latitude, filters?.longitude, filters?.radiusMiles, filters?.dateRange?.from, filters?.dateRange?.to]);

  // Load map events with debouncing when location filter changes
  useEffect(() => {
    if (activeTab !== 'map') return;
    
    // Clear any pending timeout
    if (mapLoadTimeoutRef.current) {
      clearTimeout(mapLoadTimeoutRef.current);
    }
    
    // Debounce the map loading
    mapLoadTimeoutRef.current = setTimeout(() => {
      if (userLocation || (filters?.latitude && filters?.longitude)) {
        loadMapEvents();
      }
    }, 300); // 300ms debounce
    
    return () => {
      if (mapLoadTimeoutRef.current) {
        clearTimeout(mapLoadTimeoutRef.current);
      }
    };
  }, [activeTab, userLocation?.latitude, userLocation?.longitude, filters?.latitude, filters?.longitude, filters?.radiusMiles, filters?.dateRange?.from?.getTime(), filters?.dateRange?.to?.getTime(), loadMapEvents]);

  // Load calendar events
  useEffect(() => {
    if (activeTab === 'calendar') {
      loadCalendarEvents();
    }
  }, [activeTab, calendarDate, filters]);

  const loadCalendarEvents = async () => {
    setCalendarLoading(true);
    try {
      const start = startOfMonth(calendarDate);
      const end = endOfMonth(calendarDate);
      
      let query = supabase
        .from('events')
        .select('*')
        .gte('event_date', start.toISOString())
        .lte('event_date', end.toISOString());

      // Apply filters
      if (filters?.dateRange?.from) {
        query = query.gte('event_date', filters.dateRange.from.toISOString());
      }
      if (filters?.dateRange?.to) {
        query = query.lte('event_date', filters.dateRange.to.toISOString());
      }
      if (filters?.genres && filters.genres.length > 0) {
        query = query.overlaps('genres', filters.genres);
      }
      if (filters?.cities && filters.cities.length > 0) {
        query = query.in('venue_city', filters.cities);
      }
      if (filters?.latitude && filters?.longitude && filters?.radiusMiles) {
        const latDelta = filters.radiusMiles / 69;
        const lngDelta = filters.radiusMiles / (69 * Math.cos(filters.latitude * Math.PI / 180));
        query = query
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .gte('latitude', filters.latitude - latDelta)
          .lte('latitude', filters.latitude + latDelta)
          .gte('longitude', filters.longitude - lngDelta)
          .lte('longitude', filters.longitude + lngDelta);
      }

      const { data, error } = await query.order('event_date', { ascending: true });

      if (error) throw error;

      // Group events by date
      const eventsByDate = new Map<string, JamBaseEvent[]>();
      (data || []).forEach((event: any) => {
        const eventDate = new Date(event.event_date);
        const dateKey = format(eventDate, 'yyyy-MM-dd');
        if (!eventsByDate.has(dateKey)) {
          eventsByDate.set(dateKey, []);
        }
        eventsByDate.get(dateKey)!.push(event as JamBaseEvent);
      });

      setCalendarEvents(eventsByDate);
    } catch (error) {
      console.error('Error loading calendar events:', error);
    } finally {
      setCalendarLoading(false);
    }
  };

  // Load tour events when artist is selected
  useEffect(() => {
    if (activeTab === 'tour' && selectedArtist) {
      loadTourData();
    }
  }, [activeTab, selectedArtist]);

  const loadTourData = async () => {
    if (!selectedArtist) return;
    setTourLoading(true);
    try {
      const events = await TourTrackerService.getArtistTourEvents(selectedArtist.name);
      setTourEvents(events);
      
      const route = TourTrackerService.calculateTourRoute(events);
      setTourRoute(route.route);
      
      const chats = await TourTrackerService.getArtistGroupChats(selectedArtist.name, currentUserId);
      setGroupChats(chats);
    } catch (error) {
      console.error('Error loading tour data:', error);
    } finally {
      setTourLoading(false);
    }
  };

  const handleVenueClick = (venueId: string, venueName: string, latitude: number, longitude: number) => {
    setSelectedVenue({ id: venueId, name: venueName, lat: latitude, lng: longitude });
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    const dateKey = format(date, 'yyyy-MM-dd');
    const events = calendarEvents.get(dateKey) || [];
    setSelectedDateEvents(events);
  };

  const getEventsForDate = (date: Date): JamBaseEvent[] => {
    const dateKey = format(date, 'yyyy-MM-dd');
    return calendarEvents.get(dateKey) || [];
  };

  const handleEventClick = (event: JamBaseEvent) => {
    setSelectedEvent(event);
    setEventDetailsOpen(true);
  };

  // Calculate map center and bounds for tour
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
            Discover events by location, date, or artist tour
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="map" className="flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Map
          </TabsTrigger>
          <TabsTrigger value="calendar" className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4" />
            Calendar
          </TabsTrigger>
          <TabsTrigger value="tour" className="flex items-center gap-2">
            <Route className="w-4 h-4" />
            Tour Tracker
          </TabsTrigger>
        </TabsList>

        {/* Map View */}
        <TabsContent value="map" className="mt-4">
          {mapLoading ? (
            <div className="flex items-center justify-center h-96">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (userLocation || (filters?.latitude && filters?.longitude)) ? (
            <div className="space-y-4">
              <div className="h-96 rounded-lg overflow-hidden border">
                <EventMap
                  center={[
                    filters?.latitude || userLocation?.latitude || 39.8283,
                    filters?.longitude || userLocation?.longitude || -98.5795
                  ]}
                  zoom={filters?.radiusMiles ? Math.max(9, 13 - Math.floor(filters.radiusMiles / 10)) : 11}
                  events={mapEvents as any}
                  onEventClick={handleEventClick}
                  showRadius={true}
                  radiusMiles={filters?.radiusMiles || 30}
                  onVenueClick={handleVenueClick}
                />
              </div>
              {selectedVenue && (
                <div className="mt-4">
                  <VenueCard
                    venueId={selectedVenue.id}
                    venueName={selectedVenue.name}
                    onClose={() => setSelectedVenue(null)}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>Loading location...</p>
            </div>
          )}
        </TabsContent>

        {/* Calendar View */}
        <TabsContent value="calendar" className="mt-4">
          {calendarLoading ? (
            <div className="flex items-center justify-center h-96">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4 flex flex-col items-center">
              <div className="w-full max-w-sm">
                <Calendar
                  mode="single"
                  selected={selectedDate || undefined}
                  onSelect={handleDateSelect}
                  month={calendarDate}
                  onMonthChange={setCalendarDate}
                  className="rounded-md border mx-auto"
                  numberOfMonths={1}
                  disabled={(date) => {
                    // If date filter is applied, disable dates outside the range
                    if (filters?.dateRange?.from && date < filters.dateRange.from) {
                      return true;
                    }
                    if (filters?.dateRange?.to && date > filters.dateRange.to) {
                      return true;
                    }
                    return false;
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
                <div className="mt-4 space-y-2">
                  <h3 className="font-semibold">
                    Events on {format(selectedDate, 'MMMM d, yyyy')}
                  </h3>
                  <div className="grid grid-cols-1 gap-2">
                    {selectedDateEvents.map((event) => (
                      <Card key={event.id} className="cursor-pointer hover:shadow-md" onClick={() => handleEventClick(event)}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-semibold">{event.title}</h4>
                              <p className="text-sm text-muted-foreground">{event.venue_name}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {format(new Date(event.event_date), 'h:mm a')}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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

            {tourLoading ? (
              <div className="flex items-center justify-center h-96">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : selectedArtist && tourEvents.length > 0 ? (
              <>
                <div className="h-96 rounded-lg overflow-hidden border">
                  <MapContainer
                    center={getTourMapCenter()}
                    zoom={5}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    <MapUpdater center={getTourMapCenter()} zoom={5} />
                    
                    {/* Draw route lines */}
                    {tourRoute.map((segment, idx) => (
                      <Polyline
                        key={idx}
                        positions={[
                          [segment.from.lat, segment.from.lng],
                          [segment.to.lat, segment.to.lng],
                        ]}
                        pathOptions={{
                          color: '#ec4899',
                          weight: 3,
                          opacity: 0.7,
                        }}
                      />
                    ))}
                    
                    {/* Event markers */}
                    {tourEvents.map((event) => (
                      <Marker
                        key={event.id}
                        position={[event.latitude, event.longitude]}
                        icon={eventIcon}
                        eventHandlers={{
                          click: () => handleEventClick(event),
                        }}
                      />
                    ))}
                  </MapContainer>
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

