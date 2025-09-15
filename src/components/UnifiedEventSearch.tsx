import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Search, Loader2, Music, MapPin, Users } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ArtistSearch, ArtistSearchResult } from './ArtistSearch';
import { UnifiedArtistSearchService } from '@/services/unifiedArtistSearchService';

interface UnifiedEventSearchProps {
  onEventFound?: (artist: ArtistSearchResult, venue: string, date: string) => void;
  userId: string;
}

export function UnifiedEventSearch({ onEventFound, userId }: UnifiedEventSearchProps) {
  const [selectedArtist, setSelectedArtist] = useState<ArtistSearchResult | null>(null);
  const [venue, setVenue] = useState('');
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<ArtistSearchResult[]>([]);

  // Handle artist selection
  const handleArtistSelect = (artist: ArtistSearchResult) => {
    setSelectedArtist(artist);
    setError(null);
    
    // Add to search history
    setSearchHistory(prev => {
      const filtered = prev.filter(a => a.id !== artist.id);
      return [artist, ...filtered].slice(0, 5); // Keep last 5 searches
    });
  };

  // Handle date selection
  const handleDateSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedArtist || !venue || !date) {
      setError('Please select an artist, enter a venue, and choose a date');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Simulate event creation/search
      console.log('🎵 Creating event:', {
        artist: selectedArtist.name,
        venue,
        date: format(date, 'yyyy-MM-dd'),
        userId
      });

      // Call the callback if provided
      if (onEventFound) {
        onEventFound(selectedArtist, venue, format(date, 'yyyy-MM-dd'));
      }

      // Show success message
      console.log('✅ Event created successfully');
      
    } catch (err) {
      console.error('❌ Error creating event:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while creating the event');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle clear form
  const handleClearForm = () => {
    setSelectedArtist(null);
    setVenue('');
    setDate(undefined);
    setError(null);
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Main Search Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            Find Events
          </CardTitle>
          <CardDescription>
            Search for artists, and we'll find their events. All artist data is automatically saved to our database.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Artist Search */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Artist *</label>
              <ArtistSearch
                onArtistSelect={handleArtistSelect}
                placeholder="Search for an artist..."
                maxResults={10}
              />
              {selectedArtist && (
                <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
                  <div className="flex items-center gap-2 text-sm text-green-800">
                    <Music className="h-4 w-4" />
                    <span>Selected: <strong>{selectedArtist.name}</strong></span>
                    {selectedArtist.band_or_musician && (
                      <span className="capitalize">({selectedArtist.band_or_musician})</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Venue Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Venue *</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Enter venue name..."
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
            </div>

            {/* Date Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Date *</label>
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

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button 
                type="submit" 
                className="flex-1" 
                disabled={isLoading || !selectedArtist || !venue || !date}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Event...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Find Events
                  </>
                )}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleClearForm}
                disabled={isLoading}
              >
                Clear
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Search History */}
      {searchHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Recent Searches
            </CardTitle>
            <CardDescription>
              Your recently searched artists
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {searchHistory.map((artist) => (
                <Button
                  key={artist.id}
                  variant="outline"
                  size="sm"
                  onClick={() => handleArtistSelect(artist)}
                  className="flex items-center gap-2"
                >
                  {artist.image_url ? (
                    <img
                      src={artist.image_url}
                      alt={artist.name}
                      className="w-4 h-4 rounded-full object-cover"
                    />
                  ) : (
                    <Music className="h-4 w-4" />
                  )}
                  {artist.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Debug Info */}
      {import.meta.env.DEV && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Debug Info</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs space-y-1">
              <div>Selected Artist: {selectedArtist ? selectedArtist.name : 'None'}</div>
              <div>Venue: {venue || 'None'}</div>
              <div>Date: {date ? format(date, 'yyyy-MM-dd') : 'None'}</div>
              <div>User ID: {userId}</div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}