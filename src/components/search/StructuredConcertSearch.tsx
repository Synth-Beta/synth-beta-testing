import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarIcon, Search, Loader2, Music, MapPin, Clock, CheckCircle, PlusCircle, X, Users } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { concertSearchService } from '@/services/concertSearchService';
import { ArtistSearchBox } from './ArtistSearchBox';
import { ArtistSelector } from './ArtistSelector';
import { ArtistEventPagination } from './ArtistEventPagination';
import type { Event, Artist } from '@/types/concertSearch';

interface StructuredSearchParams {
  artist: string;
  venue?: string;
  date?: string;
}

interface SearchResult {
  events: Event[];
  totalFound: number;
  searchType: 'similar' | 'artist_recent_upcoming';
}

interface StructuredConcertSearchProps {
  onEventsFound: (result: SearchResult) => void;
  userId: string;
}

export function StructuredConcertSearch({ onEventsFound, userId }: StructuredConcertSearchProps) {
  const [searchMode, setSearchMode] = useState<'structured' | 'artist'>('structured');
  const [searchParams, setSearchParams] = useState<StructuredSearchParams>({
    artist: '',
    venue: '',
    date: ''
  });
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  
  // Artist search state
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [showArtistEvents, setShowArtistEvents] = useState(false);

  // Handle date selection
  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    setSearchParams(prev => ({
      ...prev,
      date: date ? format(date, 'yyyy-MM-dd') : ''
    }));
  };

  // Clear date
  const clearDate = () => {
    setSelectedDate(undefined);
    setSearchParams(prev => ({ ...prev, date: '' }));
  };

  // Clear venue
  const clearVenue = () => {
    setSearchParams(prev => ({ ...prev, venue: '' }));
  };

  // Artist search handlers
  const handleArtistSelect = (artist: Artist) => {
    setSelectedArtist(artist);
    setShowArtistEvents(false);
  };

  const handleViewArtistEvents = () => {
    setShowArtistEvents(true);
  };

  const handleRemoveArtist = () => {
    setSelectedArtist(null);
    setShowArtistEvents(false);
  };

  const handleEventSelect = (event: Event) => {
    // Handle event selection (add to user's interests, etc.)
    console.log('Event selected:', event);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    setSearchResults(null);

    try {
      // Determine search type based on parameters
      const hasOnlyArtist = searchParams.artist && !searchParams.venue && !searchParams.date;
      
      let result: SearchResult;
      
      if (hasOnlyArtist) {
        // Artist-only search: 10 recent + 10 upcoming
        result = await concertSearchService.searchArtistEvents(searchParams.artist, userId);
      } else {
        // Structured search: most similar 20 events
        result = await concertSearchService.searchSimilarEvents(searchParams, userId);
      }

      setSearchResults(result);
      onEventsFound(result);
    } catch (error) {
      console.error('Search error:', error);
      setError(error instanceof Error ? error.message : 'An error occurred while searching');
    } finally {
      setIsLoading(false);
    }
  };

  // Format event date for display
  const formatEventDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  // Check if form is valid
  const isFormValid = searchParams.artist.trim().length > 0;

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Music className="h-5 w-5" />
          Concert Search
        </CardTitle>
        <CardDescription>
          Choose your search method: structured search with filters or artist-focused search with pagination
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs value={searchMode} onValueChange={(value) => {
          setSearchMode(value as 'structured' | 'artist');
          setError(null);
          setSearchResults(null);
          setSelectedArtist(null);
          setShowArtistEvents(false);
        }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="structured" className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              Structured Search
            </TabsTrigger>
            <TabsTrigger value="artist" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Artist Search
            </TabsTrigger>
          </TabsList>

          <TabsContent value="structured" className="mt-6 space-y-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Artist Input - Required */}
          <div className="space-y-2">
            <Label htmlFor="artist" className="flex items-center gap-2">
              Artist <span className="text-red-500">*</span>
            </Label>
            <Input
              id="artist"
              type="text"
              placeholder="Enter artist name (required)..."
              value={searchParams.artist}
              onChange={(e) => setSearchParams(prev => ({ ...prev, artist: e.target.value }))}
              required
              className="w-full"
            />
          </div>

          {/* Venue Input - Optional */}
          <div className="space-y-2">
            <Label htmlFor="venue" className="flex items-center gap-2">
              Venue <span className="text-gray-400 text-sm">(optional)</span>
            </Label>
            <div className="relative">
              <Input
                id="venue"
                type="text"
                placeholder="Enter venue name (optional)..."
                value={searchParams.venue}
                onChange={(e) => setSearchParams(prev => ({ ...prev, venue: e.target.value }))}
                className="w-full pr-8"
              />
              {searchParams.venue && (
                <button
                  type="button"
                  onClick={clearVenue}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Date Input - Optional */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Date <span className="text-gray-400 text-sm">(optional)</span>
            </Label>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "flex-1 justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP") : "Pick a date (optional)"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={handleDateSelect}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {selectedDate && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={clearDate}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Search Type Indicator */}
          {searchParams.artist && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-blue-700">
                <Music className="h-4 w-4" />
                <span className="font-medium">Search Type:</span>
                <Badge variant="outline" className="text-blue-700 border-blue-300">
                  {!searchParams.venue && !searchParams.date 
                    ? "Artist Recent + Upcoming (20 events)" 
                    : "Most Similar Events (20 events)"
                  }
                </Badge>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <Button 
            type="submit" 
            className="w-full" 
            disabled={isLoading || !isFormValid}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Search Concerts
              </>
            )}
          </Button>
        </form>

        {/* Search Results */}
        {searchResults && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Search Results</h3>
              <Badge variant="outline">
                {searchResults.totalFound} events found
              </Badge>
            </div>
            
            {searchResults.searchType === 'artist_recent_upcoming' && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <CheckCircle className="h-4 w-4" />
                  <span>Showing 10 recent + 10 upcoming concerts for <strong>{searchParams.artist}</strong></span>
                </div>
              </div>
            )}

            <div className="max-h-96 overflow-y-auto space-y-3 border rounded-lg p-4">
              {searchResults.events.map((event) => (
                <div
                  key={event.id}
                  className="p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{event.title || event.event_name}</h4>
                        <Badge 
                          variant={event.jambase_event_id ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {event.jambase_event_id ? 'JamBase' : 'Manual'}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">
                        {event.artist_name} at {event.venue_name}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {event.venue_city && event.venue_state 
                            ? `${event.venue_city}, ${event.venue_state}` 
                            : event.location || 'Location TBD'
                          }
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatEventDate(event.event_date)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {event.jambase_event_id ? (
                        <PlusCircle className="h-4 w-4 text-blue-500" />
                      ) : (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
          </TabsContent>

          <TabsContent value="artist" className="mt-6 space-y-6">
            {!selectedArtist ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="artist-search" className="flex items-center gap-2">
                    Search for an Artist <span className="text-red-500">*</span>
                  </Label>
                  <ArtistSearchBox
                    onArtistSelect={handleArtistSelect}
                    placeholder="Type artist name to search..."
                    className="w-full"
                  />
                </div>
                
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Users className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-blue-900 mb-1">Artist Search Mode</h4>
                      <p className="text-sm text-blue-700">
                        Search for an artist by name, then browse through all their past and upcoming events with pagination.
                        Perfect for exploring an artist's complete tour history and future shows.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <ArtistSelector
                  artist={selectedArtist}
                  onViewEvents={handleViewArtistEvents}
                  onRemove={handleRemoveArtist}
                />
                
                {showArtistEvents && (
                  <ArtistEventPagination
                    artist={selectedArtist}
                    userId={userId}
                    onEventSelect={handleEventSelect}
                  />
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
