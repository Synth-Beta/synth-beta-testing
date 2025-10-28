import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Icon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Calendar, MapPin, Music, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { JamBaseEventResponse } from '@/services/jambaseEventsService';
import { formatPrice } from '@/utils/currencyUtils';

// Fix for default markers in React Leaflet
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Custom marker icon for events
const eventIcon = new Icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface EventMapProps {
  center: [number, number];
  zoom: number;
  events: JamBaseEventResponse[];
  onEventClick: (event: JamBaseEventResponse) => void;
  onMapCenterChange?: (center: [number, number]) => void;
}

// Component to update map view when center/zoom changes
const MapUpdater = ({ center, zoom, onCenterChange }: { center: [number, number]; zoom: number; onCenterChange?: (center: [number, number]) => void }) => {
  const map = useMap();
  const isUserInteracting = useRef(false);
  const lastProgrammaticCenter = useRef<[number, number]>(center);
  const lastProgrammaticZoom = useRef<number>(zoom);
  
  // Update map only when programmatically changed (not from user interaction)
  useEffect(() => {
    // Check if this is a programmatic change (center/zoom changed from props, not from user drag)
    const centerChanged = 
      Math.abs(lastProgrammaticCenter.current[0] - center[0]) > 0.0001 ||
      Math.abs(lastProgrammaticCenter.current[1] - center[1]) > 0.0001;
    const zoomChanged = lastProgrammaticZoom.current !== zoom;
    
    // Only update map if it's a programmatic change and user isn't currently interacting
    if ((centerChanged || zoomChanged) && !isUserInteracting.current) {
      lastProgrammaticCenter.current = center;
      lastProgrammaticZoom.current = zoom;
      map.setView(center, zoom, { animate: false });
    }
  }, [map, center, zoom]);
  
  // Track map move events to detect when user pans/drags/zooms
  useEffect(() => {
    const handleInteractionStart = () => {
      isUserInteracting.current = true;
    };
    
    const handleInteractionEnd = () => {
      const currentCenter = map.getCenter();
      if (onCenterChange) {
        onCenterChange([currentCenter.lat, currentCenter.lng]);
      }
      // Reset flag after a delay to allow programmatic updates again
      setTimeout(() => {
        isUserInteracting.current = false;
      }, 300);
    };
    
    // Listen to all user interaction events
    map.on('movestart', handleInteractionStart);
    map.on('dragstart', handleInteractionStart);
    map.on('zoomstart', handleInteractionStart);
    map.on('wheel', handleInteractionStart);
    
    map.on('moveend', handleInteractionEnd);
    map.on('dragend', handleInteractionEnd);
    map.on('zoomend', handleInteractionEnd);
    
    return () => {
      map.off('movestart', handleInteractionStart);
      map.off('dragstart', handleInteractionStart);
      map.off('zoomstart', handleInteractionStart);
      map.off('wheel', handleInteractionStart);
      map.off('moveend', handleInteractionEnd);
      map.off('dragend', handleInteractionEnd);
      map.off('zoomend', handleInteractionEnd);
    };
  }, [map, onCenterChange]);
  
  return null;
};

// Component to track map bounds and filter visible events
const MapBoundsTracker = ({ 
  events, 
  onBoundsChange 
}: { 
  events: any[]; 
  onBoundsChange?: (visibleEvents: any[]) => void;
}) => {
  const map = useMap();
  const previousBoundsRef = useRef<string | null>(null);
  const eventsRef = useRef<any[]>(events);
  const onBoundsChangeRef = useRef(onBoundsChange);

  // Update refs when props change
  useEffect(() => {
    eventsRef.current = events;
    onBoundsChangeRef.current = onBoundsChange;
  }, [events, onBoundsChange]);

  useEffect(() => {
    const updateBounds = () => {
      const mapBounds = map.getBounds();
      const newBounds = {
        north: mapBounds.getNorth(),
        south: mapBounds.getSouth(),
        east: mapBounds.getEast(),
        west: mapBounds.getWest()
      };
      
      // Create a string key to compare bounds (avoid unnecessary updates)
      const boundsKey = `${newBounds.north.toFixed(4)}_${newBounds.south.toFixed(4)}_${newBounds.east.toFixed(4)}_${newBounds.west.toFixed(4)}`;
      
      // Only update if bounds actually changed
      if (previousBoundsRef.current === boundsKey) {
        return;
      }
      
      previousBoundsRef.current = boundsKey;

      // Filter events that are visible in the current map bounds
      const visibleEvents = eventsRef.current.filter(event => {
        if (!event.latitude || !event.longitude) return false;
        const lat = Number(event.latitude);
        const lon = Number(event.longitude);
        if (Number.isNaN(lat) || Number.isNaN(lon)) return false;
        
        // Check if event is within visible bounds
        return lat >= newBounds.south && 
               lat <= newBounds.north && 
               lon >= newBounds.west && 
               lon <= newBounds.east;
      });

      if (onBoundsChangeRef.current) {
        onBoundsChangeRef.current(visibleEvents);
      }
    };

    // Update bounds on move and zoom
    map.on('moveend', updateBounds);
    map.on('zoomend', updateBounds);
    
    // Initial bounds after a short delay to ensure map is ready
    const timeoutId = setTimeout(updateBounds, 100);

    return () => {
      clearTimeout(timeoutId);
      map.off('moveend', updateBounds);
      map.off('zoomend', updateBounds);
    };
  }, [map]); // Only depend on map, not events or callback

  return null;
};

