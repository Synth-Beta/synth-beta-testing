import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Search, Loader2, Music, MapPin, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { concertSearchService } from '@/services/concertSearchService';
import { fuzzySearchService } from '@/services/fuzzySearchService';
import { JamBaseArtistSearchService } from '@/services/jambaseArtistSearchService';
import type { EventSearchParams, Event } from '@/types/concertSearch';

interface ConcertSearchFormProps {
  onEventFound: (event: Event, isNewEvent: boolean) => void;
  userId: string;
}

export function ConcertSearchForm({ onEventFound, userId }: ConcertSearchFormProps) {
  const [searchParams, setSearchParams] = useState<EventSearchParams>({
    artist: '',
    venue: '',
    date: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [artistSuggestions, setArtistSuggestions] = useState<any[]>([]);
  const [venueSuggestions, setVenueSuggestions] = useState<any[]>([]);
  const [eventSuggestions, setEventSuggestions] = useState<any[]>([]);
  const [showArtistSuggestions, setShowArtistSuggestions] = useState(false);
  const [showVenueSuggestions, setShowVenueSuggestions] = useState(false);
  const [showEventSuggestions, setShowEventSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Handle date selection
  const handleDateSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    if (selectedDate) {
      setSearchParams(prev => ({
        ...prev,
        date: format(selectedDate, 'yyyy-MM-dd')
      }));
    }
  };

  // Search for artists using JamBase API with fuzzy matching
  const searchArtists = async (query: string) => {
    if (query.length < 2) {
      setArtistSuggestions([]);
      setShowArtistSuggestions(false);
      return;
    }

    setIsSearching(true);
    try {
      // Use JamBase API to search and populate artist profiles
      const suggestions = await JamBaseArtistSearchService.getArtistSuggestions(query, 10);
      setArtistSuggestions(suggestions);
      setShowArtistSuggestions(suggestions.length > 0);
    } catch (error) {
      console.error('Error searching artists:', error);
      setArtistSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Fuzzy search for venues
  const searchVenues = async (query: string) => {
    if (query.length < 2) {
      setVenueSuggestions([]);
      setShowVenueSuggestions(false);
      return;
    }

    setIsSearching(true);
    try {
      const result = await fuzzySearchService.fuzzySearch(query, 'venue');
      setVenueSuggestions(result.suggestions);
      setShowVenueSuggestions(result.suggestions.length > 0);
    } catch (error) {
      console.error('Error searching venues:', error);
      setVenueSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Fuzzy search for events
  const searchEvents = async (query: string) => {
    if (query.length < 2) {
      setEventSuggestions([]);
      setShowEventSuggestions(false);
      return;
    }

    setIsSearching(true);
    try {
      const result = await fuzzySearchService.fuzzySearch(query, 'event');
      setEventSuggestions(result.suggestions);
      setShowEventSuggestions(result.suggestions.length > 0);
    } catch (error) {
      console.error('Error searching events:', error);
      setEventSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle suggestion selection
  const handleSuggestionSelect = (suggestion: any, type: 'artist' | 'venue' | 'event') => {
    if (type === 'artist') {
      setSearchParams(prev => ({ ...prev, artist: suggestion.title }));
      setShowArtistSuggestions(false);
      
      // Store additional artist data for potential use
      if (suggestion.id) {
        // You could store this in state or pass it along if needed
        console.log('Selected artist:', {
          id: suggestion.id,
          name: suggestion.title,
          genres: suggestion.genres,
          band_or_musician: suggestion.band_or_musician,
          upcoming_events: suggestion.num_upcoming_events
        });
      }
    } else if (type === 'venue') {
      setSearchParams(prev => ({ ...prev, venue: suggestion.title }));
      setShowVenueSuggestions(false);
    } else if (type === 'event') {
      // If it's a complete event, use it directly
      if (suggestion.data && suggestion.data.id) {
        onEventFound(suggestion.data, false);
        return;
      }
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // First try to find existing events with fuzzy search
      if (searchParams.artist || searchParams.venue) {
        const searchQuery = `${searchParams.artist} ${searchParams.venue}`.trim();
        const eventResult = await fuzzySearchService.fuzzySearch(searchQuery, 'event');
        
        if (eventResult.suggestions.length > 0) {
          // Use the first matching event
          const event = eventResult.suggestions[0].data;
          onEventFound(event, false);
          setIsLoading(false);
          return;
        }
      }

      // If no existing event found, try to create one
      const result = await concertSearchService.searchEvent(searchParams, userId);
      onEventFound(result.event, result.isNewEvent);
    } catch (error) {
      console.error('Search error:', error);
      setError(error instanceof Error ? error.message : 'An error occurred while searching');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Music className="h-5 w-5" />
          Search for Events
        </CardTitle>
        <CardDescription>
          Enter an artist, venue, and date to find events. We'll check our database first, then search JamBase if needed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Artist Input */}
          <div className="space-y-2">
            <Label htmlFor="artist">Artist *</Label>
            <div className="relative">
              <Input
                id="artist"
                type="text"
                placeholder="Enter artist name..."
                value={searchParams.artist}
                onChange={(e) => {
                  setSearchParams(prev => ({ ...prev, artist: e.target.value }));
                  searchArtists(e.target.value);
                }}
                onFocus={() => setShowArtistSuggestions(true)}
                onBlur={() => setTimeout(() => setShowArtistSuggestions(false), 200)}
                required
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}
              {showArtistSuggestions && artistSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {artistSuggestions.map((suggestion, index) => (
                    <button
                      key={suggestion.id || index}
                      type="button"
                      className="w-full px-4 py-3 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none flex items-center gap-3"
                      onClick={() => handleSuggestionSelect(suggestion, 'artist')}
                    >
                      {/* Artist Image */}
                      <div className="flex-shrink-0">
                        {suggestion.image_url ? (
                          <img
                            src={suggestion.image_url}
                            alt={suggestion.title}
                            className="w-10 h-10 rounded-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={`w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center ${suggestion.image_url ? 'hidden' : ''}`}>
                          <Music className="h-5 w-5 text-gray-400" />
                        </div>
                      </div>
                      
                      {/* Artist Info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">{suggestion.title}</div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          {suggestion.subtitle && (
                            <span className="truncate">{suggestion.subtitle}</span>
                          )}
                          {suggestion.band_or_musician && (
                            <span className="capitalize">• {suggestion.band_or_musician}</span>
                          )}
                          {suggestion.num_upcoming_events && suggestion.num_upcoming_events > 0 && (
                            <span>• {suggestion.num_upcoming_events} upcoming events</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Venue Input */}
          <div className="space-y-2">
            <Label htmlFor="venue">Venue *</Label>
            <div className="relative">
              <Input
                id="venue"
                type="text"
                placeholder="Enter venue name..."
                value={searchParams.venue}
                onChange={(e) => {
                  setSearchParams(prev => ({ ...prev, venue: e.target.value }));
                  searchVenues(e.target.value);
                }}
                onFocus={() => setShowVenueSuggestions(true)}
                onBlur={() => setTimeout(() => setShowVenueSuggestions(false), 200)}
                required
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}
              {showVenueSuggestions && venueSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {venueSuggestions.map((suggestion, index) => (
                    <button
                      key={suggestion.id || index}
                      type="button"
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none flex items-center gap-2"
                      onClick={() => handleSuggestionSelect(suggestion, 'venue')}
                    >
                      <MapPin className="h-4 w-4 text-gray-400" />
                      <div>
                        <div className="font-medium">{suggestion.title}</div>
                        {suggestion.subtitle && (
                          <div className="text-sm text-gray-500">{suggestion.subtitle}</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* General Event Search */}
          <div className="space-y-2">
            <Label htmlFor="eventSearch">Or search for existing events</Label>
            <div className="relative">
              <Input
                id="eventSearch"
                type="text"
                placeholder="Search for events by artist, venue, or event name..."
                onChange={(e) => {
                  searchEvents(e.target.value);
                }}
                onFocus={() => setShowEventSuggestions(true)}
                onBlur={() => setTimeout(() => setShowEventSuggestions(false), 200)}
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}
              {showEventSuggestions && eventSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {eventSuggestions.map((suggestion, index) => (
                    <button
                      key={suggestion.id || index}
                      type="button"
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none flex items-center gap-2"
                      onClick={() => handleSuggestionSelect(suggestion, 'event')}
                    >
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <div className="flex-1">
                        <div className="font-medium">{suggestion.title}</div>
                        {suggestion.subtitle && (
                          <div className="text-sm text-gray-500">{suggestion.subtitle}</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Date Input */}
          <div className="space-y-2">
            <Label>Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={handleDateSelect}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

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
            disabled={isLoading || !searchParams.artist || !searchParams.venue || !searchParams.date}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Search Events
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
