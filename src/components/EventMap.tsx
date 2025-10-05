import React, { useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, Circle } from 'react-leaflet';
import { Icon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { JamBaseEventResponse } from '@/services/jambaseEventsService';
import { useEffect } from 'react';

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
const groupEventsByVenue = (events: (JamBaseEventResponse & { distance_miles?: number })[]): VenueWithEvents[] => {
  const venueMap = new Map<string, VenueWithEvents>();

  events.forEach(event => {
    // Skip events without coordinates
    if (!event.latitude || !event.longitude) return;
    
    const lat = Number(event.latitude);
    const lng = Number(event.longitude);
    if (isNaN(lat) || isNaN(lng)) return;

    // Create a unique key for the venue (using coordinates as fallback if venue_id is missing)
    const venueKey = event.venue_id || `${event.venue_name}-${lat}-${lng}`;
    
    if (venueMap.has(venueKey)) {
      // Add event to existing venue
      venueMap.get(venueKey)!.events.push(event);
    } else {
      // Create new venue entry
      venueMap.set(venueKey, {
        venueId: event.venue_id || venueKey,
        venueName: event.venue_name || 'Unknown Venue',
        venueAddress: event.venue_address || '',
        venueCity: event.venue_city || '',
        venueState: event.venue_state || '',
        latitude: lat,
        longitude: lng,
        events: [event]
      });
    }
  });

  // Sort events within each venue by date
  venueMap.forEach(venue => {
    venue.events.sort((a, b) => {
      const dateA = new Date(a.event_date);
      const dateB = new Date(b.event_date);
      return dateA.getTime() - dateB.getTime();
    });
  });

  return Array.from(venueMap.values());
};

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
  events: (JamBaseEventResponse & { distance_miles?: number })[];
  onEventClick: (event: JamBaseEventResponse) => void;
  onMapMove?: (bounds: { north: number; south: number; east: number; west: number }) => void;
  showRadius?: boolean;
  radiusMiles?: number;
  onVenueClick?: (venueId: string, venueName: string, latitude: number, longitude: number) => void;
}

// Component to update map view when center/zoom changes
const MapUpdater = ({ center, zoom }: { center: [number, number]; zoom: number }) => {
  const map = useMap();
  
  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);
  
  return null;
};

// Component to handle map move events and notify parent
const MapMoveHandler = ({ onMapMove }: { onMapMove?: (bounds: { north: number; south: number; east: number; west: number }) => void }) => {
  const map = useMap();
  
  useEffect(() => {
    if (!onMapMove) return;
    
    const handleMoveEnd = () => {
      const bounds = map.getBounds();
      onMapMove({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      });
    };
    
    // Initial call
    handleMoveEnd();
    
    // Add event listeners
    map.on('moveend', handleMoveEnd);
    map.on('zoomend', handleMoveEnd);
    
    return () => {
      map.off('moveend', handleMoveEnd);
      map.off('zoomend', handleMoveEnd);
    };
  }, [map, onMapMove]);
  
  return null;
};

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
  const mapRef = useRef<any>(null);

  // Filter events that have valid numeric coordinates
  const validEvents = events.filter(event => {
    const lat = Number(event.latitude);
    const lon = Number(event.longitude);
    return event.latitude != null && event.longitude != null && !Number.isNaN(lat) && !Number.isNaN(lon);
  });

  // Group events by venue
  const venuesWithEvents = groupEventsByVenue(validEvents);

  return (
    <div className="w-full h-full">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
        .venue-popup .leaflet-popup-content {
          margin: 0;
          padding: 0;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }
      `}</style>
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
        <MapMoveHandler onMapMove={onMapMove} />
        
        {/* Show radius circle when location filter is active */}
        {showRadius && (
          <Circle
            center={center}
            radius={radiusMiles * 1609.34} // Convert miles to meters
            pathOptions={{
              color: '#ec4899',
              fillColor: '#ec4899',
              fillOpacity: 0.1,
              weight: 2,
              opacity: 0.6
            }}
          />
        )}
        
        {venuesWithEvents.map((venue) => (
          <Marker
            key={venue.venueId}
            position={[venue.latitude, venue.longitude]}
            icon={eventIcon}
            eventHandlers={{
              click: () => {
                if (onVenueClick) {
                  // Venue clicked
                  onVenueClick(venue.venueId, venue.venueName, venue.latitude, venue.longitude);
                }
              }
            }}
          />
        ))}
      </MapContainer>
      
      {/* Venue count indicator removed - user wants nothing to show on map */}
    </div>
  );
};

