import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StructuredConcertSearch } from './StructuredConcertSearch';
import { ConcertSearchResults } from './ConcertSearchResults';
import { concertSearchService } from '@/services/concertSearchService';
import { safeFormatEventDateTime } from '@/lib/dateUtils';
import type { Event } from '@/types/concertSearch';
import { Music, Calendar, MapPin } from 'lucide-react';

interface ConcertSearchProps {
  userId: string;
}

interface SearchResult {
  events: Event[];
  totalFound: number;
  searchType: 'similar' | 'artist_recent_upcoming';
}

export function ConcertSearch({ userId }: ConcertSearchProps) {
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [userEvents, setUserEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load user's events on component mount
  useEffect(() => {
    loadUserEvents();
  }, [userId]);

  const loadUserEvents = async () => {
    try {
      setIsLoading(true);
      const result = await concertSearchService.getUserEvents(userId);
      setUserEvents(result.events);
    } catch (error) {
      console.error('Error loading user events:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEventsFound = (result: SearchResult) => {
    setSearchResults(result);
    
    // Reload user events to show any new ones
    loadUserEvents();
  };

  const formatEventDate = (dateString: string, timeString?: string) => {
    return safeFormatEventDateTime({ event_date: dateString, event_time: timeString });
  };

  return (
    <div className="space-y-6">
      {/* Structured Search */}
      <StructuredConcertSearch onEventsFound={handleEventsFound} userId={userId} />

      {/* Search Results Summary */}
      {searchResults && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music className="h-5 w-5" />
              Search Results Summary
            </CardTitle>
            <CardDescription>
              Found {searchResults.totalFound} events using {searchResults.searchType === 'artist_recent_upcoming' ? 'artist recent + upcoming' : 'similar events'} search
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchResults.events.slice(0, 6).map((event) => (
                <div key={event.id} className="p-3 border rounded-lg">
                  <h4 className="font-medium text-sm mb-1">{event.title || event.event_name}</h4>
                  <p className="text-xs text-gray-600 mb-2">
                    {event.artist_name} at {event.venue_name}
                  </p>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                      {formatEventDate(event.event_date, event.event_time || undefined)}
                    </p>
                    <Badge variant="outline" className="text-xs">
                      {event.jambase_event_id ? 'JamBase' : 'Manual'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
            {searchResults.events.length > 6 && (
              <p className="text-sm text-gray-500 mt-3 text-center">
                Showing 6 of {searchResults.events.length} events. See full results above.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* User's Events */}
      {userEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music className="h-5 w-5" />
              Your Saved Events
            </CardTitle>
            <CardDescription>
              Events you've searched for and added to your profile
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {userEvents.map((event) => (
                <div key={event.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <h4 className="font-medium">{event.title || event.event_name}</h4>
                    <p className="text-sm text-gray-600">
                      {event.artist_name} at {event.venue_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatEventDate(event.event_date, event.event_time || undefined)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {event.jambase_event_id ? 'JamBase' : 'Manual'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}