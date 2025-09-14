import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Calendar, 
  MapPin, 
  Clock, 
  Ticket, 
  ChevronLeft, 
  ChevronRight, 
  Loader2,
  Music,
  PlusCircle,
  CheckCircle
} from 'lucide-react';
import { JamBaseService } from '@/services/jambaseService';
import type { Artist, PaginatedEvents, Event } from '@/types/concertSearch';
import { safeFormatEventDateTime } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';

interface ArtistEventPaginationProps {
  artist: Artist;
  userId: string;
  onEventSelect?: (event: Event) => void;
  className?: string;
}

export function ArtistEventPagination({ 
  artist, 
  userId, 
  onEventSelect,
  className 
}: ArtistEventPaginationProps) {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [events, setEvents] = useState<PaginatedEvents | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [interestedEvents, setInterestedEvents] = useState<Set<string>>(new Set());

  const eventsPerPage = 10;

  // Load events when artist or tab changes
  useEffect(() => {
    loadEvents();
  }, [artist.id, activeTab, currentPage]);

  // Load user's interested events
  useEffect(() => {
    loadUserInterestedEvents();
  }, [userId]);

  const loadEvents = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const searchParams = {
        artistId: artist.id,
        page: currentPage,
        limit: eventsPerPage,
        eventType: activeTab as 'upcoming' | 'past'
      };

      const result = await JamBaseService.getArtistEvents(searchParams);
      setEvents(result);
    } catch (err) {
      console.error('Error loading events:', err);
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserInterestedEvents = async () => {
    try {
      // This would need to be implemented in the service
      // For now, we'll use a placeholder
      setInterestedEvents(new Set());
    } catch (error) {
      console.error('Error loading interested events:', error);
    }
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handleEventInterest = async (event: Event) => {
    try {
      // Toggle event interest
      const isInterested = interestedEvents.has(event.id);
      
      if (isInterested) {
        // Remove from interests
        setInterestedEvents(prev => {
          const newSet = new Set(prev);
          newSet.delete(event.id);
          return newSet;
        });
      } else {
        // Add to interests
        setInterestedEvents(prev => new Set(prev).add(event.id));
      }

      // Call parent callback if provided
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

  const renderEventCard = (event: Event) => {
    const isInterested = interestedEvents.has(event.id);
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
              {event.ticket_available && (
                <div className="flex items-center gap-1">
                  <Ticket className="h-3 w-3" />
                  <span>Tickets Available</span>
                </div>
              )}
            </div>
            
            {event.price_range && (
              <p className="text-xs text-gray-500 mt-1">
                {event.price_range}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-2 ml-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleEventInterest(event)}
              className={cn(
                "h-8 w-8 p-0",
                isInterested 
                  ? "text-green-600 hover:text-green-700" 
                  : "text-gray-400 hover:text-green-600"
              )}
            >
              {isInterested ? (
                <CheckCircle className="w-4 h-4 fill-current" />
              ) : (
                <PlusCircle className="w-4 h-4" />
              )}
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
    <div className={cn("w-full", className)}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            {artist.name} Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value) => {
            setActiveTab(value as 'upcoming' | 'past');
            setCurrentPage(1);
          }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="past">Past</TabsTrigger>
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
                  <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <h3 className="font-semibold text-gray-900 mb-1">No Upcoming Events</h3>
                  <p className="text-sm text-gray-600">
                    No upcoming concerts found for {artist.name}
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
                  <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <h3 className="font-semibold text-gray-900 mb-1">No Past Events</h3>
                  <p className="text-sm text-gray-600">
                    No past concerts found for {artist.name}
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
