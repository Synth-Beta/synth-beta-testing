import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Icon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Calendar, MapPin, Music, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { JamBaseEventResponse } from '@/services/jambaseEventsService';

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
  showCountBadge?: boolean;
}

// Component to update map view when center/zoom changes
const MapUpdater = ({ center, zoom }: { center: [number, number]; zoom: number }) => {
  const map = useMap();
  
  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);
  
  return null;
};

export const EventMap: React.FC<EventMapProps> = ({ center, zoom, events, onEventClick, showCountBadge = true }) => {
  const mapRef = useRef<any>(null);

  // Filter events that have valid numeric coordinates
  const validEvents = events.filter(event => {
    const lat = Number(event.latitude);
    const lon = Number(event.longitude);
    return event.latitude != null && event.longitude != null && !Number.isNaN(lat) && !Number.isNaN(lon);
  });

  return (
    <div className="w-full h-full">
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        
        <MapUpdater center={center} zoom={zoom} />
        
        {validEvents.map((event) => (
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
                      <span>{event.price_range}</span>
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
      {showCountBadge && validEvents.length > 0 && (
        <div className="absolute top-2 left-2 bg-white rounded-lg shadow-md px-3 py-1 z-[1000]">
          <span className="text-sm font-medium text-gray-700">
            {validEvents.length} event{validEvents.length !== 1 ? 's' : ''} shown
          </span>
        </div>
      )}
    </div>
  );
};

