/**
 * Demo MapCalendarTourSection - Pre-populated with mock tour data
 * 
 * Same layout and components as production MapCalendarTourSection
 * but pre-populated with mock tour data so the tour tracker is visible immediately.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar as CalendarIcon, Route, Trophy, Music, MapPin, X } from 'lucide-react';
import type { TourEvent, ArtistGroupChat } from '@/services/tourTrackerService';
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
import type { VibeFilters } from '@/services/discoverVibeService';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { SwiftUIEventCard } from '@/components/events/SwiftUIEventCard';
import { CompactEventCard } from '@/components/home/CompactEventCard';
import { SynthLoadingInline } from '@/components/ui/SynthLoader';
import { DEMO_TOUR_ARTIST, DEMO_TOUR_EVENTS } from '../data/mockData';

// Create numbered marker icon factory
const createNumberedIcon = (number: number) => {
  return divIcon({
    className: 'custom-numbered-marker',
    html: `
      <div style="
        width: 32px;
        height: 32px;
        background: #ec4899;
        border: 3px solid white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 14px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      ">
        ${number}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

// Map bounds fitter component
const MapBoundsFitter: React.FC<{ events: TourEvent[] }> = ({ events }) => {
  const map = useMap();

  useEffect(() => {
    if (events.length === 0) return;

    const bounds = latLngBounds(
      events.map(e => [e.latitude, e.longitude])
    );

    map.fitBounds(bounds, {
      padding: [50, 50],
      maxZoom: 10,
    });
  }, [map, events]);

  return null;
};

interface DemoMapCalendarTourSectionProps {
  currentUserId: string;
  filters: VibeFilters;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
}

export const DemoMapCalendarTourSection: React.FC<DemoMapCalendarTourSectionProps> = ({
  currentUserId,
  filters,
  onNavigateToProfile,
  onNavigateToChat,
}) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'calendar' | 'leaderboards' | 'tour'>('calendar');
  
  // Tour tracker state - pre-populated with mock data
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(DEMO_TOUR_ARTIST);
  const [tourEvents, setTourEvents] = useState<TourEvent[]>(DEMO_TOUR_EVENTS);
  const [tourRoute, setTourRoute] = useState<Array<{ from: { lat: number; lng: number; city: string }; to: { lat: number; lng: number; city: string } }>>(() => {
    // Calculate route from mock events
    const sortedEvents = [...DEMO_TOUR_EVENTS].sort((a, b) => {
      const dateA = new Date(a.event_date).getTime();
      const dateB = new Date(b.event_date).getTime();
      return dateA - dateB;
    });

    const route: Array<{ from: { lat: number; lng: number; city: string }; to: { lat: number; lng: number; city: string } }> = [];
    for (let i = 0; i < sortedEvents.length - 1; i++) {
      const from = sortedEvents[i];
      const to = sortedEvents[i + 1];
      if (from.latitude && from.longitude && to.latitude && to.longitude) {
        route.push({
          from: {
            lat: from.latitude,
            lng: from.longitude,
            city: from.venue_city,
          },
          to: {
            lat: to.latitude,
            lng: to.longitude,
            city: to.venue_city,
          },
        });
      }
    }
    return route;
  });
  const [groupChats, setGroupChats] = useState<ArtistGroupChat[]>([]);
  const [tourLoading, setTourLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<JamBaseEvent | null>(null);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);

  // Calendar view state (empty for demo)
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedDateEvents, setSelectedDateEvents] = useState<JamBaseEvent[]>([]);

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    // In demo mode, no events to show
    setSelectedDateEvents([]);
  };

  const handleEventClick = (event: JamBaseEvent) => {
    setSelectedEvent(event);
    setEventDetailsOpen(true);
  };

  // Group venues by location (same lat/lng = same venue)
  const groupedVenues = tourEvents.reduce((acc, event, index) => {
    const key = `${event.latitude},${event.longitude}`;
    if (!acc[key]) {
      acc[key] = {
        venueKey: key,
        latitude: event.latitude,
        longitude: event.longitude,
        venueName: event.venue_name,
        city: event.venue_city,
        number: Object.keys(acc).length + 1,
        events: [],
      };
    }
    acc[key].events.push(event);
    return acc;
  }, {} as Record<string, { venueKey: string; latitude: number; longitude: number; venueName: string; city: string; number: number; events: TourEvent[] }>);

  const groupedVenueRoute = tourRoute.map(segment => ({
    from: segment.from,
    to: segment.to,
  }));

  const sortedTourEvents = [...tourEvents].sort((a, b) => {
    const dateA = new Date(a.event_date).getTime();
    const dateB = new Date(b.event_date).getTime();
    return dateA - dateB;
  });

  const getTourMapCenter = (): [number, number] => {
    if (tourEvents.length === 0) return [40.7128, -74.0060]; // Default to NYC
    const avgLat = tourEvents.reduce((sum, e) => sum + e.latitude, 0) / tourEvents.length;
    const avgLng = tourEvents.reduce((sum, e) => sum + e.longitude, 0) / tourEvents.length;
    return [avgLat, avgLng] as [number, number]; // Explicitly type as LatLngTuple
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
          <div className="space-y-4 flex flex-col items-center justify-center">
            <div className="flex justify-center w-full">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                month={calendarDate}
                onMonthChange={setCalendarDate}
                className="rounded-md border"
                numberOfMonths={1}
                disabled={(date) => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const dateToCheck = new Date(date);
                  dateToCheck.setHours(0, 0, 0, 0);
                  return dateToCheck < today;
                }}
              />
            </div>
            {selectedDate && selectedDateEvents.length === 0 && (
              <div className="mt-4 text-center text-muted-foreground">
                <p>No events found for the selected date.</p>
                <p className="text-xs mt-1">Demo mode: Calendar is visible but no events are loaded.</p>
              </div>
            )}
          </div>
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

        {/* Tour Tracker View - Pre-populated with mock data */}
        <TabsContent value="tour" className="mt-4">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Search for an Artist</label>
              <ArtistSearchBox
                onArtistSelect={(artist) => {
                  setSelectedArtist(artist);
                  // In demo mode, keep using mock data
                  setTourEvents(DEMO_TOUR_EVENTS);
                }}
                placeholder="Search for an artist to track their tour..."
              />
            </div>

            {/* Artist Banner */}
            {selectedArtist && (
              <Card 
                className="overflow-hidden border-2 border-synth-pink/20 shadow-lg cursor-pointer hover:shadow-xl transition-shadow"
                onClick={() => {
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
                        />
                      ) : (
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
                            e.stopPropagation();
                            setSelectedArtist(null);
                            setTourEvents([]);
                            setTourRoute([]);
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
              <SynthLoadingInline text="Loading tour data..." size="lg" />
            ) : selectedArtist && tourEvents.length > 0 ? (
              <>
                <div className="h-96 rounded-lg overflow-hidden border relative z-0">
                  <MapContainer
                    center={getTourMapCenter()}
                    zoom={5}
                    style={{ height: '100%', width: '100%', zIndex: 0 }}
                    boundsOptions={{ padding: [50, 50] }}
                  >
                    {(() => {
                      const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.VITE_MAPBOX_KEY;
                      // SECURITY NOTE: Never use fallback tokens in production
                      // In development, maps will fail gracefully if token is not configured
                      // This prevents exposing hardcoded tokens that could be extracted from source
                      if (!mapboxToken) {
                        console.error('❌ Mapbox token not configured. Maps will not render. Set VITE_MAPBOX_TOKEN or VITE_MAPBOX_KEY environment variable.');
                        return null; // Don't render map without valid token
                      }
                      return (
                        <TileLayer
                          url={`https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`}
                          attribution='&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        />
                      );
                    })()}
                    <MapBoundsFitter events={sortedTourEvents} />
                    
                    {/* Draw route lines with arrowheads */}
                    {groupedVenueRoute.map((segment, idx) => {
                      const lat1 = segment.from.lat;
                      const lng1 = segment.from.lng;
                      const lat2 = segment.to.lat;
                      const lng2 = segment.to.lng;
                      
                      const dLat = lat2 - lat1;
                      const dLng = lng2 - lng1;
                      
                      const arrowLat = lat1 + dLat * 0.85;
                      const arrowLng = lng1 + dLng * 0.85;
                      
                      const angleRad = Math.atan2(dLat, dLng);
                      const angleDeg = angleRad * 180 / Math.PI;
                      
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
                    
                    {/* Numbered venue markers */}
                    {Object.values(groupedVenues).map((venueGroup) => (
                      <Marker
                        key={`${venueGroup.venueKey}-${venueGroup.number}`}
                        position={[venueGroup.latitude, venueGroup.longitude]}
                        icon={createNumberedIcon(venueGroup.number)}
                        eventHandlers={{
                          click: () => {
                            if (venueGroup.events.length > 0) {
                              handleEventClick(venueGroup.events[0]);
                            }
                          },
                        }}
                      />
                    ))}
                  </MapContainer>
                </div>

                {/* Tour Events List */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">Tour Dates</h3>
                  <div className="grid grid-cols-1 gap-3">
                    {sortedTourEvents.map((event) => (
                      <Card 
                        key={event.id} 
                        className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => handleEventClick(event)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <h4 className="font-semibold mb-1">{event.title}</h4>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                                <MapPin className="w-4 h-4" />
                                <span>{event.venue_name}, {event.venue_city}</span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(event.event_date), 'EEEE, MMMM d, yyyy • h:mm a')}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Route className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Select an artist to see their tour dates on the map</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Event Details Modal */}
      <Dialog open={eventDetailsOpen} onOpenChange={setEventDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedEvent && (
            <SwiftUIEventCard
              event={selectedEvent}
              currentUserId={currentUserId}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
