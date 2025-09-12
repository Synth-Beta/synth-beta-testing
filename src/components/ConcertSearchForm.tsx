import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Search, Loader2, Music, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { concertSearchService } from '@/services/concertSearchService';
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
  const [showArtistSuggestions, setShowArtistSuggestions] = useState(false);
  const [showVenueSuggestions, setShowVenueSuggestions] = useState(false);

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

  // Search for artist suggestions
  const searchArtists = async (query: string) => {
    if (query.length < 2) {
      setArtistSuggestions([]);
      return;
    }

    try {
      const artists = await concertSearchService.searchJamBaseArtists(query);
      setArtistSuggestions(artists);
      setShowArtistSuggestions(true);
    } catch (error) {
      console.error('Error searching artists:', error);
    }
  };

  // Search for venue suggestions
  const searchVenues = async (query: string) => {
    if (query.length < 2) {
      setVenueSuggestions([]);
      return;
    }

    try {
      const venues = await concertSearchService.searchJamBaseVenues(query);
      setVenueSuggestions(venues);
      setShowVenueSuggestions(true);
    } catch (error) {
      console.error('Error searching venues:', error);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await concertSearchService.searchEvent(searchParams, userId);
      onEventFound(result.event, result.isNewEvent);
    } catch (error) {
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
              {showArtistSuggestions && artistSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {artistSuggestions.map((artist, index) => (
                    <button
                      key={index}
                      type="button"
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                      onClick={() => {
                        setSearchParams(prev => ({ ...prev, artist: artist.name }));
                        setShowArtistSuggestions(false);
                      }}
                    >
                      {artist.name}
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
              {showVenueSuggestions && venueSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {venueSuggestions.map((venue, index) => (
                    <button
                      key={index}
                      type="button"
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                      onClick={() => {
                        setSearchParams(prev => ({ ...prev, venue: venue.name }));
                        setShowVenueSuggestions(false);
                      }}
                    >
                      <div>
                        <div className="font-medium">{venue.name}</div>
                        {venue.city && venue.state && (
                          <div className="text-sm text-gray-500">{venue.city}, {venue.state}</div>
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
