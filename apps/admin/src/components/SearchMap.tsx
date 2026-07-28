import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EventMap } from './EventMap';
import { LocationService } from '@/services/locationService';
import { JamBaseEventsService, JamBaseEventResponse } from '@/services/jambaseEventsService';
import { JamBaseLocationService } from '@/services/jambaseLocationService';
import { RadiusSearchService, EventWithDistance } from '@/services/radiusSearchService';
import { supabase } from '@/integrations/supabase/client';
import { 
  MapPin,
  Search,
  Navigation as NavigationIcon,
  RefreshCw
} from 'lucide-react';
import { SynthSLogo } from '@/components/SynthSLogo';
import { useToast } from '@/hooks/use-toast';

interface SearchMapProps {
  userId: string;
}

export const SearchMap = ({ userId }: SearchMapProps) => {
  const [mapLocation, setMapLocation] = useState('');
  const [mapCenter, setMapCenter] = useState<[number, number]>([39.8283, -98.5795]); // Center of US
  const [mapZoom, setMapZoom] = useState(4);
  const [upcomingEvents, setUpcomingEvents] = useState<EventWithDistance[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | undefined>();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [radiusMiles, setRadiusMiles] = useState(25);
  const { toast } = useToast();

  // Initialize user location and load events
  useEffect(() => {
    console.log('🗺️ SearchMap: Initializing map component');
    
    // Try to get user's location for better recommendations
    LocationService.getCurrentLocation()
      .then(async location => {
        setUserLocation(location);
        setMapCenter([location.latitude, location.longitude]);
        setMapZoom(10);
        
        // Search for events near user's location using JamBase cities API
        try {
          console.log('🔍 Auto-fetching events near user location via cities...');
          const locationResult = await JamBaseLocationService.searchEventsViaCities(location, 100);
          
          if (locationResult.events.length > 0) {
            setUpcomingEvents(locationResult.events);
            toast({
              title: "Events Found Near You",
              description: `Found ${locationResult.events.length} events near your location (${locationResult.source})`,
            });
            console.log(`✅ Found ${locationResult.events.length} events from ${locationResult.source}`);
          } else {
            console.log('📭 No events found near user location, trying database fallback...');
            // Fallback to regular database search
            await loadUpcomingEvents();
            toast({
              title: "No Local Events",
              description: "No events found near your location. Showing general events instead.",
              variant: "default",
            });
          }
        } catch (error) {
          console.error('Error searching events for user location:', error);
          await loadUpcomingEvents();
          toast({
            title: "Location Search Failed",
            description: "Could not search for events near your location. Showing general events instead.",
            variant: "destructive",
          });
        }
      })
      .catch(error => {
        console.log('Could not get user location:', error);
        // Continue without location - load events from database
        loadUpcomingEvents();
        toast({
          title: "Location Access Denied",
          description: "Could not access your location. Showing general events instead.",
          variant: "default",
        });
      });
  }, [userId]);

  const loadUpcomingEvents = async () => {
    try {
      // Get events from database
      const { data: events, error } = await supabase
        .from('jambase_events')
        .select('*')
        .gte('event_date', new Date().toISOString())
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .order('event_date', { ascending: true })
        .limit(50);

      if (error) throw error;

      const transformedEvents: JamBaseEventResponse[] = (events || []).map(event => ({
        id: event.id,
        jambase_event_id: event.jambase_event_id,
        title: event.title,
        artist_name: event.artist_name,
        artist_id: event.artist_id || '',
        venue_name: event.venue_name,
        venue_id: event.venue_id || '',
        event_date: event.event_date,
        doors_time: event.doors_time,
        description: event.description,
        genres: event.genres,
        venue_address: event.venue_address,
        venue_city: event.venue_city,
        venue_state: event.venue_state,
        venue_zip: event.venue_zip,
        latitude: event.latitude ? Number(event.latitude) : undefined,
        longitude: event.longitude ? Number(event.longitude) : undefined,
        ticket_available: event.ticket_available,
        price_range: event.price_range,
        ticket_urls: event.ticket_urls,
        setlist: event.setlist,
        tour_name: event.tour_name,
        created_at: event.created_at,
        updated_at: event.updated_at
      }));

      setUpcomingEvents(transformedEvents);
    } catch (error) {
      console.error('Error loading upcoming events:', error);
    }
  };

  const handleLocationSearch = async () => {
    if (!mapLocation.trim()) return;

    try {
      console.log(`🔍 Searching for events near: ${mapLocation} with radius: ${radiusMiles} miles...`);
      
      // Check if it's a zip code or city
      const isZipCode = /^\d{5}(-\d{4})?$/.test(mapLocation.trim());
      
      let events: EventWithDistance[] = [];
      let mapConfig;
      
      if (isZipCode) {
        // Search by zip code
        events = await RadiusSearchService.getEventsNearZip({
          zipCode: mapLocation.trim(),
          radiusMiles,
          limit: 100
        });
        
        // Get coordinates for the zip code to center the map
        const zipCoords = await RadiusSearchService.getZipCoordinates(mapLocation.trim());
        if (zipCoords) {
          mapConfig = {
            center: [zipCoords.lat, zipCoords.lng] as [number, number],
            zoom: 10
          };
        }
      } else {
        // Search by city
        const [city, state] = mapLocation.split(',').map(s => s.trim());
        events = await RadiusSearchService.getEventsNearCity({
          city,
          state: state || undefined,
          radiusMiles,
          limit: 100
        });
        
        // Get coordinates for the city to center the map
        const cityCoords = await RadiusSearchService.getCityCoordinates(city, state);
        if (cityCoords) {
          mapConfig = {
            center: [cityCoords.lat, cityCoords.lng] as [number, number],
            zoom: 10
          };
        }
      }
      
      // Update map configuration based on events found
      if (events.length > 0) {
        const eventMapConfig = RadiusSearchService.getMapConfigForEvents(events, mapConfig?.center);
        setMapCenter(eventMapConfig.center);
        setMapZoom(eventMapConfig.zoom);
        setUpcomingEvents(events);
        
        toast({
          title: "Events Found",
          description: `Found ${events.length} events within ${radiusMiles} miles of ${mapLocation}`,
        });
        console.log(`✅ Found ${events.length} events within ${radiusMiles} miles of ${mapLocation}`);
      } else {
        // Center on the searched location even if no events found
        if (mapConfig) {
          setMapCenter(mapConfig.center);
          setMapZoom(mapConfig.zoom);
        }
        setUpcomingEvents([]);
        
        toast({
          title: "No Events Found",
          description: `No events found within ${radiusMiles} miles of ${mapLocation}. Try a different location or increase the radius.`,
          variant: "default",
        });
        console.log(`📭 No events found within ${radiusMiles} miles of ${mapLocation}`);
      }
    } catch (error) {
      console.error('Error searching location:', error);
      toast({
        title: "Search Error",
        description: "Failed to search for location. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleRefreshEvents = async () => {
    if (!userLocation) {
      toast({
        title: "No Location",
        description: "Please allow location access to refresh events",
        variant: "destructive",
      });
      return;
    }

    setIsRefreshing(true);
    try {
      console.log(`🔄 Refreshing events for user location with ${radiusMiles} mile radius...`);
      
      // Use radius search service to find events near user location
      const events = await RadiusSearchService.getEventsNearCity({
        city: 'Current Location', // This will use the coordinates directly
        radiusMiles,
        limit: 100
      });
      
      if (events.length > 0) {
        const mapConfig = RadiusSearchService.getMapConfigForEvents(events);
        setMapCenter(mapConfig.center);
        setMapZoom(mapConfig.zoom);
        setUpcomingEvents(events);
        
        toast({
          title: "Events Refreshed",
          description: `Found ${events.length} events within ${radiusMiles} miles of your location`,
        });
        console.log(`✅ Refreshed ${events.length} events within ${radiusMiles} miles`);
      } else {
        toast({
          title: "No New Events",
          description: `No events found within ${radiusMiles} miles of your location`,
          variant: "default",
        });
        console.log(`📭 No events found within ${radiusMiles} miles after refresh`);
      }
    } catch (error) {
      console.error('Error refreshing events:', error);
      toast({
        title: "Refresh Failed",
        description: "Failed to refresh events. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Card className="synth-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SynthSLogo size="sm" />
          <MapPin className="w-5 h-5" />
          Upcoming Events Near You
        </CardTitle>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Enter city name or zip code (e.g., New York, 10001)"
              value={mapLocation}
              onChange={(e) => setMapLocation(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleLocationSearch()}
              className="flex-1"
            />
            <Button onClick={handleLocationSearch} variant="outline">
              <Search className="w-4 h-4" />
            </Button>
            {userLocation && (
              <Button 
                onClick={handleRefreshEvents} 
                variant="outline"
                disabled={isRefreshing}
                title="Refresh events for your location"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Search radius:</span>
            <Select value={radiusMiles.toString()} onValueChange={(value) => setRadiusMiles(Number(value))}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 mi</SelectItem>
                <SelectItem value="25">25 mi</SelectItem>
                <SelectItem value="50">50 mi</SelectItem>
                <SelectItem value="100">100 mi</SelectItem>
                <SelectItem value="200">200 mi</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="w-full h-96 rounded-lg overflow-hidden">
          <EventMap
            center={mapCenter}
            zoom={mapZoom}
            events={upcomingEvents}
            onEventClick={(event) => {
              console.log('Event clicked:', event);
              // You can add event click handling here
            }}
          />
        </div>
        {userLocation && (
          <div className="mt-4 text-xs text-gray-500 flex items-center gap-1">
            <NavigationIcon className="w-3 h-3" />
            Personalized for your location
          </div>
        )}
        {upcomingEvents.length > 0 && (
          <div className="mt-4 text-sm text-gray-600">
            Showing {upcomingEvents.length} events on the map
          </div>
        )}
      </CardContent>
    </Card>
  );
};
