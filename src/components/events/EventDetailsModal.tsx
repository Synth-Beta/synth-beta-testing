import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar, 
  MapPin, 
  Clock, 
  Ticket, 
  ExternalLink, 
  X,
  Star,
  Heart,
  MessageSquare,
  Users
} from 'lucide-react';
import { JamBaseEventCard } from './JamBaseEventCard';
import type { JamBaseEvent } from '@/services/jambaseEventsService';

interface EventDetailsModalProps {
  event: JamBaseEvent | null;
  currentUserId: string;
  isOpen: boolean;
  onClose: () => void;
  onInterestToggle?: (eventId: string, interested: boolean) => void;
  onReview?: (eventId: string) => void;
  isInterested?: boolean;
  hasReviewed?: boolean;
}

export function EventDetailsModal({
  event,
  currentUserId,
  isOpen,
  onClose,
  onInterestToggle,
  onReview,
  isInterested = false,
  hasReviewed = false
}: EventDetailsModalProps) {
  if (!event) return null;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle className="text-2xl font-bold leading-tight mb-2">
                {event.title}
              </DialogTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
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
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Event Status Badges */}
          <div className="flex flex-wrap gap-2">
            {isPastEvent && (
              <Badge variant="secondary" className="text-sm">
                Past Event
              </Badge>
            )}
            {isUpcomingEvent && (
              <Badge variant="default" className="text-sm">
                Upcoming
              </Badge>
            )}
            {event.ticket_available && (
              <Badge variant="outline" className="text-sm text-green-600 border-green-600">
                <Ticket className="w-3 h-3 mr-1" />
                Tickets Available
              </Badge>
            )}
          </div>

          {/* Venue Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Venue Details
            </h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="font-medium text-lg mb-1">{event.venue_name}</div>
              <div className="text-muted-foreground">
                {getVenueAddress()}
              </div>
              {event.venue_zip && (
                <div className="text-sm text-muted-foreground mt-1">
                  ZIP: {event.venue_zip}
                </div>
              )}
            </div>
          </div>

          {/* Event Description */}
          {event.description && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">About This Event</h3>
              <div className="text-sm leading-relaxed bg-gray-50 rounded-lg p-4">
                {event.description}
              </div>
            </div>
          )}

          {/* Genres */}
          {event.genres && event.genres.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Genres</h3>
              <div className="flex flex-wrap gap-2">
                {event.genres.map((genre, index) => (
                  <Badge key={index} variant="secondary" className="text-sm">
                    {genre}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Tour Information */}
          {event.tour_name && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Tour</h3>
              <div className="text-sm bg-gray-50 rounded-lg p-4">
                <span className="font-medium">{event.tour_name}</span>
              </div>
            </div>
          )}

          {/* Price Range */}
          {event.price_range && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Price Range</h3>
              <div className="text-sm bg-gray-50 rounded-lg p-4">
                <span className="font-medium">{event.price_range}</span>
              </div>
            </div>
          )}

          {/* Setlist Preview */}
          {event.setlist && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Setlist Preview</h3>
              <div className="text-sm bg-gray-50 rounded-lg p-4">
                {typeof event.setlist === 'string' 
                  ? event.setlist
                  : JSON.stringify(event.setlist)
                }
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center gap-3">
              {/* Interest Button for Upcoming Events */}
              {isUpcomingEvent && onInterestToggle && (
                <Button
                  variant={isInterested ? "default" : "outline"}
                  size="sm"
                  onClick={() => onInterestToggle(event.id, !isInterested)}
                  className={
                    isInterested 
                      ? "bg-red-500 hover:bg-red-600 text-white" 
                      : "hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                  }
                >
                  {isInterested ? (
                    <Heart className="w-4 h-4 mr-1 fill-current" />
                  ) : (
                    <Heart className="w-4 h-4 mr-1" />
                  )}
                  {isInterested ? 'Interested' : 'Mark as Interested'}
                </Button>
              )}

              {/* Review Button for Past Events */}
              {isPastEvent && onReview && (
                <Button
                  variant={hasReviewed ? "default" : "outline"}
                  size="sm"
                  onClick={() => onReview(event.id)}
                  className={
                    hasReviewed 
                      ? "bg-yellow-500 hover:bg-yellow-600 text-white" 
                      : "hover:bg-yellow-50 hover:text-yellow-600 hover:border-yellow-300"
                  }
                >
                  {hasReviewed ? (
                    <Star className="w-4 h-4 mr-1 fill-current" />
                  ) : (
                    <Star className="w-4 h-4 mr-1" />
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
                    href={event.ticket_urls[0]} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1"
                  >
                    <Ticket className="w-4 h-4" />
                    <span>Tickets</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
