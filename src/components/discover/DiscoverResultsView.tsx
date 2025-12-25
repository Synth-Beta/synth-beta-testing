import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, Calendar as CalendarIcon, MapPin, Music, X } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { DiscoverVibeService, type VibeType, type VibeResult, type VibeFilters } from '@/services/discoverVibeService';
import { CompactEventCard } from './CompactEventCard';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { UserEventService } from '@/services/userEventService';
import { supabase } from '@/integrations/supabase/client';
import type { JamBaseEvent } from '@/types/eventTypes';

const COMMON_GENRES = [
  'Rock', 'Pop', 'Hip-Hop', 'Electronic', 'Jazz', 'Classical', 'Country', 
  'R&B', 'Reggae', 'Folk', 'Blues', 'Alternative', 'Indie', 'Punk',
  'Metal', 'Funk', 'Soul', 'Gospel', 'Latin', 'World'
];

interface DiscoverResultsViewProps {
  vibeType: VibeType;
  userId: string;
  filters?: VibeFilters;
  onBack: () => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
}

export const DiscoverResultsView: React.FC<DiscoverResultsViewProps> = ({
  vibeType,
  userId,
  filters: initialFilters,
  onBack,
  onNavigateToProfile,
  onNavigateToChat,
}) => {
  const [results, setResults] = useState<VibeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<JamBaseEvent | null>(null);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [selectedEventInterested, setSelectedEventInterested] = useState(false);
  const [interestedEvents, setInterestedEvents] = useState<Set<string>>(new Set());

  // Filter state
  const [filters, setFilters] = useState<VibeFilters>(initialFilters || {});
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [genresOpen, setGenresOpen] = useState(false);
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [tempSelectedCities, setTempSelectedCities] = useState<string[]>([]);
  const [citiesData, setCitiesData] = useState<Array<{ city: string; state: string; eventCount: number }>>([]);
  const [isLoadingCities, setIsLoadingCities] = useState(false);

  const ITEMS_PER_PAGE = 20;

  // Load cities data
  useEffect(() => {
    if (locationsOpen) {
      loadCities();
    }
  }, [locationsOpen]);

  useEffect(() => {
    loadResults();
    loadInterestedEvents();
  }, [vibeType, userId, filters]);

  const loadCities = async () => {
    setIsLoadingCities(true);
    try {
      const { data } = await supabase
        .from('events')
        .select('venue_city, venue_state')
        .gte('event_date', new Date().toISOString())
        .not('venue_city', 'is', null)
        .limit(1000);

      const cityMap = new Map<string, { city: string; state: string; eventCount: number }>();
      (data || []).forEach((event: any) => {
        if (event.venue_city) {
          const key = `${event.venue_city}, ${event.venue_state || ''}`.trim();
          const existing = cityMap.get(key);
          if (existing) {
            existing.eventCount += 1;
          } else {
            cityMap.set(key, {
              city: event.venue_city,
              state: event.venue_state || '',
              eventCount: 1,
            });
          }
        }
      });

      setCitiesData(
        Array.from(cityMap.values())
          .sort((a, b) => b.eventCount - a.eventCount)
          .slice(0, 50)
      );
    } catch (error) {
      console.error('Error loading cities:', error);
    } finally {
      setIsLoadingCities(false);
    }
  };

  const handleGenreToggle = (genre: string) => {
    const newGenres = filters.genres?.includes(genre)
      ? filters.genres.filter(g => g !== genre)
      : [...(filters.genres || []), genre];
    
    setFilters({
      ...filters,
      genres: newGenres,
    });
  };

  const handleCitiesApply = () => {
    setFilters({
      ...filters,
      cities: tempSelectedCities,
    });
    setLocationsOpen(false);
  };

  const handleCityToggle = (cityKey: string) => {
    setTempSelectedCities(prev =>
      prev.includes(cityKey)
        ? prev.filter(c => c !== cityKey)
        : [...prev, cityKey]
    );
  };

  const clearFilters = () => {
    setFilters({
      dateRange: undefined,
      genres: [],
      cities: [],
      radiusMiles: initialFilters?.radiusMiles,
      latitude: initialFilters?.latitude,
      longitude: initialFilters?.longitude,
    });
    setTempSelectedCities([]);
  };

  const hasActiveFilters = Boolean(
    filters.dateRange?.from ||
    filters.dateRange?.to ||
    (filters.genres && filters.genres.length > 0) ||
    (filters.cities && filters.cities.length > 0)
  );

  const loadInterestedEvents = async () => {
    try {
      const { data } = await supabase
        .from('user_event_relationships')
        .select('event_id')
        .eq('user_id', userId)
        .eq('relationship_type', 'interest');

      if (data) {
        setInterestedEvents(new Set(data.map(r => r.event_id)));
      }
    } catch (error) {
      console.error('Error loading interested events:', error);
    }
  };

  const loadResults = async () => {
    setLoading(true);
    try {
      const result = await DiscoverVibeService.executeVibe(vibeType, userId, ITEMS_PER_PAGE * 3, filters);
      setResults(result);
      setPage(1);
    } catch (error) {
      console.error('Error loading vibe results:', error);
      setResults({
        events: [],
        title: 'Error',
        description: 'Unable to load results',
        totalCount: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEventClick = async (event: JamBaseEvent) => {
    try {
      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('id', event.id)
        .single();

      if (data) {
        setSelectedEvent(data);
        const interested = await UserEventService.isUserInterested(userId, data.id);
        setSelectedEventInterested(interested);
        setEventDetailsOpen(true);
      } else {
        setSelectedEvent(event);
        setSelectedEventInterested(interestedEvents.has(event.id || ''));
        setEventDetailsOpen(true);
      }
    } catch (error) {
      console.error('Error fetching event details:', error);
      setSelectedEvent(event);
      setSelectedEventInterested(interestedEvents.has(event.id || ''));
      setEventDetailsOpen(true);
    }
  };

  const handleInterestToggle = async (eventId: string, interested: boolean) => {
    try {
      await UserEventService.setEventInterest(userId, eventId, interested);
      setInterestedEvents(prev => {
        const next = new Set(prev);
        if (interested) {
          next.add(eventId);
        } else {
          next.delete(eventId);
        }
        return next;
      });
      setSelectedEventInterested(interested);
    } catch (error) {
      console.error('Error toggling interest:', error);
    }
  };

  const displayedEvents = results?.events.slice(0, page * ITEMS_PER_PAGE) || [];
  const hasMore = results ? displayedEvents.length < results.events.length : false;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 pt-4 pb-6">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Discover
          </Button>
          {results && (
            <>
              <h1 className="text-2xl font-bold mb-2">{results.title}</h1>
              <p className="text-muted-foreground">{results.description}</p>
            </>
          )}
        </div>

        {/* Filters */}
        <div className="mb-6 flex items-center gap-2 flex-wrap">
          {/* Date Filter */}
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="p-2 flex-shrink-0">
                <CalendarIcon className="h-4 w-4 text-black" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-white" align="start">
              <Calendar
                mode="range"
                selected={{
                  from: filters.dateRange?.from,
                  to: filters.dateRange?.to,
                }}
                onSelect={(range) => {
                  setFilters({
                    ...filters,
                    dateRange: range,
                  });
                  if (range?.from && range?.to) {
                    setDatePickerOpen(false);
                  }
                }}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>

          {/* Genre Filter */}
          <Popover open={genresOpen} onOpenChange={setGenresOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="p-2 relative flex-shrink-0">
                <Music className="h-4 w-4 text-black" />
                {filters.genres && filters.genres.length > 0 && (
                  <Badge variant="secondary" className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-xs flex items-center justify-center">
                    {filters.genres.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 bg-white" align="start">
              <div className="space-y-2">
                <div className="font-semibold text-sm mb-2">Select Genres</div>
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                  {COMMON_GENRES.map((genre) => (
                    <label
                      key={genre}
                      className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded hover:bg-accent"
                    >
                      <Checkbox
                        checked={filters.genres?.includes(genre) || false}
                        onCheckedChange={() => handleGenreToggle(genre)}
                      />
                      <span>{genre}</span>
                    </label>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Location Filter */}
          <Popover open={locationsOpen} onOpenChange={(open) => {
            setLocationsOpen(open);
            if (open) {
              setTempSelectedCities(filters.cities || []);
            }
          }}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="p-2 relative flex-shrink-0">
                <MapPin className="h-4 w-4 text-black" />
                {filters.cities && filters.cities.length > 0 && (
                  <Badge variant="secondary" className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-xs flex items-center justify-center">
                    {filters.cities.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 bg-white" align="start">
              <div className="space-y-2">
                <div className="font-semibold text-sm mb-2">Select Cities</div>
                {isLoadingCities ? (
                  <div className="text-sm text-muted-foreground">Loading cities...</div>
                ) : (
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {citiesData.map((cityData, index) => {
                      const cityKey = cityData.state
                        ? `${cityData.city}, ${cityData.state}`
                        : cityData.city;
                      const isChecked = tempSelectedCities.includes(cityKey);
                      return (
                        <label
                          key={`${cityKey}-${index}`}
                          className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded hover:bg-accent"
                        >
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => handleCityToggle(cityKey)}
                          />
                          <div className="flex-1">
                            <div className="font-medium">{cityData.city}</div>
                            {cityData.state && (
                              <div className="text-xs text-muted-foreground">{cityData.state}</div>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{cityData.eventCount}</div>
                        </label>
                      );
                    })}
                  </div>
                )}
                <div className="flex gap-2 pt-2 border-t">
                  <Button size="sm" onClick={handleCitiesApply} className="flex-1">
                    Apply
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setTempSelectedCities([]);
                      setFilters({ ...filters, cities: [] });
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="p-2 text-muted-foreground hover:text-foreground flex-shrink-0"
            >
              <X className="h-4 w-4 text-black" />
            </Button>
          )}
        </div>

        {/* Active Filter Badges */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 flex-wrap mb-4">
            {filters.dateRange?.from && (
              <Badge variant="secondary" className="gap-1">
                Date: {format(filters.dateRange.from, 'MMM d')}
                {filters.dateRange.to && ` - ${format(filters.dateRange.to, 'MMM d')}`}
                <button
                  onClick={() => setFilters({ ...filters, dateRange: undefined })}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {filters.genres?.map((genre) => (
              <Badge key={genre} variant="secondary" className="gap-1">
                {genre}
                <button
                  onClick={() => handleGenreToggle(genre)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {filters.cities?.map((city) => (
              <Badge key={city} variant="secondary" className="gap-1">
                {city}
                <button
                  onClick={() => {
                    setFilters({
                      ...filters,
                      cities: filters.cities?.filter(c => c !== city),
                    });
                  }}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Results */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : results && results.events.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No events found for this vibe.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedEvents.map((event) => (
                <CompactEventCard
                  key={event.id}
                  event={event}
                  onClick={() => handleEventClick(event)}
                  socialProofCount={undefined}
                />
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => setPage(prev => prev + 1)}
                >
                  Load More
                </Button>
              </div>
            )}

            {!hasMore && results && results.events.length > 0 && (
              <div className="text-center py-4 text-sm text-muted-foreground">
                Showing all {results.events.length} events
              </div>
            )}
          </div>
        )}
      </div>

      {/* Event Details Modal */}
      {eventDetailsOpen && selectedEvent && (
        <EventDetailsModal
          isOpen={eventDetailsOpen}
          onClose={() => {
            setEventDetailsOpen(false);
            setSelectedEvent(null);
          }}
          event={selectedEvent}
          currentUserId={userId}
          isInterested={selectedEventInterested}
          onInterestToggle={handleInterestToggle}
          onReview={() => {
            console.log('Review event:', selectedEvent.id);
          }}
          onNavigateToProfile={onNavigateToProfile}
          onNavigateToChat={onNavigateToChat}
        />
      )}
    </div>
  );
};

