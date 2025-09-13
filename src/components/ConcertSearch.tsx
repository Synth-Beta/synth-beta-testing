import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UnifiedEventSearch } from './UnifiedEventSearch';
import { ConcertSearchResults } from './ConcertSearchResults';
import { concertSearchService } from '@/services/concertSearchService';
import { safeFormatEventDateTime } from '@/lib/dateUtils';
import type { Event } from '@/types/concertSearch';
import type { EventSelectionResult } from '@/services/hybridSearchService';
import { Music, Calendar, MapPin } from 'lucide-react';

interface ConcertSearchProps {
  userId: string;
}

export function ConcertSearch({ userId }: ConcertSearchProps) {
  const [searchResults, setSearchResults] = useState<{
    event: Event | null;
    isNewEvent: boolean;
    source: string;
  } | null>(null);
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

  const handleEventSelected = (result: EventSelectionResult) => {
    setSearchResults({
      event: result.event,
      isNewEvent: result.isNewEvent,
      source: result.source
    });
    
    // Reload user events to show the new one
    loadUserEvents();
  };

  const formatEventDate = (dateString: string, timeString?: string) => {
    return safeFormatEventDateTime({ event_date: dateString, event_time: timeString });
  };

  return (
    <div className="space-y-6">
      {/* Unified Search */}
      <UnifiedEventSearch onEventSelected={handleEventSelected} userId={userId} />

      {/* Search Results */}
      {searchResults && (
        <ConcertSearchResults 
          event={searchResults.event} 
          isNewEvent={searchResults.isNewEvent} 
          source={searchResults.source} 
        />
      )}

      {/* User's Events */}
      {userEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music className="h-5 w-5" />
              Your Events
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