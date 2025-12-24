import React, { useState, useCallback, useEffect, useRef } from 'react';
import MapGL, { Marker, Popup, NavigationControl, FullscreenControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Calendar, MapPin, Music, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { JamBaseEventResponse } from '@/types/eventTypes';
import { formatPrice } from '@/utils/currencyUtils';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

interface EventMapProps {
  center: [number, number];
  zoom: number;
  events: JamBaseEventResponse[];
  onEventClick: (event: JamBaseEventResponse) => void;
  onMapCenterChange?: (center: [number, number]) => void;
}

export const EventMap: React.FC<EventMapProps> = ({ 
  center, 
  zoom, 
  events, 
  onEventClick,
  onMapCenterChange 
}) => {
  const [viewState, setViewState] = useState({
    longitude: center[1],
    latitude: center[0],
    zoom: zoom,
  });
  const [selectedEvent, setSelectedEvent] = useState<JamBaseEventResponse | null>(null);
  const isUserInteracting = useRef(false);
  const lastProgrammaticCenter = useRef<[number, number]>(center);
  const lastProgrammaticZoom = useRef<number>(zoom);

  // Update view state when center/zoom props change (programmatically)
  useEffect(() => {
    const centerChanged = 
      Math.abs(lastProgrammaticCenter.current[0] - center[0]) > 0.0001 ||
      Math.abs(lastProgrammaticCenter.current[1] - center[1]) > 0.0001;
    const zoomChanged = lastProgrammaticZoom.current !== zoom;
    
    if ((centerChanged || zoomChanged) && !isUserInteracting.current) {
      lastProgrammaticCenter.current = center;
      lastProgrammaticZoom.current = zoom;
      setViewState({
        longitude: center[1],
        latitude: center[0],
        zoom: zoom,
      });
    }
  }, [center, zoom]);

  const handleMove = useCallback((evt: any) => {
    isUserInteracting.current = true;
    setViewState(evt.viewState);
    if (onMapCenterChange) {
      onMapCenterChange([evt.viewState.latitude, evt.viewState.longitude]);
    }
    // Reset flag after interaction
    setTimeout(() => {
      isUserInteracting.current = false;
    }, 300);
  }, [onMapCenterChange]);

  // Filter events that have valid numeric coordinates
  const validEvents = events.filter(event => {
    const lat = Number(event.latitude);
    const lon = Number(event.longitude);
    return event.latitude != null && event.longitude != null && !Number.isNaN(lat) && !Number.isNaN(lon);
  });

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
        <div className="text-center p-4">
          <p className="text-gray-500 mb-2">Mapbox token not configured</p>
          <p className="text-xs text-gray-400">Add VITE_MAPBOX_ACCESS_TOKEN to .env file</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full rounded-lg overflow-hidden">
      <MapGL
        {...viewState}
        onMove={handleMove}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
        scrollZoom={true}
        doubleClickZoom={true}
        dragRotate={false}
        touchZoomRotate={true}
      >
        <NavigationControl position="top-right" />
        <FullscreenControl position="top-right" />
        
        {validEvents.map((event) => {
          const lat = Number(event.latitude);
          const lon = Number(event.longitude);
          
          return (
            <Marker
              key={event.id}
              longitude={lon}
              latitude={lat}
              anchor="bottom"
              onClick={() => {
                setSelectedEvent(event);
                onEventClick(event);
              }}
            >
              <div className="cursor-pointer transform transition-transform hover:scale-110">
                <MapPin className="w-6 h-6 text-pink-500 fill-white drop-shadow-lg" />
              </div>
            </Marker>
          );
        })}

        {selectedEvent && selectedEvent.latitude && selectedEvent.longitude && (
          <Popup
            longitude={Number(selectedEvent.longitude)}
            latitude={Number(selectedEvent.latitude)}
            anchor="bottom"
            onClose={() => setSelectedEvent(null)}
            closeButton={true}
            closeOnClick={false}
            className="event-popup"
          >
            <div className="p-2 max-w-xs">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm text-gray-900 mb-1 truncate">
                    {selectedEvent.title || selectedEvent.artist_name}
                  </h3>
                  {selectedEvent.artist_name && (
                    <p className="text-sm text-blue-600 font-medium mb-1">
                      {selectedEvent.artist_name}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className="text-xs ml-2">
                  <Music className="w-3 h-3 mr-1" />
                  Event
                </Badge>
              </div>
              
              <div className="space-y-2 mb-3">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{selectedEvent.venue_name}</span>
                </div>
                
                {selectedEvent.event_date && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Calendar className="w-3 h-3 flex-shrink-0" />
                    <span>
                      {(() => {
                        try {
                          return format(parseISO(selectedEvent.event_date), 'MMM d, yyyy h:mm a');
                        } catch {
                          return selectedEvent.event_date;
                        }
                      })()}
                    </span>
                  </div>
                )}
                
                {selectedEvent.venue_address && (
                  <p className="text-xs text-gray-500 line-clamp-2">
                    {selectedEvent.venue_address}
                    {selectedEvent.venue_city && `, ${selectedEvent.venue_city}`}
                    {selectedEvent.venue_state && `, ${selectedEvent.venue_state}`}
                  </p>
                )}
                
                {selectedEvent.genres && selectedEvent.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedEvent.genres.slice(0, 3).map((genre, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {genre}
                      </Badge>
                    ))}
                  </div>
                )}
                
                {selectedEvent.price_range && (
                  <div className="flex items-center gap-2 text-xs text-green-600">
                    <Ticket className="w-3 h-3" />
                    <span>{formatPrice(selectedEvent.price_range)}</span>
                  </div>
                )}
              </div>
              
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick(selectedEvent);
                    setSelectedEvent(null);
                  }}
                  className="flex-1 text-xs bg-pink-500 hover:bg-pink-600"
                >
                  <Music className="w-3 h-3 mr-1" />
                  Review
                </Button>
                
                {selectedEvent.ticket_urls && selectedEvent.ticket_urls.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(selectedEvent.ticket_urls![0], '_blank');
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
        )}
      </MapGL>
    </div>
  );
};
