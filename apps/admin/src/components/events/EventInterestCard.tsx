import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Heart, MapPin, Calendar, Clock } from 'lucide-react';
import { DBEvent } from '@/types/database';
import { Event } from '@/types/concertSearch';
import { safeParseEventDate, safeFormatEventDate } from '@/lib/dateUtils';

// Union type to handle both old and new event formats
type EventData = DBEvent | Event;

interface EventInterestCardProps {
  event: EventData;
  isInterested: boolean;
  onToggleInterest: (eventId: string) => void;
  onViewUsers: (eventId: string) => void;
  interestedCount: number;
}

export const EventInterestCard = ({ 
  event, 
  isInterested, 
  onToggleInterest, 
  onViewUsers,
  interestedCount 
}: EventInterestCardProps) => {
  // Helper functions to get event data regardless of format
  const getEventName = () => {
    return 'title' in event ? event.title : event.event_name;
  };
  
  const getEventLocation = () => {
    if ('venue_name' in event && event.venue_name) {
      const locationParts = [event.venue_city, event.venue_state].filter(Boolean);
      return locationParts.length > 0 ? `${event.venue_name}, ${locationParts.join(', ')}` : event.venue_name;
    }
    return event.location || 'Location TBD';
  };
  
  const getEventDate = () => {
    return 'event_date' in event ? event.event_date : event.event_date;
  };
  
  const getEventTime = () => {
    return 'event_time' in event ? event.event_time : undefined;
  };
  
  const eventDateTime = safeParseEventDate({
    event_date: getEventDate(),
    event_time: getEventTime()
  });
  
  return (
    <Card className="card-hover overflow-hidden">
      <div className="aspect-video bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
        <div className="text-center">
          <h3 className="text-xl font-bold text-primary">{getEventName()}</h3>
          <p className="text-muted-foreground">{getEventLocation()}</p>
        </div>
      </div>
      
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            {safeFormatEventDate({ event_date: getEventDate(), event_time: getEventTime() }, 'MMM d, yyyy')}
            <Clock className="w-4 h-4 ml-2" />
            {safeFormatEventDate({ event_date: getEventDate(), event_time: getEventTime() }, 'h:mm a')}
          </div>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-4 h-4" />
            {getEventLocation()}
          </div>
          
          <div className="flex items-center justify-between pt-2">
            <Badge variant="secondary">
              {interestedCount} interested
            </Badge>
            
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onViewUsers(event.id)}
                disabled={interestedCount === 0}
              >
                View People
              </Button>
              <Button
                size="sm"
                variant={isInterested ? "default" : "outline"}
                onClick={() => onToggleInterest(event.id)}
                className={isInterested ? "btn-swipe-like" : ""}
              >
                <Heart className={`w-4 h-4 mr-1 ${isInterested ? 'fill-current' : ''}`} />
                {isInterested ? 'Interested' : 'I\'m In!'}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};