export const EventMap: React.FC<EventMapProps> = ({ center, zoom, events, onEventClick, onMapCenterChange }) => {
  const mapRef = useRef<any>(null);
  const [visibleEvents, setVisibleEvents] = useState<any[]>([]);

  // Filter events that have valid numeric coordinates
  const validEvents = events.filter(event => {
    const lat = Number(event.latitude);
    const lon = Number(event.longitude);
    return event.latitude != null && event.longitude != null && !Number.isNaN(lat) && !Number.isNaN(lon);
  });

  // Use visible events if bounds tracking is working, otherwise fall back to all valid events
  const eventsToShow = visibleEvents.length > 0 ? visibleEvents : validEvents;

  return (
    <div className="w-full h-full">
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
        scrollWheelZoom={true}
        wheelPxPerZoomLevel={60}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        
        <MapUpdater center={center} zoom={zoom} onCenterChange={onMapCenterChange} />
        <MapBoundsTracker events={validEvents} onBoundsChange={setVisibleEvents} />
        
        {eventsToShow.map((event) => (
          <Marker
            key={event.id}
            position={[Number(event.latitude), Number(event.longitude)]}
            icon={eventIcon}
          >
            <Popup maxWidth={300} className="event-popup">
              <div className="p-2">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm text-gray-900 mb-1 truncate">
                      {event.title}
                    </h3>
                    <p className="text-sm text-blue-600 font-medium mb-1">
                      {event.artist_name}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs ml-2">
                    <Music className="w-3 h-3 mr-1" />
                    Event
                  </Badge>
                </div>
                
                <div className="space-y-2 mb-3">
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{event.venue_name}</span>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Calendar className="w-3 h-3 flex-shrink-0" />
                    <span>
                      {(() => {
                        try {
                          return format(parseISO(event.event_date), 'MMM d, yyyy h:mm a');
                        } catch {
                          return event.event_date;
                        }
                      })()}
                    </span>
                  </div>
                  
                  {event.venue_address && (
                    <p className="text-xs text-gray-500 line-clamp-2">
                      {event.venue_address}
                      {event.venue_city && `, ${event.venue_city}`}
                      {event.venue_state && `, ${event.venue_state}`}
                    </p>
                  )}
                  
                  {event.genres && event.genres.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {event.genres.slice(0, 3).map((genre, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {genre}
                        </Badge>
                      ))}
                    </div>
                  )}
                  
                  {event.price_range && (
                    <div className="flex items-center gap-2 text-xs text-green-600">
                      <Ticket className="w-3 h-3" />
                      <span>{formatPrice(event.price_range)}</span>
                    </div>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(event);
                    }}
                    className="flex-1 text-xs bg-pink-500 hover:bg-pink-600"
                  >
                    <Music className="w-3 h-3 mr-1" />
                    Review
                  </Button>
                  
                  {event.ticket_urls && event.ticket_urls.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(event.ticket_urls![0], '_blank');
                      }}
                      className="text-xs"
                    >
                      <Ticket className="w-3 h-3 mr-1" />
                      Tickets
                    </Button>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      
      {/* Event count indicator */}
      {validEvents.length > 0 && (
        <div className="absolute top-2 left-2 bg-white rounded-lg shadow-md px-3 py-1 z-[1000]">
          <span className="text-sm font-medium text-gray-700">
            {validEvents.length} event{validEvents.length !== 1 ? 's' : ''} shown
          </span>
        </div>
      )}
    </div>
  );
};

