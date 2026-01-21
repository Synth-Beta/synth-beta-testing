import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Music, Ticket, ExternalLink, Clock } from 'lucide-react';
import { safeFormatEventDateTime } from '@/lib/dateUtils';
import type { Event } from '@/types/concertSearch';
import { formatPrice } from '@/utils/currencyUtils';
import { getCompliantEventLink } from '@/utils/jambaseLinkUtils';

interface ConcertSearchResultsProps {
  event: Event | null;
  isNewEvent: boolean;
  source: string;
}

export function ConcertSearchResults({ event, isNewEvent, source }: ConcertSearchResultsProps) {
  const formatEventDate = (dateString: string, timeString?: string) => {
    return safeFormatEventDateTime({ event_date: dateString, event_time: timeString });
  };

  if (!event) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            Search Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Music className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No events found matching your search criteria.</p>
            <p className="text-sm text-gray-500 mt-2">
              Try adjusting your search terms or searching for a different date.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Music className="h-5 w-5" />
          Search Results
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-xl font-semibold">{event.title || event.event_name}</h3>
              <p className="text-gray-600">{event.artist_name}</p>
            </div>
            <div className="flex gap-2">
              <Badge variant={isNewEvent ? "default" : "secondary"}>
                {isNewEvent ? "Added to Database" : "Found in Database"}
              </Badge>
              <Badge variant="outline">
                {source === 'jambase' ? 'JamBase' : 'Database'}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-500" />
              <div>
                <p className="font-medium">{event.venue_name}</p>
                {event.venue_city && event.venue_state && (
                  <p className="text-sm text-gray-500">
                    {event.venue_city}, {event.venue_state}
                  </p>
                )}
                {event.venue_address && (
                  <p className="text-xs text-gray-400">{event.venue_address}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <div>
                <p className="font-medium">Event Date</p>
                <p className="text-sm text-gray-500">
                  {formatEventDate(event.event_date, event.event_time || undefined)}
                </p>
              </div>
            </div>
          </div>

          {event.doors_time && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-500" />
              <div>
                <p className="font-medium">Doors Open</p>
                <p className="text-sm text-gray-500">
                  {new Date(event.doors_time).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            </div>
          )}

          {event.description && (
            <div>
              <p className="text-sm text-gray-600">{event.description}</p>
            </div>
          )}

          {(() => {
            const eventLink = getCompliantEventLink(event);
            if (!eventLink) return null;
            return (
              <Button size="sm" variant="outline" asChild>
                <a 
                  href={eventLink} 
                  target="_blank" 
                  rel="nofollow noopener noreferrer"
                  className="flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  Buy Tickets
                </a>
              </Button>
            );
          })()}
            </div>
          )}

          {event.price_range && (
            <div>
              <p className="text-sm">
                <span className="font-medium">Price Range:</span> {formatPrice(event.price_range)}
              </p>
            </div>
          )}

          {event.tour_name && (
            <div>
              <p className="text-sm">
                <span className="font-medium">Tour:</span> {event.tour_name}
              </p>
            </div>
          )}

          {event.genres && event.genres.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Genres:</p>
              <div className="flex flex-wrap gap-1">
                {event.genres.map((genre, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {genre}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {event.setlist && Array.isArray(event.setlist) && event.setlist.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Setlist:</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
                {event.setlist.slice(0, 6).map((song, index) => (
                  <div key={index} className="text-xs bg-gray-100 px-2 py-1 rounded">
                    {song}
                  </div>
                ))}
                {event.setlist.length > 6 && (
                  <div className="text-xs text-gray-500 px-2 py-1">
                    +{event.setlist.length - 6} more
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
