import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar, 
  MapPin, 
  Clock, 
  Ticket, 
  ExternalLink, 
  Heart, 
  HeartOff,
  Star,
  StarOff,
  MessageSquare,
  Users
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { JamBaseEvent } from '@/services/jambaseEventsService';
import { EventMap } from '@/components/EventMap';

interface JamBaseEventCardProps {
  event: JamBaseEvent;
  onInterestToggle?: (eventId: string, interested: boolean) => void;
  onReview?: (eventId: string) => void;
  isInterested?: boolean;
  hasReviewed?: boolean;
  showInterestButton?: boolean;
  showReviewButton?: boolean;
  className?: string;
}

export function JamBaseEventCard({
  event,
  onInterestToggle,
  onReview,
  isInterested = false,
  hasReviewed = false,
  showInterestButton = true,
  showReviewButton = true,
  className
}: JamBaseEventCardProps) {
  const [isLoading, setIsLoading] = useState(false);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDoorsTime = (doorsTime: string | null) => {
    if (!doorsTime) return null;
    const date = new Date(doorsTime);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const isPastEvent = new Date(event.event_date) < new Date();
  const isUpcomingEvent = new Date(event.event_date) >= new Date();

  const handleInterestToggle = async () => {
    if (!onInterestToggle || isLoading) return;
    
    setIsLoading(true);
    try {
      await onInterestToggle(event.id, !isInterested);
    } catch (error) {
      console.error('Error toggling interest:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReview = () => {
    if (onReview) {
      onReview(event.id);
    }
  };

  const getLocationString = () => {
    const parts = [event.venue_city, event.venue_state].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Location TBD';
  };

  const getVenueAddress = () => {
    if (event.venue_address) {
      return event.venue_address;
    }
    return getLocationString();
  };

  const getCheapestTicketUrl = () => {
    if (!event.ticket_urls || event.ticket_urls.length === 0) return null;
    // Heuristic: prefer URLs containing known cheap vendors first
    const preferredOrder = ['stubhub', 'vividseats', 'seatgeek', 'ticketmaster', 'axs'];
    const lower = event.ticket_urls.map(u => ({ url: u, l: u.toLowerCase() }));
    for (const vendor of preferredOrder) {
      const found = lower.find(u => u.l.includes(vendor));
      if (found) return found.url;
    }
    return event.ticket_urls[0];
  };

  return (
    <Card className={cn("w-full transition-all duration-200 hover:shadow-lg", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg leading-tight mb-2">
              {event.title}
            </CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Calendar className="w-4 h-4" />
              <span>{formatDate(event.event_date)}</span>
              <span>•</span>
              <Clock className="w-4 h-4" />
              <span>{formatTime(event.event_date)}</span>
              {event.doors_time && (
                <>
                  <span>•</span>
                  <span>Doors: {formatDoorsTime(event.doors_time)}</span>
                </>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isPastEvent && (
              <Badge variant="secondary" className="text-xs">
                Past Event
              </Badge>
            )}
            {isUpcomingEvent && (
              <Badge variant="default" className="text-xs">
                Upcoming
              </Badge>
            )}
            {event.ticket_available && (
              <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                <Ticket className="w-3 h-3 mr-1" />
                Tickets Available
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 space-y-4">
        {/* Venue Information */}
        <div className="flex items-start gap-3">
          <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{event.venue_name}</div>
            <div className="text-sm text-muted-foreground">
              {getVenueAddress()}
            </div>
          </div>
        </div>

        {/* Mini Map Preview */}
        {event.latitude && event.longitude && (
          <div className="h-40 rounded-md overflow-hidden border border-gray-100">
            <EventMap
              center={[event.latitude as number, event.longitude as number]}
              zoom={12}
              // Cast to response shape for the map component
              events={[event as any]}
              onEventClick={() => { /* no-op in card */ }}
            />
          </div>
        )}

        {/* Description */}
        {event.description && (
          <div className="text-sm text-muted-foreground leading-relaxed">
            {event.description.length > 200 
              ? `${event.description.substring(0, 200)}...` 
              : event.description
            }
          </div>
        )}

        {/* Genres */}
        {event.genres && event.genres.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {event.genres.slice(0, 4).map((genre, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {genre}
              </Badge>
            ))}
            {event.genres.length > 4 && (
              <Badge variant="secondary" className="text-xs">
                +{event.genres.length - 4} more
              </Badge>
            )}
          </div>
        )}

        {/* Tour Name */}
        {event.tour_name && (
          <div className="text-sm">
            <span className="text-muted-foreground">Tour: </span>
            <span className="font-medium">{event.tour_name}</span>
          </div>
        )}

        {/* Price Range */}
        {event.price_range && (
          <div className="text-sm">
            <span className="text-muted-foreground">Price: </span>
            <span className="font-medium">{event.price_range}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            {/* Interest Button for Upcoming Events */}
            {isUpcomingEvent && showInterestButton && onInterestToggle && (
              <Button
                variant={isInterested ? "default" : "outline"}
                size="sm"
                onClick={handleInterestToggle}
                disabled={isLoading}
                className={cn(
                  "transition-colors",
                  isInterested 
                    ? "bg-red-500 hover:bg-red-600 text-white" 
                    : "hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                )}
              >
                {isInterested ? (
                  <Heart className="w-4 h-4 mr-1 fill-current" />
                ) : (
                  <HeartOff className="w-4 h-4 mr-1" />
                )}
                {isInterested ? 'Interested' : 'Interested?'}
              </Button>
            )}

            {/* Review Button for Past Events */}
            {isPastEvent && showReviewButton && onReview && (
              <Button
                variant={hasReviewed ? "default" : "outline"}
                size="sm"
                onClick={handleReview}
                className={cn(
                  "transition-colors",
                  hasReviewed 
                    ? "bg-yellow-500 hover:bg-yellow-600 text-white" 
                    : "hover:bg-yellow-50 hover:text-yellow-600 hover:border-yellow-300"
                )}
              >
                {hasReviewed ? (
                  <Star className="w-4 h-4 mr-1 fill-current" />
                ) : (
                  <StarOff className="w-4 h-4 mr-1" />
                )}
                {hasReviewed ? 'Reviewed' : 'I Was There'}
              </Button>
            )}
          </div>

          {/* External Links */}
          <div className="flex items-center gap-2">
            {event.ticket_urls && event.ticket_urls.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="text-blue-600 hover:text-blue-700"
              >
                <a 
                  href={getCheapestTicketUrl() || event.ticket_urls[0]} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1"
                >
                  <Ticket className="w-4 h-4" />
                  <span className="hidden sm:inline">Cheapest Tickets</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* Setlist Preview */}
        {event.setlist && (
          <div className="pt-2 border-t border-gray-100">
            <div className="text-xs text-muted-foreground mb-1">Setlist Preview:</div>
            <div className="text-sm">
              {typeof event.setlist === 'string' 
                ? event.setlist.substring(0, 100) + '...'
                : JSON.stringify(event.setlist).substring(0, 100) + '...'
              }
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
