import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, Search, Loader2, Music, MapPin, Clock, CheckCircle, PlusCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { hybridSearchService } from '@/services/hybridSearchService';
import type { SearchSuggestion, EventSelectionResult } from '@/services/hybridSearchService';
import type { Event } from '@/types/concertSearch';

interface UnifiedEventSearchProps {
  onEventSelected: (result: EventSelectionResult) => void;
  userId: string;
}

export function UnifiedEventSearch({ onEventSelected, userId }: UnifiedEventSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState<SearchSuggestion | null>(null);

  // Handle date selection
  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
  };

  // Search for events with debouncing
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const searchEvents = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const dateString = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined;
        const result = await hybridSearchService.searchEvents(searchQuery, dateString);
        
        if (result.error) {
          setError(result.error);
        } else {
          setSuggestions(result.suggestions);
          setShowSuggestions(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(searchEvents, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, selectedDate]);

  // Handle suggestion selection
  const handleSuggestionSelect = async (suggestion: SearchSuggestion) => {
    setSelectedSuggestion(suggestion);
    setShowSuggestions(false);
    setError(null);

    try {
      const result = await hybridSearchService.selectEvent(suggestion, userId);
      onEventSelected(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select event');
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

  // Get confidence badge color
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-100 text-green-800';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Music className="h-5 w-5" />
          Search Events
        </CardTitle>
        <CardDescription>
          Search for events by artist, venue, or event name. We'll find existing events in our community and discover new ones from JamBase.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Search Input */}
        <div className="space-y-2">
          <Label htmlFor="search">Search for events</Label>
          <div className="relative">
            <Input
              id="search"
              type="text"
              placeholder="Enter artist name, venue, or event name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setShowSuggestions(suggestions.length > 0)}
              className="pr-10"
            />
            {isLoading && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
          </div>
        </div>

        {/* Date Filter */}
        <div className="space-y-2">
          <Label>Filter by date (optional)</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
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
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        {/* Search Suggestions */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Search Results</Label>
            <div className="max-h-96 overflow-y-auto space-y-2 border rounded-lg p-2">
              {suggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => handleSuggestionSelect(suggestion)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{suggestion.title}</h4>
                        <Badge 
                          variant={suggestion.isExisting ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {suggestion.isExisting ? 'In Database' : 'JamBase'}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{suggestion.subtitle}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {suggestion.data.venue_name}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatEventDate(suggestion.data.event_date)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge 
                        className={cn("text-xs", getConfidenceColor(suggestion.confidence))}
                      >
                        {Math.round(suggestion.confidence * 100)}% match
                      </Badge>
                      {suggestion.isExisting ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <PlusCircle className="h-4 w-4 text-blue-500" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Selected Event Display */}
        {selectedSuggestion && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="font-medium text-green-800">
                {selectedSuggestion.isExisting ? 'Event Selected' : 'Event Added'}
              </span>
            </div>
            <p className="text-sm text-green-700">
              {selectedSuggestion.title} at {selectedSuggestion.data.venue_name}
            </p>
          </div>
        )}

        {/* No Results */}
        {showSuggestions && suggestions.length === 0 && !isLoading && searchQuery.length >= 2 && (
          <div className="text-center py-8">
            <Music className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No events found matching your search.</p>
            <p className="text-sm text-gray-500 mt-2">
              Try searching for popular artists like "Taylor Swift" or "Drake", or remove the date filter to see more results.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
