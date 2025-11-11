import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SynthSLogo } from '@/components/SynthSLogo';
import { 
  Search, 
  Map, 
  Calendar, 
  Filter, 
  Loader2, 
  Music, 
  MapPin, 
  Clock,
  Users,
  Ticket,
  ExternalLink,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { JamBaseEventsService, JamBaseEventResponse, JamBaseEvent } from '@/services/jambaseEventsService';
import { LocationService } from '@/services/locationService';
import { TicketmasterPopulationService } from '@/services/ticketmasterPopulationService';
import { formatPrice, extractNumericPrice } from '@/utils/currencyUtils';
import { formatVenueName, formatVenueLocation, formatVenueAddress } from '@/utils/venueUtils';

// Import our new components
import { CompactSearchBar } from './CompactSearchBar';
import { ViewToggle } from './ViewToggle';
import { EventFilters, FilterState } from './EventFilters';
import { EventCalendarView } from './EventCalendarView';
import { ArtistFollowService } from '@/services/artistFollowService';
import { VenueFollowService } from '@/services/venueFollowService';
import { EventMap } from '../events/EventMap';
import { EventDetailsModal } from '../events/EventDetailsModal';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { normalizeCityName } from '@/utils/cityNormalization';
import { RadiusSearchService } from '@/services/radiusSearchService';
import { trackInteraction } from '@/services/interactionTrackingService';

interface RedesignedSearchPageProps {
  userId: string;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
}

type ViewMode = 'map' | 'calendar';
type SearchType = 'artists' | 'events' | 'all';

export const RedesignedSearchPage: React.FC<RedesignedSearchPageProps> = ({ userId, onNavigateToProfile, onNavigateToChat }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<SearchType>('all');
  const [events, setEvents] = useState<JamBaseEventResponse[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<JamBaseEventResponse[]>([]);
  const [dateFilteredEvents, setDateFilteredEvents] = useState<JamBaseEventResponse[]>([]);
  const [searchResults, setSearchResults] = useState<JamBaseEventResponse[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<JamBaseEventResponse | null>(null);
  
  // Debug selectedEvent changes
  useEffect(() => {
    // selectedEvent changed
  }, [selectedEvent]);
  
  // Debug eventDetailsOpen changes
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | undefined>();
  const [mapCenter, setMapCenter] = useState<[number, number]>([39.8283, -98.5795]);
  const [mapZoom, setMapZoom] = useState(4);
  const [initialMapCenter, setInitialMapCenter] = useState<[number, number] | null>(null);
  const [isSearchingArea, setIsSearchingArea] = useState(false);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [interestedEvents, setInterestedEvents] = useState<Set<string>>(new Set());
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'price' | 'popularity' | 'distance' | 'relevance'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Session tracking for location-based API calls (only once per session)
  const locationApiCalledRef = useRef<boolean>(false);
  
  const [filters, setFilters] = useState<FilterState>({
    genres: [],
    selectedCities: [],
    dateRange: { from: undefined, to: undefined },
    showFilters: false,
    radiusMiles: 30,
    filterByFollowing: 'all',
    daysOfWeek: []
  });
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [mapBounds, setMapBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null);
  
  // Following state for filtering
  const [followedArtists, setFollowedArtists] = useState<string[]>([]);
  const [followedVenues, setFollowedVenues] = useState<Array<{name: string, city?: string, state?: string}>>([]);
  const [loadingFollows, setLoadingFollows] = useState(false);

  const { toast } = useToast();

  const baseEvents = useMemo(() => searchResults ?? events, [searchResults, events]);
  const isArtistSearchActive = useMemo(
    () => searchType === 'artists' && searchQuery.trim().length > 0 && searchResults !== null,
    [searchType, searchQuery, searchResults]
  );

  // Available genres from events
  const availableGenres = useMemo(() => {
    const genreSet = new Set<string>();
    baseEvents.forEach(event => {
      if (event.genres) {
        event.genres.forEach(genre => genreSet.add(genre));
      }
    });
    return Array.from(genreSet).sort();
  }, [baseEvents]);

  // Sort events based on selected criteria
  const sortedEvents = useMemo(() => {
    const eventsToSort = selectedDate ? dateFilteredEvents : filteredEvents;
    
    return [...eventsToSort].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'date': {
          const dateA = new Date(a.event_date).getTime();
          const dateB = new Date(b.event_date).getTime();
          comparison = dateA - dateB;
          break;
        }
          
        case 'price': {
          const priceA = extractNumericPrice(a.price_range || '');
          const priceB = extractNumericPrice(b.price_range || '');
          comparison = priceA - priceB;
          break;
        }
          
        case 'popularity': {
          // For now, use a simple popularity metric based on venue size or other factors
          // This could be enhanced with actual engagement data
          const popularityA = a.venue_name?.length || 0; // Simple heuristic
          const popularityB = b.venue_name?.length || 0;
          comparison = popularityA - popularityB;
          break;
        }
          
        case 'distance': {
          // Calculate distance if user location is available
          if (userLocation && a.latitude && a.longitude && b.latitude && b.longitude) {
            const distanceA = calculateDistance(userLocation.lat, userLocation.lng, a.latitude, a.longitude);
            const distanceB = calculateDistance(userLocation.lat, userLocation.lng, b.latitude, b.longitude);
            comparison = distanceA - distanceB;
          } else {
            comparison = 0;
          }
          break;
        }
          
        case 'relevance':
        default: {
          // Default relevance based on date proximity and other factors
          const now = Date.now();
          const eventDateA = new Date(a.event_date).getTime();
          const eventDateB = new Date(b.event_date).getTime();
          const relevanceA = Math.abs(eventDateA - now);
          const relevanceB = Math.abs(eventDateB - now);
          comparison = relevanceA - relevanceB;
          break;
        }
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [selectedDate, dateFilteredEvents, filteredEvents, sortBy, sortOrder, userLocation]);

  // Calculate distance between two points using Haversine formula
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 3959; // Earth's radius in miles
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Convert degrees to radians
  const toRadians = (degrees: number): number => {
    return degrees * (Math.PI / 180);
  };

  // Initialize user location and load events & cities
  useEffect(() => {
    initializeLocationAndEvents();
  }, []);


  // Filter events when filters change (debounced) - but skip if venue is selected
  useEffect(() => {
    // Skip filtering if a venue is selected (venue filtering is handled directly in handleVenueClick)
    if (selectedVenue) return;
    
    const timeoutId = setTimeout(() => {
      filterEvents();
    }, 100); // Debounce by 100ms
    
    return () => clearTimeout(timeoutId);
  }, [events, searchResults, filters, followedArtists, followedVenues, searchQuery, searchType]);

  // Update map center when location filters change
  useEffect(() => {
    if (filters.selectedCities && filters.selectedCities.length > 0) {
      updateMapCenterForLocation(filters.selectedCities);
    } else {
      updateMapCenterForLocation([]);
    }
  }, [filters.selectedCities]);
  
  // Clear venue selection when city filter is applied
  useEffect(() => {
    if (filters.selectedCities && filters.selectedCities.length > 0 && selectedVenue) {
      // Clearing venue selection due to city filter change
      setSelectedVenue(null);
    }
  }, [filters.selectedCities]);

  // Update date filtered events when filteredEvents or selectedDate changes
  useEffect(() => {
    if (selectedDate) {
      const eventsForDate = filteredEvents.filter(event => {
        try {
          return isSameDay(parseISO(event.event_date), selectedDate);
        } catch {
          return false;
        }
      });
      setDateFilteredEvents(eventsForDate);
    } else {
      setDateFilteredEvents([]);
    }
  }, [filteredEvents, selectedDate]);

  // Load followed artists and venues for filtering
  const loadFollowedData = async () => {
    if (!userId) return;
    
    setLoadingFollows(true);
    try {
      // Load followed artists
      const artists = await ArtistFollowService.getUserFollowedArtists(userId);
      setFollowedArtists(artists.map(artist => artist.artist_name));

      // Load followed venues
      const venues = await VenueFollowService.getUserFollowedVenues(userId);
      setFollowedVenues(venues.map(venue => ({
        name: venue.venue_name,
        city: venue.venue_city,
        state: venue.venue_state
      })));
    } catch (error) {
      console.error('Error loading followed data:', error);
    } finally {
      setLoadingFollows(false);
    }
  };

  const initializeLocationAndEvents = async () => {
    setIsLoading(true);
    try {
      // Try to get user's location (but don't auto-populate events)
      let userLocationCoords = null;
      try {
        const location = await LocationService.getCurrentLocation();
        userLocationCoords = location;
        const mapCenterCoords: [number, number] = [location.latitude, location.longitude];
        setUserLocation({ lat: location.latitude, lng: location.longitude });
        setMapCenter(mapCenterCoords);
        setInitialMapCenter(mapCenterCoords); // Store initial center for comparison
        setMapZoom(10);
        // DON'T auto-populate - only search when user searches
      } catch (error) {
        console.error('Could not get user location:', error);
        // Set initial map center to default if location denied
        setInitialMapCenter([39.8283, -98.5795]);
      }

      // Load events and cities from database
      // Pass userLocationCoords directly to avoid async state issue
      await loadEvents(userLocationCoords);
      await loadCities();
      await loadInterestedEvents();
      await loadFollowedData();
    } catch (error) {
      // Error initializing search page
      toast({
        title: "Error",
        description: "Failed to load events. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadEvents = async (providedLocation?: { latitude: number; longitude: number } | null, forceApiCall: boolean = false) => {
    try {
      // API PROTECTION: Only call Ticketmaster API once per session for location-based search
      // Unless forceApiCall=true (user explicitly triggered "search all events in this area")
      const shouldCallApi = forceApiCall || (!locationApiCalledRef.current && providedLocation);
      
      if (providedLocation && shouldCallApi) {
        console.log('🔍 Searching Ticketmaster API for events near user location:', providedLocation);
        if (!forceApiCall) {
          console.log('   (First location search of session - API call allowed)');
        } else {
          console.log('   (User explicitly requested search - API call allowed)');
        }
        
        // Mark that we've called the API this session
        locationApiCalledRef.current = true;
        
        const queryParams = new URLSearchParams();
        queryParams.append('latlong', `${providedLocation.latitude},${providedLocation.longitude}`);
        queryParams.append('radius', '50');
        queryParams.append('unit', 'miles');
        queryParams.append('size', '200');
        queryParams.append('sort', 'date,asc');
        queryParams.append('classificationName', 'music');
        queryParams.append('startDateTime', new Date().toISOString().split('.')[0] + 'Z');
        // API key is handled by backend, don't pass it here

        const isProduction =
          typeof window !== 'undefined' &&
          window.location.hostname !== 'localhost' &&
          !window.location.hostname.startsWith('127.0.0.1');

        const queryString = queryParams.toString();
        const backendUrl = import.meta.env.VITE_BACKEND_URL;
        const remoteFallbackEnv = import.meta.env.VITE_TICKETMASTER_REMOTE_BASE || import.meta.env.VITE_PUBLIC_APP_URL || import.meta.env.VITE_VERCEL_URL;

        const candidateUrls: { url: string; label: string }[] = [];

        if (!isProduction) {
          if (backendUrl) {
            candidateUrls.push({
              url: `${backendUrl.replace(/\/$/, '')}/api/ticketmaster/events?${queryString}`,
              label: 'VITE_BACKEND_URL'
            });
          }

          candidateUrls.push({
            url: `/api/ticketmaster/events?${queryString}`,
            label: 'Vite proxy (relative path)'
          });
        } else {
          candidateUrls.push({
            url: `/api/ticketmaster/events?${queryString}`,
            label: 'Production relative path'
          });
        }

        const remoteBases = remoteFallbackEnv
          ? remoteFallbackEnv.split(',').map(base => base.trim()).filter(Boolean)
          : ['https://synth-beta-testing.vercel.app'];

        remoteBases.forEach(base => {
          candidateUrls.push({
            url: `${base.replace(/\/$/, '')}/api/ticketmaster/events?${queryString}`,
            label: `Remote fallback (${base})`
          });
        });

        console.log(`🔵 Query params:`, {
          latlong: `${providedLocation.latitude},${providedLocation.longitude}`,
          radius: '50',
          unit: 'miles',
          size: '200',
          classificationName: 'music'
        });
        
        let apiSuccess = false;

        for (const candidate of candidateUrls) {
          try {
            console.log(`🔵 Calling backend via ${candidate.label}: ${candidate.url}`);
            const response = await fetch(candidate.url);

            if (!response.ok) {
              const errorText = await response.text();
              console.error(`⚠️ Ticketmaster API error (${candidate.label}):`, response.status, errorText);
              continue;
            }

            const data = await response.json();
            console.log(`✅ Found ${data.events?.length || 0} events from Ticketmaster API (${candidate.label})`);
            console.log(`🔵 Full response:`, data);
            console.log(`🔵 BACKEND DEBUG INFO:`, data.debug);
            if (data.debug) {
              console.log(`  - Total events from Ticketmaster: ${data.debug.totalEventsReceived}`);
              console.log(`  - Future events: ${data.debug.futureEvents}`);
              console.log(`  - Location filtered: ${data.debug.locationFilteredEvents}`);
              console.log(`  - Events stored: ${data.debug.eventsStored}`);
              console.log(`  - geoPoint: ${data.debug.geoPoint}`);
              console.log(`  - countryCode: ${data.debug.countryCode}`);
            }
            console.log(`✅ Events stored in database. Now querying...`);
            apiSuccess = true;
            break;
          } catch (apiError) {
            console.error(`⚠️ Ticketmaster API search failed via ${candidate.label}:`, apiError);
            // Try next candidate
          }
        }

        if (apiSuccess) {
          // Wait briefly to allow database writes
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } else if (providedLocation && !shouldCallApi) {
        console.log('🔒 Location API call skipped (already called this session). Using database only.');
      }
      
      // Load ONLY upcoming events (today and future) from database
      const today = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
      let query = supabase
        .from('jambase_events')
        .select('*')
        .eq('source', 'ticketmaster') // ONLY TICKETMASTER EVENTS
        .gte('event_date', today); // Only events from today onwards
      
      // Use provided location or state location
      const locationToUse = providedLocation 
        ? { lat: providedLocation.latitude, lng: providedLocation.longitude }
        : userLocation;
      
      // If user location is available, filter by nearby events (50 mile radius)
      if (locationToUse) {
        console.log('🔍 Filtering events by user location:', locationToUse);
        const latRange = 50 / 69; // Approximate miles per degree latitude
        const lngRange = 50 / (69 * Math.cos(locationToUse.lat * Math.PI / 180));
        
        console.log(`📍 Lat range: ${locationToUse.lat - latRange} to ${locationToUse.lat + latRange}`);
        console.log(`📍 Lng range: ${locationToUse.lng - lngRange} to ${locationToUse.lng + lngRange}`);
        
        // First, let's check what Ticketmaster events are actually in the database near Amsterdam
        const debugQuery = supabase
          .from('jambase_events')
          .select('title, venue_city, latitude, longitude, source, created_at')
          .eq('source', 'ticketmaster')
          .gte('event_date', today)
          .not('latitude', 'is', null)
          .order('created_at', { ascending: false }) // Get most recent first
          .limit(10);
        
        const { data: debugData } = await debugQuery;
        console.log('🔍 Recent Ticketmaster events in DB:', debugData);
        if (debugData) {
          debugData.forEach((event, i) => {
            const distance = locationToUse ? (
              // Calculate distance from Amsterdam
              (() => {
                const R = 3959; // miles
                const dLat = (Number(event.latitude) - locationToUse.lat) * Math.PI / 180;
                const dLng = (Number(event.longitude) - locationToUse.lng) * Math.PI / 180;
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(locationToUse.lat * Math.PI / 180) * Math.cos(Number(event.latitude) * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                return (R * c).toFixed(1);
              })()
            ) : 'N/A';
            console.log(`  Event ${i + 1}: ${event.title} in ${event.venue_city} at (${event.latitude}, ${event.longitude}) [${distance} miles from Amsterdam]`);
          });
        }
        
        query = query
          .gte('latitude', locationToUse.lat - latRange)
          .lte('latitude', locationToUse.lat + latRange)
          .gte('longitude', locationToUse.lng - lngRange)
          .lte('longitude', locationToUse.lng + lngRange)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null);
      }
      
      const { data: eventsData, error } = await query
        .order('event_date', { ascending: true })
        .limit(500); // Limit to 500 events

      if (error) {
        console.error('❌ Error querying events:', error);
        throw error;
      }
      
      console.log(`📊 Query returned ${eventsData?.length || 0} events`);

      // Log first event to verify data structure
      if (eventsData && eventsData.length > 0) {
        console.log('📋 Sample event from DB:', {
          title: eventsData[0].title,
          city: eventsData[0].venue_city,
          latitude: eventsData[0].latitude,
          longitude: eventsData[0].longitude,
          source: eventsData[0].source
        });
      } else {
        console.warn('⚠️ No events returned from database query');
      }
      
      const transformedEvents: JamBaseEventResponse[] = (eventsData || []).map(event => ({
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
        setlist_enriched: event.setlist_enriched,
        setlist_song_count: event.setlist_song_count,
        setlist_fm_id: event.setlist_fm_id,
        setlist_fm_url: event.setlist_fm_url,
        tour_name: event.tour_name,
        created_at: event.created_at,
        updated_at: event.updated_at,
        images: event.images || undefined // Include images array if available
      }));

      setEvents(transformedEvents);
      
      // Loaded events from database
      
      // Log coordinate statistics
      if (transformedEvents.length > 0) {
        const eventsWithCoords = transformedEvents.filter(e => e.latitude && e.longitude);
        const eventsWithValidCoords = eventsWithCoords.filter(e => 
          !isNaN(Number(e.latitude)) && !isNaN(Number(e.longitude))
        );
        // Coordinate statistics calculated
      }
    } catch (error) {
      // Error loading events
      throw error;
    }
  };

  const loadCities = async () => {
    try {
      const { data, error } = await supabase
        .from('jambase_events')
        .select('venue_city')
        .not('venue_city', 'is', null);
      if (error) throw error;
      const unique = Array.from(new Set((data || []).map((r: any) => (r.venue_city as string).trim()).filter(Boolean))).sort();
      setAvailableCities(unique);
    } catch (error) {
      // Failed to load cities
      setAvailableCities([]);
    }
  };

  const loadInterestedEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('user_jambase_events')
        .select('jambase_event_id')
        .eq('user_id', userId);
      
      if (error) throw error;
      
      const interestedSet = new Set((data || []).map((item: any) => item.jambase_event_id));
      setInterestedEvents(interestedSet);
    } catch (error) {
      // Failed to load interested events
      setInterestedEvents(new Set());
    }
  };

  const updateMapCenterForLocation = async (selectedCities: string[]) => {
    // updateMapCenterForLocation called
    
    if (selectedCities.length > 0) {
      try {
        // Get coordinates for the first selected city
        const cityName = selectedCities[0];
        const coordinates = await RadiusSearchService.getCityCoordinates(cityName);
        
        if (coordinates) {
          setMapCenter([coordinates.lat, coordinates.lng]);
          setMapZoom(10);
          
          toast({
            title: "Map Updated",
            description: `Map centered on ${cityName}`,
          });
        } else {
          // Could not find coordinates for city
          toast({
            title: "Location Not Found",
            description: `Could not find coordinates for ${cityName}`,
            variant: "destructive",
          });
        }
      } catch (error) {
        // Error updating map center for location
        toast({
          title: "Map Error",
          description: "Failed to update map center",
          variant: "destructive",
        });
      }
    } else {
      // Reset to user location or default center when no city filter
      if (userLocation) {
        setMapCenter([userLocation.lat, userLocation.lng]);
        setMapZoom(10);
      } else {
        setMapCenter([39.8283, -98.5795]);
        setMapZoom(4);
      }
    }
  };

  const handleMapMove = (bounds: { north: number; south: number; east: number; west: number }) => {
    setMapBounds(bounds);
    
    // Only filter by map bounds if no location filter is active AND no search query is active
    // Search results should show ALL matching events regardless of map bounds
    if ((!filters.selectedCities || filters.selectedCities.length === 0) && !searchQuery.trim()) {
      filterEventsInBounds(bounds);
    }
  };

  const handleMapCenterChange = (newCenter: [number, number]) => {
    // Update map center when user pans/drags the map
    setMapCenter(newCenter);
  };

  const handleSearchThisArea = async () => {
    if (!mapCenter) return;
    
    setIsSearchingArea(true);
    try {
      setSearchResults(null);
      const [lat, lng] = mapCenter;
      console.log(`🔍 Searching for events at map center: (${lat}, ${lng}) with ${filters.radiusMiles} mile radius...`);
      
      // First, populate events from Ticketmaster API
      try {
        await TicketmasterPopulationService.populateEventsNearLocation({
          latitude: lat,
          longitude: lng,
          radius: filters.radiusMiles,
          limit: 200
        });
        // Wait a moment for database to commit
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error('⚠️ Failed to populate Ticketmaster events:', error);
      }
      
      // Then fetch events from database near this location
      const nearbyEvents = await LocationService.searchEventsByLocation({
        latitude: lat,
        longitude: lng,
        radius: filters.radiusMiles,
        limit: 200
      });
      
      if (nearbyEvents.length > 0) {
        setEvents(nearbyEvents);
        // Update initial map center to current location so map doesn't reset
        // and the button stays visible
        setInitialMapCenter(mapCenter);
        toast({
          title: "Events Found",
          description: `Found ${nearbyEvents.length} events within ${filters.radiusMiles} miles of this area`,
        });
        console.log(`✅ Found ${nearbyEvents.length} events in the selected area`);
      } else {
        setEvents([]);
        // Update initial map center even when no events found
        setInitialMapCenter(mapCenter);
        toast({
          title: "No Events Found",
          description: `No events found within ${filters.radiusMiles} miles of this area. Try increasing the radius.`,
          variant: "default",
        });
        console.log(`📭 No events found in the selected area`);
      }
    } catch (error) {
      console.error('Error searching area:', error);
      toast({
        title: "Search Failed",
        description: "Failed to search this area. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSearchingArea(false);
    }
  };

  // Check if map center has moved from initial location
  const hasMapMoved = initialMapCenter && mapCenter && 
    (Math.abs(initialMapCenter[0] - mapCenter[0]) > 0.001 || 
     Math.abs(initialMapCenter[1] - mapCenter[1]) > 0.001);

  const filterEventsInBounds = (bounds: { north: number; south: number; east: number; west: number }) => {
    // Filtering events in bounds
    const sourceEvents = searchResults ?? events;
    const eventsInBounds = sourceEvents.filter(event => {
      if (!event.latitude || !event.longitude) return false;
      
      const lat = Number(event.latitude);
      const lng = Number(event.longitude);
      
      if (isNaN(lat) || isNaN(lng)) return false;
      
      return lat >= bounds.south && lat <= bounds.north && 
             lng >= bounds.west && lng <= bounds.east;
    });
    
    // If no events found in bounds, show all events (including those without coordinates)
    // This ensures past events with setlists are visible even if they lack coordinates
    if (eventsInBounds.length === 0) {
      setFilteredEvents(sourceEvents);
    } else {
      setFilteredEvents(eventsInBounds);
    }
  };

  const filterEvents = async () => {
    const hasActiveFilters =
      (filters.genres && filters.genres.length > 0) ||
      (filters.selectedCities && filters.selectedCities.length > 0) ||
      !!filters.dateRange.from ||
      !!filters.dateRange.to ||
      (filters.daysOfWeek && filters.daysOfWeek.length > 0) ||
      filters.filterByFollowing === 'following';

    if (isArtistSearchActive && !hasActiveFilters) {
      setFilteredEvents(searchResults ?? []);
      return;
    }

    const sourceEvents = searchResults ?? events;
    let filtered = [...sourceEvents];


    // Normal filtering when no venue is selected
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(event => 
        event.title?.toLowerCase().includes(query) ||
        event.artist_name?.toLowerCase().includes(query) ||
        event.venue_name?.toLowerCase().includes(query) ||
        event.venue_city?.toLowerCase().includes(query) ||
        event.genres?.some(genre => genre.toLowerCase().includes(query))
      );
    }

    // Filter by genres
    if (filters.genres.length > 0) {
      filtered = filtered.filter(event => 
        event.genres && event.genres.some(genre => 
          filters.genres.some(filterGenre => 
            genre.toLowerCase().includes(filterGenre.toLowerCase())
          )
        )
      );
    }

    // Filter by selected cities using radius search
    if (filters.selectedCities && filters.selectedCities.length > 0) {
      try {
        const cityName = filters.selectedCities[0];
        // Use radius search service to get events within selected radius
        const radiusEvents = await RadiusSearchService.getEventsNearCity({
          city: cityName,
          radiusMiles: filters.radiusMiles,
          limit: 500
        });
        
        // Convert radius search results to our event format
        const radiusEventIds = new Set(radiusEvents.map(e => e.id));
        
        // Filter the existing events to only include those in the radius
        filtered = filtered.filter(event => radiusEventIds.has(event.id));
        
        // Update map center when location filter is applied
        updateMapCenterForLocation(filters.selectedCities);
      } catch (error) {
        // Error performing radius search
        // Fallback to exact city matching if radius search fails
      const selectedCitySet = new Set(filters.selectedCities.map(c => normalizeCityName(c)));
      filtered = filtered.filter(event => {
        if (!event.venue_city) return false;
        const normalizedEventCity = normalizeCityName(event.venue_city);
        return selectedCitySet.has(normalizedEventCity);
      });
        
        updateMapCenterForLocation(filters.selectedCities);
      }
    } else {
      // Reset map center when no location filter
      updateMapCenterForLocation([]);
      
      // Only apply map bounds filtering if there's no active search query
      // Search results should show ALL matching events regardless of map bounds
      if (!searchQuery.trim()) {
        // If we have map bounds, filter events to visible area
        if (mapBounds) {
          filterEventsInBounds(mapBounds);
          return; // Skip the rest of the filtering
        } else {
          // If no map bounds yet, show all events (including those without coordinates)
          // This ensures past events with setlists are visible even if they lack coordinates
          setFilteredEvents(filtered);
          return; // Skip the rest of the filtering
        }
      }
      // If there's a search query, continue with the filtered results (don't apply map bounds)
    }

    // Filter by date range
    if (filters.dateRange.from || filters.dateRange.to) {
      filtered = filtered.filter(event => {
        try {
          const eventDate = parseISO(event.event_date);
          
          if (filters.dateRange.from && filters.dateRange.to) {
            return isWithinInterval(eventDate, {
              start: startOfDay(filters.dateRange.from),
              end: endOfDay(filters.dateRange.to)
            });
          } else if (filters.dateRange.from) {
            return eventDate >= startOfDay(filters.dateRange.from);
          } else if (filters.dateRange.to) {
            return eventDate <= endOfDay(filters.dateRange.to);
          }
          
          return true;
        } catch (error) {
          // Error parsing event date
          return true;
        }
      });
    }

    // Filter by days of week
    if (filters.daysOfWeek.length > 0) {
      filtered = filtered.filter(event => {
        try {
          const eventDate = parseISO(event.event_date);
          const dayOfWeek = eventDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
          return filters.daysOfWeek.includes(dayOfWeek);
        } catch (error) {
          // Error parsing event date
          return true;
        }
      });
    }

    // Filter by following status
    if (filters.filterByFollowing === 'following') {
      filtered = filtered.filter(event => {
        // Check if artist is followed
        if (event.artist_name && followedArtists.includes(event.artist_name)) {
          return true;
        }
        
        // Check if venue is followed
        if (event.venue_name) {
          return followedVenues.some(venue => 
            venue.name === event.venue_name &&
            (!venue.city || venue.city === event.venue_city) &&
            (!venue.state || venue.state === event.venue_state)
          );
        }
        
        return false;
      });
    }

    setFilteredEvents(filtered);
  };

  const handleSearch = async (query: string, type: SearchType) => {
    // 🎯 TRACK: Search query initiated
    const searchStartTime = Date.now();
    trackInteraction.search(query, 'search', type, {
      search_type: type,
      query_length: query.length,
      from_view: 'search_page'
    });

    setSearchQuery(query);
    setSearchType(type);
    if (type !== 'artists') {
      setSearchResults(null);
    }
    
    if (type === 'events' || type === 'all') {
      // The filtering will be handled by the useEffect
      // Track results after filter
      setTimeout(() => {
        trackInteraction.search(query, 'search', 'search_results', {
          search_type: type,
          result_count: filteredEvents.length,
          load_time_ms: Date.now() - searchStartTime,
          has_results: filteredEvents.length > 0
        });
      }, 500);
      return;
    }
    
    if (type === 'artists') {
      // Search for events using unified search (both JamBase + Ticketmaster)
      try {
        setIsLoading(true);
        
        console.log('🔍 handleSearch for artist:', query);
        
        // Import unified search service
        const { UnifiedEventSearchService } = await import('@/services/unifiedEventSearchService');
        
        // Search both APIs for this artist
        const searchResults = await UnifiedEventSearchService.searchEvents({
          artistName: query,
          limit: 50
        });
        
        const artistEvents = searchResults.events;
        
        console.log('🎯 Fetched artist events:', artistEvents?.length || 0, 'events');
        console.log('🎯 Artist events:', artistEvents?.map(e => ({ 
          title: e.title, 
          artist: e.artist_name,
          source: e.source 
        })));
        console.log('🎯 Sources:', searchResults.sources);
        
        // Convert to the format expected by the component
        const formattedEvents = artistEvents?.map(event => ({
          id: event.id || event.jambase_event_id || event.ticketmaster_event_id,
          jambase_event_id: event.jambase_event_id,
          ticketmaster_event_id: event.ticketmaster_event_id,
          title: event.title || event.artist_name,
          artist_name: event.artist_name,
          artist_id: event.artist_id,
          venue_name: event.venue_name,
          venue_id: event.venue_id,
          event_date: event.event_date,
          doors_time: event.doors_time,
          description: event.description,
          genres: event.genres || [],
          venue_address: event.venue_address,
          venue_city: event.venue_city,
          venue_state: event.venue_state,
          venue_zip: event.venue_zip,
          latitude: event.latitude ? Number(event.latitude) : undefined,
          longitude: event.longitude ? Number(event.longitude) : undefined,
          ticket_available: event.ticket_available,
          price_range: event.price_range,
          ticket_urls: event.ticket_urls || [],
          external_url: (event as any).external_url,
          source: (event as any).source // Keep source for internal tracking only (not shown in UI)
        })) || [];
        
        setSearchResults(formattedEvents);
        setFilteredEvents(formattedEvents);
        setSelectedVenue(null);
        setSelectedDate(undefined);
        const firstEventWithCoords = formattedEvents.find(event => event.latitude && event.longitude);
        if (firstEventWithCoords && firstEventWithCoords.latitude && firstEventWithCoords.longitude) {
          setMapCenter([Number(firstEventWithCoords.latitude), Number(firstEventWithCoords.longitude)]);
          setMapZoom(10);
        }
        
        // 🎯 TRACK: Search results for artist
        const searchDuration = Date.now() - searchStartTime;
        trackInteraction.search(query, 'search', 'search_results', {
          search_type: 'artists',
          result_count: formattedEvents.length,
          event_count: formattedEvents.length,
          load_time_ms: searchDuration,
          has_results: formattedEvents.length > 0
        });
        
        toast({
          title: "Artist Events",
          description: `Showing ${formattedEvents.length} events for "${query}"`,
        });
      } catch (error) {
        console.error('Error fetching artist events:', error);
        
        // 🎯 TRACK: Search failed
        trackInteraction.search(query, 'search', 'search_error', {
          search_type: 'artists',
          error: 'fetch_failed'
        });
        setSearchResults([]);
        setFilteredEvents([]);
        
        toast({
          title: "Error",
          description: "Failed to filter events by artist",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchType('all');
    // Reset filtered events to show all events
    setSearchResults(null);
    setFilteredEvents(events);
  };

  // Handle event details events (when event is selected from search)
  useEffect(() => {
    const handleEventDetailsEvent = (event: CustomEvent) => {
      console.log('📨 RedesignedSearchPage: Received open-event-details event:', event.detail);
      const { event: eventData, eventId } = event.detail;
      
      if (eventData) {
        // Convert the event data to the format expected by EventDetailsModal
        const convertedEvent = {
          id: eventData.id || eventData.jambase_event_id,
          jambase_event_id: eventData.jambase_event_id || eventData.id,
          title: eventData.title,
          artist_name: eventData.artist_name,
          artist_id: eventData.artist_id || '',
          venue_name: eventData.venue_name,
          venue_id: eventData.venue_id || '',
          event_date: eventData.event_date,
          doors_time: eventData.doors_time,
          description: eventData.description,
          genres: eventData.genres || [],
          venue_address: eventData.venue_address,
          venue_city: eventData.venue_city,
          venue_state: eventData.venue_state,
          venue_zip: eventData.venue_zip,
          latitude: eventData.latitude ? Number(eventData.latitude) : undefined,
          longitude: eventData.longitude ? Number(eventData.longitude) : undefined,
          ticket_available: eventData.ticket_available,
          price_range: eventData.price_range,
          ticket_urls: eventData.ticket_urls || [],
          created_at: eventData.created_at || new Date().toISOString(),
          updated_at: eventData.updated_at || new Date().toISOString()
        };
        
        console.log('✅ RedesignedSearchPage: Setting selected event and opening modal');
        setSelectedEvent(convertedEvent);
        setEventDetailsOpen(true);
      }
    };

    window.addEventListener('open-event-details', handleEventDetailsEvent as EventListener);
    
    return () => {
      window.removeEventListener('open-event-details', handleEventDetailsEvent as EventListener);
    };
  }, []);

  const handleEventClick = (event: JamBaseEventResponse) => {
    setSelectedEvent(event);
    setEventDetailsOpen(true);
  };

  const handleVenueClick = (venueId: string, venueName: string, latitude: number, longitude: number) => {
    // Filter events for this venue immediately
    const sourceEvents = searchResults ?? events;
    const venueEvents = sourceEvents.filter(event => {
      if (!event.venue_name) return false;
      
      const eventVenue = event.venue_name.trim();
      const selectedVenueTrimmed = venueName.trim();
      
      // Try exact match first
      if (eventVenue === selectedVenueTrimmed) return true;
      
      // Try case-insensitive exact match
      if (eventVenue.toLowerCase() === selectedVenueTrimmed.toLowerCase()) return true;
      
      // Try normalized match (remove special characters, extra spaces)
      const normalizeVenue = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/\s+/g, '');
      if (normalizeVenue(eventVenue) === normalizeVenue(selectedVenueTrimmed)) return true;
      
      // Try partial match (selected venue contains event venue or vice versa)
      if (eventVenue.toLowerCase().includes(selectedVenueTrimmed.toLowerCase()) ||
          selectedVenueTrimmed.toLowerCase().includes(eventVenue.toLowerCase())) return true;
      
      return false;
    });
    
    // Set selected venue and update filtered events immediately
    setSelectedVenue(venueName);
    setFilteredEvents(venueEvents);
    
    // Clear any city filters since venue selection takes precedence
    if (filters.selectedCities && filters.selectedCities.length > 0) {
      setFilters(prev => ({
        ...prev,
        selectedCities: []
      }));
    }
    
    // Zoom all the way in on the venue (max zoom level 20)
    // Use setTimeout to ensure state updates happen in the right order
    setTimeout(() => {
      setMapCenter([latitude, longitude]);
      setMapZoom(20);
    }, 0);
    
    // Show toast notification
    toast({
      title: "Venue Selected",
      description: `Showing ${venueEvents.length} events from ${venueName}`,
    });
  };

  const handleInterestToggle = async (eventId: string, interested: boolean) => {
    try {
      if (interested) {
        // Add to interested events
        const { error } = await supabase
          .from('user_jambase_events')
          .insert({
            user_id: userId,
            jambase_event_id: eventId
          });

        if (error) throw error;

        setInterestedEvents(prev => new Set([...prev, eventId]));
        toast({
          title: "Event Added!",
          description: "You've shown interest in this event",
        });
      } else {
        // Remove from interested events
        const { error } = await supabase
          .from('user_jambase_events')
          .delete()
          .eq('user_id', userId)
          .eq('jambase_event_id', eventId);

        if (error) throw error;

        setInterestedEvents(prev => {
          const newSet = new Set(prev);
          newSet.delete(eventId);
          return newSet;
        });
        toast({
          title: "Event Removed",
          description: "You're no longer interested in this event",
        });
      }
    } catch (error) {
      // Error toggling interest
      toast({
        title: "Error",
        description: "Failed to update your interest in this event",
        variant: "destructive",
      });
    }
  };

  const handleReview = (eventId: string) => {
    // This could open a review modal or navigate to review page
    toast({
      title: "Review Event",
      description: "Review functionality coming soon",
    });
  };

  // Convert JamBaseEventResponse to JamBaseEvent for compatibility
  const convertToJamBaseEvent = (event: JamBaseEventResponse): JamBaseEvent => {
    return {
      id: event.id,
      jambase_event_id: event.jambase_event_id || event.id,
      title: event.title,
      artist_name: event.artist_name,
      artist_id: event.artist_id,
      venue_name: event.venue_name,
      venue_id: event.venue_id,
      event_date: event.event_date,
      doors_time: event.doors_time || null,
      description: event.description || null,
      genres: event.genres || null,
      venue_address: event.venue_address || null,
      venue_city: event.venue_city || null,
      venue_state: event.venue_state || null,
      venue_zip: event.venue_zip || null,
      latitude: event.latitude || null,
      longitude: event.longitude || null,
      ticket_available: event.ticket_available || false,
      price_range: event.price_range || null,
      ticket_urls: event.ticket_urls || null,
      setlist: event.setlist || null,
      setlist_enriched: event.setlist_enriched || null,
      setlist_song_count: event.setlist_song_count || null,
      setlist_fm_id: event.setlist_fm_id || null,
      setlist_fm_url: event.setlist_fm_url || null,
      setlist_source: null,
      setlist_last_updated: null,
      tour_name: event.tour_name || null,
      created_at: event.created_at || new Date().toISOString(),
      updated_at: event.updated_at || new Date().toISOString()
    };
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    
    // Filter events by selected date
    if (date) {
      const eventsForDate = filteredEvents.filter(event => {
        try {
          return isSameDay(parseISO(event.event_date), date);
        } catch {
          return false;
        }
      });
      setDateFilteredEvents(eventsForDate);
      
      if (eventsForDate.length > 0) {
        toast({
          title: "Events Found",
          description: `Found ${eventsForDate.length} event${eventsForDate.length !== 1 ? 's' : ''} on ${format(date, 'MMMM d, yyyy')}`,
        });
      }
    } else {
      setDateFilteredEvents([]);
    }
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    
    if (mode === 'map' && userLocation) {
      setMapCenter([userLocation.lat, userLocation.lng]);
      setMapZoom(10);
    }
  };

  const isSameDay = (date1: Date, date2: Date) => {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  };

  return (
    <div className="min-h-screen synth-gradient-card">
      <div id="search-layout-root" className="max-w-7xl mx-auto p-6 space-y-8">

         {/* Compact Search Bar */}
         <div className="glass-card inner-glow p-4 rounded-2xl floating-shadow mb-6 relative z-[100]">
           <CompactSearchBar
             onSearch={handleSearch}
             onClear={handleClearSearch}
             isLoading={isLoading}
             userId={userId}
           />
         </div>

        {/* Filters */}
        <div className="flex flex-col gap-4">
          <EventFilters
            filters={filters}
            onFiltersChange={setFilters}
            availableGenres={availableGenres}
            onClearVenueSelection={() => setSelectedVenue(null)}
            availableCities={availableCities}
            onOverlayChange={(open) => {
              // When filter popovers are open, raise z-index of filters and ensure map/calendar are below
              const root = document.getElementById('search-layout-root');
              if (root) {
                if (open) root.classList.add('filters-open');
                else root.classList.remove('filters-open');
              }
            }}
          />

          {/* View Toggle below filters (right above map/calendar) */}
          <div className="flex justify-start">
            <ViewToggle
              currentView={viewMode}
              onViewChange={handleViewModeChange}
            />
          </div>
        </div>


        {/* Loading State */}
        {isLoading && (
          <div className="glass-card inner-glow flex items-center justify-center py-16 rounded-2xl floating-shadow">
            <Loader2 className="h-8 w-8 animate-spin mr-3" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
            <span className="font-medium text-gray-600">Loading events...</span>
          </div>
        )}

        {/* Main Content */}
        {!isLoading && (
          filteredEvents.length > 0 ? (
            <>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-0 search-grid-fix">
              {/* Left: Map or Calendar */}
              <div className="order-1 lg:order-1 lg:col-span-1 relative z-10">
                {viewMode === 'map' ? (
                  <Card className="glass-card inner-glow relative z-10 floating-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 gradient-text">
                        <Map className="h-5 w-5 hover-icon" />
                        {isArtistSearchActive ? `Map for "${searchQuery}"` : 'Events Map'}
                      </CardTitle>
                        {filters.selectedCities && filters.selectedCities.length > 0 && (
                          <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-1.5 border border-gray-200 shadow-md hover:shadow-lg transition-shadow">
                            <span className="text-xs text-gray-700 font-medium">Search Radius:</span>
                            <Select 
                              value={filters.radiusMiles.toString()} 
                              onValueChange={(value) => {
                                setFilters(prev => ({ ...prev, radiusMiles: parseInt(value) }));
                              }}
                            >
                              <SelectTrigger className="w-16 h-7 text-xs font-medium border-gray-300 focus:border-pink-400 focus:ring-pink-400 bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="z-[60] shadow-xl border border-gray-300 bg-white">
                                <SelectItem value="5" className="text-xs hover:bg-gray-100">5 mi</SelectItem>
                                <SelectItem value="10" className="text-xs hover:bg-gray-100">10 mi</SelectItem>
                                <SelectItem value="15" className="text-xs hover:bg-gray-100">15 mi</SelectItem>
                                <SelectItem value="25" className="text-xs hover:bg-gray-100">25 mi</SelectItem>
                                <SelectItem value="30" className="text-xs hover:bg-gray-100">30 mi</SelectItem>
                                <SelectItem value="50" className="text-xs hover:bg-gray-100">50 mi</SelectItem>
                                <SelectItem value="75" className="text-xs hover:bg-gray-100">75 mi</SelectItem>
                                <SelectItem value="100" className="text-xs hover:bg-gray-100">100 mi</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="relative z-10">
                      <div className="w-full h-96 rounded-lg overflow-hidden relative z-10">
                        <EventMap
                          center={mapCenter}
                          zoom={mapZoom}
                          events={filteredEvents}
                          onEventClick={handleEventClick}
                          onMapCenterChange={handleMapCenterChange}
                        />
                        {/* Search This Area button - shows when map has been moved */}
                        {hasMapMoved && (
                          <div className="absolute top-2 right-2 z-[1000]">
                            <Button
                              onClick={handleSearchThisArea}
                              disabled={isSearchingArea}
                              className="bg-pink-500 hover:bg-pink-600 text-white shadow-lg"
                            >
                              {isSearchingArea ? (
                                <>
                                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                  Searching...
                                </>
                              ) : (
                                <>
                                  <Search className="w-4 h-4 mr-2" />
                                  Search This Area
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="relative z-10">
                  <EventCalendarView
                    events={filteredEvents}
                    selectedDate={selectedDate}
                    onDateSelect={handleDateSelect}
                    onEventClick={handleEventClick}
                    heightClass="h-96"
                  />
                  </div>
                )}
              </div>

              {/* Right: Single Events List */}
              <div className="order-2 lg:order-2 lg:col-span-2 relative z-10">
                <Card className="glass-card inner-glow relative z-10 floating-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <CardTitle className="flex items-center gap-2 gradient-text">
                          <Music className="h-5 w-5 hover-icon" />
                          {selectedDate
                            ? `Events on ${format(selectedDate, 'MMM d, yyyy')}`
                            : isArtistSearchActive
                              ? `Events for "${searchQuery}"`
                              : 'Upcoming Events'}
                        </CardTitle>
                        {isArtistSearchActive && (
                          <span className="text-xs text-muted-foreground mt-1">
                            Showing {filteredEvents.length} event{filteredEvents.length === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Clear Venue Filter */}
                        {selectedVenue && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedVenue(null);
                              // Reset filtered events to show all events
                          setFilteredEvents(searchResults ?? events);
                              // Reset map zoom to default
                              setMapZoom(4);
                              toast({
                                title: "Venue Filter Cleared",
                                description: "Showing all events again",
                              });
                            }}
                            className="text-xs px-2 py-1 h-6"
                          >
                            Clear venue
                          </Button>
                        )}
                        {/* Sort Controls */}
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Sort:</span>
                          <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                            className="text-xs border border-gray-300 rounded px-1 py-0.5 bg-white"
                          >
                            <option value="date">Date</option>
                            <option value="price">Price</option>
                            <option value="popularity">Popularity</option>
                            <option value="distance">Distance</option>
                            <option value="relevance">Relevance</option>
                          </select>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                            className="hover-button p-1 h-6 w-6"
                          >
                            {sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                          </Button>
                        </div>
                        {selectedDate && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDateSelect(undefined)}
                            className="hover-button text-xs"
                          >
                            Clear Date Filter
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-96 synth-scrollbar">
                      <div className="space-y-4">
                        {sortedEvents.map((event) => {
                          // Extract event image if available
                          const eventImage = (event as any).images && Array.isArray((event as any).images) && (event as any).images.length > 0
                            ? ((event as any).images as any[]).find((img: any) => 
                                img.url && (img.ratio === '16_9' || (img.width && img.width > 1000))
                              ) || ((event as any).images as any[]).find((img: any) => img.url)
                            : null;
                          const imageUrl = eventImage?.url || null;
                          
                          return (
                          <div
                            key={event.id}
                            className="glass-card inner-glow rounded-2xl hover-card cursor-pointer floating-shadow overflow-hidden"
                            onClick={() => handleEventClick(event)}
                          >
                            {/* Event Image */}
                            {imageUrl && (
                              <div className="h-40 w-full overflow-hidden">
                                <img 
                                  src={imageUrl} 
                                  alt={event.title} 
                                  className="w-full h-full object-cover" 
                                  loading="lazy"
                                  onError={(e) => {
                                    // Hide image on error
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              </div>
                            )}
                            <div className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-bold text-lg mb-2 line-clamp-1 text-gray-800">
                                    {event.title || event.artist_name}
                                  </h3>
                                {event.artist_name && event.artist_name !== event.title && (
                                  <p className="text-gray-500 mb-3 flex items-center gap-2">
                                    <Music className="h-4 w-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                                    <span className="bg-white/30 px-2 py-1 rounded-lg text-xs font-medium backdrop-blur-sm hover-icon">
                                      {event.artist_name}
                                    </span>
                                  </p>
                                )}
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 text-sm text-gray-500">
                                    <Calendar className="h-4 w-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                                    <span className="bg-white/30 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-medium">
                                      {(() => {
                                        try {
                                          return format(parseISO(event.event_date), 'EEEE, MMMM d, yyyy');
                                        } catch {
                                          return event.event_date;
                                        }
                                      })()}
                                    </span>
                                  </div>
                                  {formatVenueName(event.venue_name) && (
                                    <div className="flex items-center gap-2 text-sm text-gray-500">
                                      <MapPin className="h-4 w-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                                      <span className="bg-white/30 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-medium">
                                        {formatVenueName(event.venue_name)}
                                        {formatVenueLocation(event.venue_city, event.venue_state) && `, ${formatVenueLocation(event.venue_city, event.venue_state)}`}
                                      </span>
                                    </div>
                                  )}
                                  {event.doors_time && (
                                    <div className="flex items-center gap-2 text-sm text-gray-500">
                                      <Clock className="h-4 w-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                                      <span className="bg-white/30 px-2 py-1 rounded-lg text-xs backdrop-blur-sm font-medium">Doors: {event.doors_time}</span>
                                    </div>
                                  )}
                                  {event.genres && event.genres.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {event.genres.slice(0, 3).map((genre, index) => (
                                        <Badge key={index} variant="outline" className="text-xs bg-synth-beige/20 text-synth-black border-synth-beige-dark">
                                          {genre}
                                        </Badge>
                                      ))}
                                      {event.genres.length > 3 && (
                                        <Badge variant="outline" className="text-xs bg-synth-pink/10 text-synth-pink border-synth-pink/30">
                                          +{event.genres.length - 3}
                                        </Badge>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-3 ml-4">
                                <div className="flex flex-col items-end gap-2">
                                  {/* Event status badges */}
                                  <div className="flex gap-1">
                                    {(() => {
                                      const eventDate = new Date(event.event_date);
                                      const today = new Date();
                                      today.setHours(0, 0, 0, 0); // Reset time to start of day
                                      const isPast = eventDate < today;
                                      const isUpcoming = eventDate >= today;
                                      
                                      return (
                                        <>
                                          {isPast && (
                                            <Badge variant="secondary" className="text-xs">
                                              Past Event
                                            </Badge>
                                          )}
                                          {isUpcoming && (
                                            <Badge variant="default" className="text-xs">
                                              Upcoming
                                            </Badge>
                                          )}
                                        </>
                                      );
                                    })()}
                                    {event.ticket_available && (
                                      <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                                        <Ticket className="w-3 h-3 mr-1" />
                                        Tickets Available
                                      </Badge>
                                    )}
                                  </div>
                                  {event.price_range && (
                                    <Badge variant="secondary" className="gradient-badge px-3 py-1 rounded-full">
                                      {formatPrice(event.price_range)}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  {(() => {
                                    const eventDate = new Date(event.event_date);
                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0); // Reset time to start of day
                                    const isPast = eventDate < today;
                                    const isUpcoming = eventDate >= today;
                                    
                                    return (
                                      <>
                                        {/* Interest button for upcoming events */}
                                        {isUpcoming && (
                                          <Button 
                                            size="sm" 
                                            variant={interestedEvents.has(event.id) ? "default" : "outline"}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleInterestToggle(event.id, !interestedEvents.has(event.id));
                                            }}
                                            className={interestedEvents.has(event.id) ? "hover-button gradient-button" : "hover-button border-gray-300 hover:border-pink-400 hover:text-pink-500"}
                                          >
                                            <Users className="h-4 w-4 mr-1 hover-icon" />
                                            {interestedEvents.has(event.id) ? "Interested" : "Show Interest"}
                                          </Button>
                                        )}
                                        
                                        {/* "I Was There" button for past events */}
                                        {isPast && (
                                          <Button 
                                            size="sm" 
                                            variant="outline"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              // TODO: Implement attendance tracking for past events
                                              toast({
                                                title: "Feature Coming Soon",
                                                description: "Attendance tracking for past events will be available soon!",
                                              });
                                            }}
                                            className="hover-button border-gray-300 hover:border-yellow-400 hover:text-yellow-500"
                                          >
                                            <Users className="h-4 w-4 mr-1 hover-icon" />
                                            I Was There
                                          </Button>
                                        )}
                                      </>
                                    );
                                  })()}
                                   {event.ticket_urls && event.ticket_urls.length > 0 && (
                                     <Button
                                       size="sm"
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         window.open(event.ticket_urls![0], '_blank');
                                       }}
                                       className="hover-button gradient-button"
                                     >
                                       <Ticket className="h-4 w-4 mr-1 hover-icon" />
                                       Tickets
                                     </Button>
                                   )}
                                </div>
                              </div>
                            </div>
                            </div>
                          </div>
                          );
                        })}
                        
                        {/* Empty state for date filtering */}
                        {selectedDate && dateFilteredEvents.length === 0 && (
                          <div className="glass-card inner-glow text-center py-12 rounded-2xl floating-shadow">
                            <Calendar className="w-16 h-16 mx-auto mb-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                            <h3 className="text-xl font-bold text-gray-600 mb-3 gradient-text">
                              No Events Found
                            </h3>
                            <p className="text-sm text-gray-500 mb-4">
                              No events scheduled for {format(selectedDate, 'MMMM d, yyyy')}
                            </p>
                            <Button
                              variant="outline"
                              onClick={() => handleDateSelect(undefined)}
                              className="hover-button text-sm border-gray-200 hover:border-pink-400 hover:text-pink-500"
                            >
                              View All Events
                            </Button>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              
            </div>
            </>
          ) : (
            <Card className="glass-card inner-glow floating-shadow">
              <CardContent className="text-center py-16">
                <Search className="h-16 w-16 mx-auto mb-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                <h3 className="text-xl font-bold mb-3 gradient-text">No events found</h3>
                <p className="text-gray-500 mb-6 max-w-md mx-auto">
                  Try adjusting your search criteria or filters
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchType('all');
                    setSearchResults(null);
                    setFilteredEvents(events);
                    setFilters({
                      genres: [],
                      selectedCities: [],
                      dateRange: { from: undefined, to: undefined },
                      showFilters: false,
                      radiusMiles: 30,
                      filterByFollowing: 'all',
                      daysOfWeek: []
                    });
                  }}
                  className="hover-button border-gray-200 hover:border-pink-400 hover:text-pink-500"
                >
                  Clear all filters
                </Button>
              </CardContent>
            </Card>
          )
        )}

        {/* Event Details Modal */}
        {selectedEvent && (
          <EventDetailsModal
            event={convertToJamBaseEvent(selectedEvent)}
            currentUserId={userId}
            isOpen={eventDetailsOpen}
            onClose={() => {
              setEventDetailsOpen(false);
              setSelectedEvent(null);
            }}
            onInterestToggle={handleInterestToggle}
            onReview={handleReview}
            onAttendanceChange={(eventId, attended) => {
              console.log('🎯 Attendance changed in search:', eventId, attended);
              // Remove from interested events if user marked attendance
              if (attended) {
                setInterestedEvents(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(eventId);
                  return newSet;
                });
              }
            }}
            isInterested={interestedEvents.has(selectedEvent.id)}
            hasReviewed={false} // You could track this if needed
            onNavigateToProfile={onNavigateToProfile}
            onNavigateToChat={onNavigateToChat}
          />
        )}
      </div>
    </div>
  );
};
