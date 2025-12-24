import React, { useState, useCallback, useEffect, useRef } from 'react';
import MapGL, { Marker, Popup, NavigationControl, FullscreenControl, Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin } from 'lucide-react';
import { JamBaseEventResponse } from '@/types/eventTypes';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

// Venue grouping interface
interface VenueWithEvents {
  venueId: string;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  venueState: string;
  latitude: number;
  longitude: number;
  events: (JamBaseEventResponse & { distance_miles?: number })[];
}

// Utility function to group events by venue
// Using plain object instead of Map to avoid constructor conflicts
const groupEventsByVenue = (events: (JamBaseEventResponse & { distance_miles?: number })[]): VenueWithEvents[] => {
  const venueMap: Record<string, VenueWithEvents> = {};

  events.forEach(event => {
    // Skip events without coordinates
    if (!event.latitude || !event.longitude) return;
    
    const lat = Number(event.latitude);
    const lng = Number(event.longitude);
    if (isNaN(lat) || isNaN(lng)) return;

    // Create a unique key for the venue (using coordinates as fallback if venue_id is missing)
    const venueKey = event.venue_id || `${event.venue_name}-${lat}-${lng}`;
    
    if (venueMap[venueKey]) {
      // Add event to existing venue
      venueMap[venueKey].events.push(event);
    } else {
      // Create new venue entry
      venueMap[venueKey] = {
        venueId: event.venue_id || venueKey,
        venueName: event.venue_name || 'Unknown Venue',
        venueAddress: event.venue_address || '',
        venueCity: event.venue_city || '',
        venueState: event.venue_state || '',
        latitude: lat,
        longitude: lng,
        events: [event]
      };
    }
  });

  // Sort events within each venue by date
  Object.values(venueMap).forEach(venue => {
    venue.events.sort((a, b) => {
      const dateA = new Date(a.event_date);
      const dateB = new Date(b.event_date);
      return dateA.getTime() - dateB.getTime();
    });
  });

  return Object.values(venueMap);
};

interface EventMapProps {
  center: [number, number];
  zoom: number;
  events: (JamBaseEventResponse & { distance_miles?: number })[];
  onEventClick: (event: JamBaseEventResponse) => void;
  onMapMove?: (bounds: { north: number; south: number; east: number; west: number }) => void;
  showRadius?: boolean;
  radiusMiles?: number;
  onVenueClick?: (venueId: string, venueName: string, latitude: number, longitude: number) => void;
}

export const EventMap: React.FC<EventMapProps> = ({ 
  center, 
  zoom, 
  events, 
  onEventClick, 
  onMapMove,
  showRadius = false,
  radiusMiles = 30,
  onVenueClick
}) => {
  const [viewState, setViewState] = useState({
    longitude: center[1],
    latitude: center[0],
    zoom: zoom,
  });
  const [selectedVenue, setSelectedVenue] = useState<VenueWithEvents | null>(null);
  const mapRef = useRef<any>(null);

  // Update view state when center/zoom props change
  useEffect(() => {
    setViewState({
      longitude: center[1],
      latitude: center[0],
      zoom: zoom,
    });
  }, [center, zoom]);

  const handleMove = useCallback((evt: any) => {
    setViewState(evt.viewState);
    
    if (onMapMove && mapRef.current) {
      const bounds = mapRef.current.getBounds();
      onMapMove({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      });
    }
  }, [onMapMove]);

  // Filter events that have valid numeric coordinates
  const validEvents = events.filter(event => {
    if (!event) return false;
    const lat = Number(event.latitude);
    const lon = Number(event.longitude);
    return event.latitude != null && event.longitude != null && !Number.isNaN(lat) && !Number.isNaN(lon);
  });

  // Group events by venue
  const venuesWithEvents = groupEventsByVenue(validEvents);

  // Create circle data for radius display
  const circleData = showRadius ? {
    type: 'Feature' as const,
    geometry: {
      type: 'Point' as const,
      coordinates: [center[1], center[0]]
    },
    properties: {}
  } : null;

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
    <div className="w-full h-full">
      <MapGL
        {...viewState}
        onMove={handleMove}
        ref={mapRef}
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

        {/* Show radius circle when location filter is active */}
        {showRadius && circleData && (
          <Source id="radius-circle" type="geojson" data={circleData}>
            <Layer
              id="radius-circle-layer"
              type="circle"
              paint={{
                'circle-radius': radiusMiles * 1609.34, // Convert miles to meters
                'circle-color': '#ec4899',
                'circle-opacity': 0.1,
                'circle-stroke-color': '#ec4899',
                'circle-stroke-width': 2,
                'circle-stroke-opacity': 0.6
              }}
            />
          </Source>
        )}
        
        {venuesWithEvents.map((venue) => (
          <Marker
            key={venue.venueId}
            longitude={venue.longitude}
            latitude={venue.latitude}
            anchor="bottom"
            onClick={() => {
              if (onVenueClick) {
                onVenueClick(venue.venueId, venue.venueName, venue.latitude, venue.longitude);
              }
              setSelectedVenue(venue);
            }}
          >
            <div className="cursor-pointer transform transition-transform hover:scale-110">
              <MapPin className="w-6 h-6 text-pink-500 fill-white drop-shadow-lg" />
            </div>
          </Marker>
        ))}

        {selectedVenue && (
          <Popup
            longitude={selectedVenue.longitude}
            latitude={selectedVenue.latitude}
            anchor="bottom"
            onClose={() => setSelectedVenue(null)}
            closeButton={true}
            closeOnClick={false}
          >
            <div className="p-3 max-w-xs max-h-96 overflow-y-auto">
              <h3 className="font-semibold text-sm mb-2">{selectedVenue.venueName}</h3>
              <p className="text-xs text-gray-600 mb-3">
                {selectedVenue.venueAddress}
                {selectedVenue.venueCity && `, ${selectedVenue.venueCity}`}
                {selectedVenue.venueState && `, ${selectedVenue.venueState}`}
              </p>
              
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-700 mb-2">
                  {selectedVenue.events.length} event{selectedVenue.events.length !== 1 ? 's' : ''}:
                </p>
                {selectedVenue.events.map((event, index) => (
                  <div
                    key={event.id || index}
                    onClick={() => {
                      onEventClick(event);
                      setSelectedVenue(null);
                    }}
                    className="p-2 rounded border border-gray-200 hover:border-pink-500 hover:bg-pink-50 cursor-pointer transition-colors"
                  >
                    <p className="font-medium text-sm text-gray-900 mb-1">
                      {event.title || event.artist_name}
                    </p>
                    {event.event_date && (
                      <p className="text-xs text-gray-600">
                        {new Date(event.event_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Popup>
        )}
      </MapGL>
    </div>
  );
};
