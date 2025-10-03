import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
  ArrowDown
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { JamBaseEventsService, JamBaseEventResponse, JamBaseEvent } from '@/services/jambaseEventsService';
import { LocationService } from '@/services/locationService';
import { formatPrice, extractNumericPrice } from '@/utils/currencyUtils';

// Import our new components
import { CompactSearchBar } from './CompactSearchBar';
import { ViewToggle } from './ViewToggle';
import { EventFilters, FilterState } from './EventFilters';
import { EventCalendarView } from './EventCalendarView';
import { EventMap } from '../events/EventMap';
import { EventDetailsModal } from '../events/EventDetailsModal';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';

interface RedesignedSearchPageProps {
  userId: string;
}

type ViewMode = 'map' | 'calendar';
type SearchType = 'artists' | 'events' | 'all';

export const RedesignedSearchPage: React.FC<RedesignedSearchPageProps> = ({ userId }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<SearchType>('all');
  const [events, setEvents] = useState<JamBaseEventResponse[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<JamBaseEventResponse[]>([]);
  const [dateFilteredEvents, setDateFilteredEvents] = useState<JamBaseEventResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<JamBaseEventResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | undefined>();
  const [mapCenter, setMapCenter] = useState<[number, number]>([39.8283, -98.5795]);
  const [mapZoom, setMapZoom] = useState(4);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [interestedEvents, setInterestedEvents] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'date' | 'price' | 'popularity' | 'distance' | 'relevance'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  const [filters, setFilters] = useState<FilterState>({
    genres: [],
    selectedCities: [],
    dateRange: { from: undefined, to: undefined },
    showFilters: false
  });
  const [availableCities, setAvailableCities] = useState<string[]>([]);

  const { toast } = useToast();

  // Available genres from events
  const availableGenres = useMemo(() => {
    const genreSet = new Set<string>();
    events.forEach(event => {
      if (event.genres) {
        event.genres.forEach(genre => genreSet.add(genre));
      }
    });
    return Array.from(genreSet).sort();
  }, [events]);

  // Sort events based on selected criteria
  const sortedEvents = useMemo(() => {
    const eventsToSort = selectedDate ? dateFilteredEvents : filteredEvents;
    
    return [...eventsToSort].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'date':
          const dateA = new Date(a.event_date).getTime();
          const dateB = new Date(b.event_date).getTime();
          comparison = dateA - dateB;
          break;
          
        case 'price':
          const priceA = extractNumericPrice(a.price_range || '');
          const priceB = extractNumericPrice(b.price_range || '');
          comparison = priceA - priceB;
          break;
          
        case 'popularity':
          // For now, use a simple popularity metric based on venue size or other factors
          // This could be enhanced with actual engagement data
          const popularityA = a.venue_name?.length || 0; // Simple heuristic
          const popularityB = b.venue_name?.length || 0;
          comparison = popularityA - popularityB;
          break;
          
        case 'distance':
          // Calculate distance if user location is available
          if (userLocation && a.latitude && a.longitude && b.latitude && b.longitude) {
            const distanceA = calculateDistance(userLocation.lat, userLocation.lng, a.latitude, a.longitude);
            const distanceB = calculateDistance(userLocation.lat, userLocation.lng, b.latitude, b.longitude);
            comparison = distanceA - distanceB;
          } else {
            comparison = 0;
          }
          break;
          
        case 'relevance':
        default:
          // Default relevance based on date proximity and other factors
          const now = Date.now();
          const eventDateA = new Date(a.event_date).getTime();
          const eventDateB = new Date(b.event_date).getTime();
          const relevanceA = Math.abs(eventDateA - now);
          const relevanceB = Math.abs(eventDateB - now);
          comparison = relevanceA - relevanceB;
          break;
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

  // Filter events when filters change
  useEffect(() => {
    filterEvents();
  }, [events, filters]);

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

  const initializeLocationAndEvents = async () => {
    setIsLoading(true);
    try {
      // Try to get user's location
      try {
        const location = await LocationService.getCurrentLocation();
        setUserLocation({ lat: location.latitude, lng: location.longitude });
        setMapCenter([location.latitude, location.longitude]);
        setMapZoom(10);
      } catch (error) {
        console.log('Could not get user location:', error);
      }

      // Load events and cities from database
      await loadEvents();
      await loadCities();
      await loadInterestedEvents();
    } catch (error) {
      console.error('Error initializing search page:', error);
      toast({
        title: "Error",
        description: "Failed to load events. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadEvents = async () => {
    try {
      const { data: eventsData, error } = await supabase
        .from('jambase_events')
        .select('*')
        .gte('event_date', new Date().toISOString())
        .order('event_date', { ascending: true })
        .limit(100);

      if (error) throw error;

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
        tour_name: event.tour_name,
        created_at: event.created_at,
        updated_at: event.updated_at
      }));

      setEvents(transformedEvents);
    } catch (error) {
      console.error('Error loading events:', error);
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
      console.warn('Failed to load cities:', error);
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
      console.warn('Failed to load interested events:', error);
      setInterestedEvents(new Set());
    }
  };

  const filterEvents = () => {
    let filtered = [...events];

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

    // Filter by selected cities (exact match from database list)
    if (filters.selectedCities && filters.selectedCities.length > 0) {
      const citySet = new Set(filters.selectedCities.map(c => c.toLowerCase()));
      filtered = filtered.filter(event => event.venue_city && citySet.has(event.venue_city.toLowerCase()));
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
          console.error('Error parsing event date:', event.event_date);
          return true;
        }
      });
    }

    setFilteredEvents(filtered);
  };

  const handleSearch = async (query: string, type: SearchType) => {
    setSearchQuery(query);
    setSearchType(type);
    
    if (type === 'events' || type === 'all') {
      // The filtering will be handled by the useEffect
      return;
    }
    
    // For artist searches, we could integrate with the existing artist search
    toast({
      title: "Artist Search",
      description: `Searching for artists matching "${query}"`,
    });
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchType('all');
  };

  const handleEventClick = (event: JamBaseEventResponse) => {
    setSelectedEvent(event);
    setEventDetailsOpen(true);
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
      console.error('Error toggling interest:', error);
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
      ticket_available: event.ticket_available || null,
      price_range: event.price_range || null,
      ticket_urls: event.ticket_urls || null,
      setlist: event.setlist || null,
      tour_name: event.tour_name || null,
      created_at: event.created_at,
      updated_at: event.updated_at
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
    <div className="min-h-screen bg-background">
      <div id="search-layout-root" className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Discover Events</h1>
          <p className="text-muted-foreground">
            Find concerts, festivals, and music events near you
          </p>
        </div>

        {/* Compact Search Bar */}
        <div className="max-w-2xl mx-auto relative z-50">
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

        {/* Search Results Summary */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>
            Showing {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
            {searchQuery && ` for "${searchQuery}"`}
            <span className="ml-2 text-xs">
              (sorted by {sortBy} {sortOrder === 'asc' ? '↑' : '↓'})
            </span>
          </div>
          {(searchQuery || filters.genres.length > 0 || (filters.selectedCities && filters.selectedCities.length > 0) || filters.dateRange.from || filters.dateRange.to) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setFilters({
                  genres: [],
                  selectedCities: [],
                  dateRange: { from: undefined, to: undefined },
                  showFilters: false
                });
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              Clear all filters
            </Button>
          )}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            <span>Loading events...</span>
          </div>
        )}

        {/* Main Content */}
        {!isLoading && (
          filteredEvents.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-0">
              {/* Left: Map or Calendar */}
              <div className="order-1 lg:order-1 lg:col-span-1 relative z-10">
                {viewMode === 'map' ? (
                  <Card className="relative z-10">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Map className="h-5 w-5" />
                        Events Map
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="relative z-10">
                      <div className="w-full h-96 rounded-lg overflow-hidden relative z-10">
                        <EventMap
                          center={mapCenter}
                          zoom={mapZoom}
                          events={filteredEvents}
                          onEventClick={handleEventClick}
                        />
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
                <Card className="relative z-10">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Music className="h-5 w-5" />
                        {selectedDate ? `Events on ${format(selectedDate, 'MMM d, yyyy')}` : 'Upcoming Events'}
                      </CardTitle>
                      <div className="flex items-center gap-2">
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
                            className="p-1 h-6 w-6"
                          >
                            {sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                          </Button>
                        </div>
                        {selectedDate && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDateSelect(undefined)}
                            className="text-xs"
                          >
                            Clear Date Filter
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-96">
                      <div className="space-y-4">
                        {sortedEvents.slice(0, 50).map((event) => (
                          <div
                            key={event.id}
                            className="p-4 border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                            onClick={() => handleEventClick(event)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-lg mb-1 line-clamp-1">
                                  {event.title || event.artist_name}
                                </h3>
                                {event.artist_name && event.artist_name !== event.title && (
                                  <p className="text-muted-foreground mb-2 flex items-center gap-1">
                                    <Music className="h-4 w-4" />
                                    {event.artist_name}
                                  </p>
                                )}
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Calendar className="h-4 w-4" />
                                    <span>
                                      {(() => {
                                        try {
                                          return format(parseISO(event.event_date), 'EEEE, MMMM d, yyyy');
                                        } catch {
                                          return event.event_date;
                                        }
                                      })()}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <MapPin className="h-4 w-4" />
                                    <span>
                                      {event.venue_name}
                                      {event.venue_city && `, ${event.venue_city}`}
                                    </span>
                                  </div>
                                  {event.doors_time && (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                      <Clock className="h-4 w-4" />
                                      <span>Doors: {event.doors_time}</span>
                                    </div>
                                  )}
                                  {event.genres && event.genres.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {event.genres.slice(0, 3).map((genre, index) => (
                                        <Badge key={index} variant="outline" className="text-xs">
                                          {genre}
                                        </Badge>
                                      ))}
                                      {event.genres.length > 3 && (
                                        <Badge variant="outline" className="text-xs">
                                          +{event.genres.length - 3}
                                        </Badge>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-2 ml-4">
                                {event.price_range && (
                                  <Badge variant="secondary">
                                    {formatPrice(event.price_range)}
                                  </Badge>
                                )}
                                <div className="flex gap-1">
                                  <Button 
                                    size="sm" 
                                    variant={interestedEvents.has(event.id) ? "default" : "outline"}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleInterestToggle(event.id, !interestedEvents.has(event.id));
                                    }}
                                  >
                                    <Users className="h-4 w-4 mr-1" />
                                    {interestedEvents.has(event.id) ? "Interested" : "Show Interest"}
                                  </Button>
                                  {event.ticket_urls && event.ticket_urls.length > 0 && (
                                    <Button
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(event.ticket_urls![0], '_blank');
                                      }}
                                    >
                                      <Ticket className="h-4 w-4 mr-1" />
                                      Tickets
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {/* Empty state for date filtering */}
                        {selectedDate && dateFilteredEvents.length === 0 && (
                          <div className="text-center py-8">
                            <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                            <h3 className="text-lg font-semibold text-muted-foreground mb-2">
                              No Events Found
                            </h3>
                            <p className="text-sm text-muted-foreground mb-4">
                              No events scheduled for {format(selectedDate, 'MMMM d, yyyy')}
                            </p>
                            <Button
                              variant="outline"
                              onClick={() => handleDateSelect(undefined)}
                              className="text-sm"
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
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No events found</h3>
                <p className="text-muted-foreground mb-4">
                  Try adjusting your search criteria or filters
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery('');
                    setFilters({
                      genres: [],
                      selectedCities: [],
                      dateRange: { from: undefined, to: undefined },
                      showFilters: false
                    });
                  }}
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
            isInterested={interestedEvents.has(selectedEvent.id)}
            hasReviewed={false} // You could track this if needed
          />
        )}
      </div>
    </div>
  );
};
