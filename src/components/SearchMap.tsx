import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EventMap } from './EventMap';
import { LocationService } from '@/services/locationService';
import { JamBaseEventsService, JamBaseEventResponse } from '@/services/jambaseEventsService';
import { JamBaseLocationService } from '@/services/jambaseLocationService';
import { supabase } from '@/integrations/supabase/client';
import { 
  MapPin,
  Search,
  Navigation as NavigationIcon,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SearchMapProps {
  userId: string;
}

export const SearchMap = ({ userId }: SearchMapProps) => {
  const [mapLocation, setMapLocation] = useState('');
  const [mapCenter, setMapCenter] = useState<[number, number]>([39.8283, -98.5795]); // Center of US
  const [mapZoom, setMapZoom] = useState(4);
  const [upcomingEvents, setUpcomingEvents] = useState<JamBaseEventResponse[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | undefined>();
  const [isRefreshing, setIsRefreshing] = useState(false);
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
      console.log(`🔍 Searching for events near: ${mapLocation} via cities...`);
      const result = await JamBaseLocationService.searchEventsViaCities(mapLocation, 100);
      
      if (result.location) {
        setMapCenter([result.location.lat, result.location.lng]);
        setMapZoom(10);
        setUpcomingEvents(result.events);
        
        if (result.events.length > 0) {
          toast({
            title: "Events Found",
            description: `Found ${result.events.length} events near ${result.location.name} (${result.source})`,
          });
          console.log(`✅ Found ${result.events.length} events from ${result.source} for ${result.location.name}`);
        } else {
          toast({
            title: "No Events Found",
            description: `No events found near ${result.location.name}. Try a different location.`,
            variant: "default",
          });
          console.log(`📭 No events found for ${result.location.name}`);
        }
      } else {
        toast({
          title: "Location Not Found",
          description: "Try searching for a major city like 'New York' or 'Los Angeles'",
          variant: "destructive",
        });
        console.log(`❌ Location not found: ${mapLocation}`);
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
      console.log('🔄 Refreshing events for user location via cities...');
      const result = await JamBaseLocationService.searchEventsViaCities(userLocation, 100);
      
      if (result.events.length > 0) {
        setUpcomingEvents(result.events);
        toast({
          title: "Events Refreshed",
          description: `Found ${result.events.length} updated events near your location (${result.source})`,
        });
        console.log(`✅ Refreshed ${result.events.length} events from ${result.source}`);
      } else {
        toast({
          title: "No New Events",
          description: "No new events found near your location",
          variant: "default",
        });
        console.log('📭 No new events found after refresh');
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="w-5 h-5" />
          Upcoming Events Near You
        </CardTitle>
        <div className="flex gap-2">
          <Input
            placeholder="Enter city name (e.g., New York, Los Angeles)"
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
