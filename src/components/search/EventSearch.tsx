import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Search, 
  Loader2, 
  Music, 
  MapPin, 
  Clock, 
  Ticket, 
  ChevronLeft, 
  ChevronRight,
  X,
  PlusCircle,
  CheckCircle
} from 'lucide-react';
import { UnifiedArtistSearchService } from '@/services/unifiedArtistSearchService';
import type { Artist, PaginatedEvents, Event } from '@/types/concertSearch';
import { safeFormatEventDateTime } from '@/lib/dateUtils';
import { formatPrice } from '@/utils/currencyUtils';
import { cn } from '@/lib/utils';
import { ManualArtistForm } from '@/components/search/ManualArtistForm';
import { useToast } from '@/hooks/use-toast';

interface EventSearchProps {
  userId: string;
  onEventSelect?: (event: Event) => void;
  className?: string;
}

export function EventSearch({ userId, onEventSelect, className }: EventSearchProps) {
  const [query, setQuery] = useState('');
  const [artists, setArtists] = useState<Artist[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [events, setEvents] = useState<PaginatedEvents | null>(null);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const [showManualArtistForm, setShowManualArtistForm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const eventsPerPage = 10;

  // Debounced artist search (optional - can be triggered by button)
  useEffect(() => {
    console.log('🔍 EventSearch: useEffect triggered, query:', query, 'selectedArtist:', selectedArtist);
    
    if (!query.trim()) {
      console.log('🔍 EventSearch: Empty query, clearing results');
      setArtists([]);
      setIsOpen(false);
      return;
    }

    // Only auto-search if there's no selected artist (user is typing new search)
    if (!selectedArtist) {
      console.log('🔍 EventSearch: No selected artist, setting up debounced search');
      const timeoutId = setTimeout(async () => {
        console.log('🔍 EventSearch: Debounced search executing for:', query);
        await searchArtists(query);
      }, 500); // Increased debounce time since we have a button

      return () => clearTimeout(timeoutId);
    } else {
      console.log('🔍 EventSearch: Artist selected, skipping auto-search');
    }
  }, [query, selectedArtist]);

  // Load events when artist or tab changes
  useEffect(() => {
    if (selectedArtist) {
      loadEvents();
    }
  }, [selectedArtist, activeTab, currentPage]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || !artists.length) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev < artists.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < artists.length) {
            handleArtistSelect(artists[selectedIndex]);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setSelectedIndex(-1);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, artists, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const selectedItem = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const searchArtists = async (searchQuery: string) => {
    console.log('🔍 EventSearch: searchArtists called with:', searchQuery);
    
    if (!searchQuery.trim()) {
      console.log('🔍 EventSearch: Empty query, clearing results');
      setArtists([]);
      setIsOpen(false);
      return;
    }

    try {
      console.log('🔍 EventSearch: Starting search...');
      setIsSearching(true);
      setError(null);
      
      const result = await UnifiedArtistSearchService.searchArtists(searchQuery, 10);
      console.log('🔍 EventSearch: Search result:', result);
      console.log('🔍 EventSearch: Artists found:', result.length);
      
      // Convert ArtistSearchResult[] to Artist[] format
      const artists = result.map(artist => ({
        id: artist.id,
        name: artist.name,
        image_url: artist.image_url,
        genres: artist.genres,
        description: `${artist.band_or_musician || 'Artist'}${artist.num_upcoming_events ? ` • ${artist.num_upcoming_events} upcoming events` : ''}`,
        popularity_score: artist.match_score / 100, // Convert percentage to 0-1 scale
        source: artist.is_from_database ? 'database' as const : 'jambase' as const
      }));
      
      setArtists(artists);
      setIsOpen(true);
      setSelectedIndex(-1);
    } catch (error) {
      console.error('🔍 EventSearch: Artist search error:', error);
      setError(error instanceof Error ? error.message : 'Failed to search artists');
      setArtists([]);
      setIsOpen(true);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = () => {
    if (query.trim()) {
      searchArtists(query);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  const loadEvents = async () => {
    if (!selectedArtist) return;

    console.log('🔍 EventSearch: Loading events for artist:', selectedArtist.name, 'source:', (selectedArtist as any).source);

    try {
      setIsLoading(true);
      setError(null);

      // Check if this is a fallback artist (no real events)
      if ((selectedArtist as any).source === 'fallback') {
        console.log('🔍 EventSearch: Fallback artist selected, showing mock events');
        // Create mock events for fallback artists
        const mockEvents = {
          events: [
            {
              id: `mock-${selectedArtist.name}-1`,
              jambase_event_id: `mock-${selectedArtist.name}-1`,
              title: `${selectedArtist.name} - Sample Event`,
              artist_name: selectedArtist.name,
              venue_name: 'Sample Venue',
              event_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
              description: `Sample event for ${selectedArtist.name}`,
              genres: selectedArtist.genres || [],
              venue_city: 'Sample City',
              venue_state: 'Sample State',
              ticket_available: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
          ],
          totalFound: 1,
          currentPage: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false
        };
        setEvents(mockEvents);
        return;
      }

      // For now, create mock events since we don't have event loading in the new service
      // This can be enhanced later to load actual events from the database
      const mockEvents = {
        events: [
          {
            id: `mock-${selectedArtist.name}-${currentPage}-1`,
            jambase_event_id: `mock-${selectedArtist.name}-${currentPage}-1`,
            title: `${selectedArtist.name} - ${activeTab === 'upcoming' ? 'Upcoming' : 'Past'} Event ${currentPage}`,
            artist_name: selectedArtist.name,
            venue_name: 'Sample Venue',
            event_date: activeTab === 'upcoming' 
              ? new Date(Date.now() + (currentPage * 7) * 24 * 60 * 60 * 1000).toISOString() // Future date
              : new Date(Date.now() - (currentPage * 7) * 24 * 60 * 60 * 1000).toISOString(), // Past date
            description: `Sample ${activeTab} event for ${selectedArtist.name}`,
            genres: selectedArtist.genres || [],
            venue_city: 'Sample City',
            venue_state: 'Sample State',
            ticket_available: activeTab === 'upcoming',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ],
        totalFound: 5, // Mock total
        currentPage: currentPage,
        totalPages: 5,
        hasNextPage: currentPage < 5,
        hasPreviousPage: currentPage > 1
      };
      
      const result = mockEvents;
      console.log('🔍 EventSearch: Loaded events:', result.events.length);
      setEvents(result);
    } catch (err) {
      console.error('Error loading events:', err);
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setIsLoading(false);
    }
  };

  const handleArtistSelect = (artist: Artist) => {
    setSelectedArtist(artist);
    setQuery(artist.name);
    setIsOpen(false);
    setSelectedIndex(-1);
    setCurrentPage(1);
    inputRef.current?.blur();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    if (selectedArtist && e.target.value !== selectedArtist.name) {
      setSelectedArtist(null);
      setEvents(null);
    }
  };

  const handleInputFocus = () => {
    if (artists.length > 0) {
      setIsOpen(true);
    }
  };

  const handleInputBlur = () => {
    setTimeout(() => {
      setIsOpen(false);
      setSelectedIndex(-1);
    }, 150);
  };

  const clearSearch = () => {
    setQuery('');
    setArtists([]);
    setSelectedArtist(null);
    setEvents(null);
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handleEventInterest = async (event: Event) => {
    try {
      // Handle event interest toggle
      if (onEventSelect) {
        onEventSelect(event);
      }
    } catch (error) {
      console.error('Error toggling event interest:', error);
    }
  };

  const formatEventDate = (dateString: string, timeString?: string) => {
    return safeFormatEventDateTime({ event_date: dateString, event_time: timeString });
  };

  const formatGenres = (genres: string[] = []) => {
    return genres.slice(0, 3).join(', ');
  };

  const handleManualArtistCreated = (artist: Artist) => {
    handleArtistSelect(artist);
    toast({
      title: "Artist Created! 🎵",
      description: `${artist.name} has been added. You can now browse their events.`,
    });
  };

  const renderEventCard = (event: Event) => {
    const isUpcoming = new Date(event.event_date) > new Date();

    return (
      <div
        key={event.id}
        className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-medium text-sm truncate">
                {event.title || event.event_name}
              </h4>
              <Badge 
                variant={event.jambase_event_id ? "default" : "secondary"}
                className="text-xs"
              >
                {event.jambase_event_id ? 'JamBase' : 'Manual'}
              </Badge>
              {isUpcoming && (
                <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                  Upcoming
                </Badge>
              )}
            </div>
            
            <p className="text-sm text-gray-600 mb-2">
              {event.artist_name} at {event.venue_name}
            </p>
            
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                <span>
                  {event.venue_city && event.venue_state 
                    ? `${event.venue_city}, ${event.venue_state}` 
                    : event.location || 'Location TBD'
                  }
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{formatEventDate(event.event_date, event.event_time || undefined)}</span>
              </div>
            </div>
            
            {event.price_range && (
              <p className="text-xs text-gray-500 mt-1">
                {formatPrice(event.price_range)}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-2 ml-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleEventInterest(event)}
              className="h-8 w-8 p-0 text-gray-400 hover:text-green-600"
            >
              <PlusCircle className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderPagination = () => {
    if (!events || events.totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-between mt-6">
        <div className="text-sm text-gray-500">
          Showing {((currentPage - 1) * eventsPerPage) + 1} to {Math.min(currentPage * eventsPerPage, events.totalFound)} of {events.totalFound} events
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={!events.hasPreviousPage || isLoading}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, events.totalPages) }, (_, i) => {
              let pageNum;
              if (events.totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= events.totalPages - 2) {
                pageNum = events.totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? "default" : "outline"}
                  size="sm"
                  onClick={() => handlePageChange(pageNum)}
                  disabled={isLoading}
                  className="w-8 h-8 p-0"
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={!events.hasNextPage || isLoading}
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <>
      <ManualArtistForm
        open={showManualArtistForm}
        onClose={() => setShowManualArtistForm(false)}
        onArtistCreated={handleManualArtistCreated}
        initialQuery={query}
      />
    <div className={cn("w-full max-w-4xl mx-auto", className)}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            Event Search
          </CardTitle>
          <p className="text-sm text-gray-600">
            Search for an artist to browse their past and upcoming events
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Search Input */}
          <div className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder="Search for an artist..."
                  value={query}
                  onChange={handleInputChange}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  onKeyPress={handleKeyPress}
                  className="pl-10 pr-10"
                  autoComplete="off"
                />
                {query && !isSearching && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearSearch}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-gray-100"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
              <Button
                onClick={handleSearch}
                disabled={isSearching}
                className="px-6"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Search
                  </>
                )}
              </Button>
            </div>

            {/* Artist Search Results Dropdown */}
            {isOpen && (
              <Card className="absolute top-full left-0 right-0 z-50 mt-1 max-h-80 overflow-y-auto shadow-lg border">
              <CardContent className="p-0">
                <div ref={listRef} className="py-2">
                  {artists.length > 0 ? (
                    artists.map((artist, index) => (
                    <div
                      key={artist.id}
                      className={cn(
                        "px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors",
                        "flex items-start gap-3",
                        selectedIndex === index && "bg-blue-50 border-l-4 border-blue-500"
                      )}
                      onClick={() => handleArtistSelect(artist)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <div className="flex-shrink-0 mt-1">
                        {artist.image_url ? (
                          <img
                            src={artist.image_url}
                            alt={artist.name}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                            <Music className="w-5 h-5 text-gray-400" />
                          </div>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-gray-900 truncate">
                            {artist.name}
                          </h3>
                          {artist.popularity_score && artist.popularity_score > 0 && (
                            <Badge variant="outline" className="text-xs">
                              Popular
                            </Badge>
                          )}
                          {(artist as any).source && (
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${
                                (artist as any).source === 'database' 
                                  ? 'text-green-600 border-green-300' 
                                  : 'text-blue-600 border-blue-300'
                              }`}
                            >
                              {(artist as any).source === 'database' ? 'Database' : 'JamBase'}
                            </Badge>
                          )}
                        </div>
                        
                        {artist.description && (
                          <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                            {artist.description}
                          </p>
                        )}
                        
                        {artist.genres && artist.genres.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {artist.genres.slice(0, 3).map((genre, genreIndex) => (
                              <Badge
                                key={genreIndex}
                                variant="secondary"
                                className="text-xs px-2 py-0.5"
                              >
                                {genre}
                              </Badge>
                            ))}
                            {artist.genres.length > 3 && (
                              <span className="text-xs text-gray-500">
                                +{artist.genres.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    ))
                  ) : (
                    <div className="px-4 py-8 text-center text-gray-500">
                      <Music className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm">No artists found for "{query}"</p>
                      <p className="text-xs text-gray-400 mt-2 mb-3">Try a different search term</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsOpen(false);
                          setShowManualArtistForm(true);
                        }}
                        className="gap-2"
                      >
                        <PlusCircle className="w-4 h-4" />
                        Add "{query}" Manually
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            )}
          </div>

          {/* Selected Artist Display */}
          {selectedArtist && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {selectedArtist.image_url ? (
                    <img
                      src={selectedArtist.image_url}
                      alt={selectedArtist.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                      <Music className="w-6 h-6 text-gray-400" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-gray-900">{selectedArtist.name}</h3>
                    {selectedArtist.description && (
                      <p className="text-sm text-gray-600 line-clamp-1">
                        {selectedArtist.description}
                      </p>
                    )}
                    {selectedArtist.genres && selectedArtist.genres.length > 0 && (
                      <p className="text-xs text-gray-500">
                        {formatGenres(selectedArtist.genres)}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSearch}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Events Display */}
          {selectedArtist && (
            <Tabs value={activeTab} onValueChange={(value) => {
              setActiveTab(value as 'upcoming' | 'past');
              setCurrentPage(1);
            }}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upcoming">Upcoming Events</TabsTrigger>
                <TabsTrigger value="past">Past Events</TabsTrigger>
              </TabsList>
              
              <TabsContent value="upcoming" className="mt-6">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                    <span className="ml-2 text-gray-600">Loading upcoming events...</span>
                  </div>
                ) : error ? (
                  <div className="text-center py-12">
                    <p className="text-red-600 mb-2">Error loading events</p>
                    <p className="text-sm text-gray-500">{error}</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={loadEvents}
                      className="mt-4"
                    >
                      Try Again
                    </Button>
                  </div>
                ) : events && events.events.length > 0 ? (
                  <div className="space-y-4">
                    <div className="space-y-3">
                      {events.events.map(renderEventCard)}
                    </div>
                    {renderPagination()}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Music className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="font-semibold text-gray-900 mb-1">No Upcoming Events</h3>
                    <p className="text-sm text-gray-600">
                      No upcoming concerts found for {selectedArtist.name}
                    </p>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="past" className="mt-6">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                    <span className="ml-2 text-gray-600">Loading past events...</span>
                  </div>
                ) : error ? (
                  <div className="text-center py-12">
                    <p className="text-red-600 mb-2">Error loading events</p>
                    <p className="text-sm text-gray-500">{error}</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={loadEvents}
                      className="mt-4"
                    >
                      Try Again
                    </Button>
                  </div>
                ) : events && events.events.length > 0 ? (
                  <div className="space-y-4">
                    <div className="space-y-3">
                      {events.events.map(renderEventCard)}
                    </div>
                    {renderPagination()}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Music className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="font-semibold text-gray-900 mb-1">No Past Events</h3>
                    <p className="text-sm text-gray-600">
                      No past concerts found for {selectedArtist.name}
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}

          {/* No Artist Selected State */}
          {!selectedArtist && (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 mb-1">Search for an Artist</h3>
              <p className="text-sm text-gray-600">
                Type an artist name above to find their events
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </>
  );
}
