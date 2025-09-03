import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Heart, MapPin, Calendar, Clock } from 'lucide-react';
import { DBEvent } from '@/types/database';
import { format, parseISO } from 'date-fns';

interface EventInterestCardProps {
  event: DBEvent;
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
  const eventDate = parseISO(event.datetime);
  
  return (
    <Card className="card-hover overflow-hidden">
      <div className="aspect-video bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
        <div className="text-center">
          <h3 className="text-xl font-bold text-primary">{event.title}</h3>
          <p className="text-muted-foreground">{event.venue}</p>
        </div>
      </div>
      
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            {format(eventDate, 'MMM d, yyyy')}
            <Clock className="w-4 h-4 ml-2" />
            {format(eventDate, 'h:mm a')}
          </div>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-4 h-4" />
            {event.venue}
          </div>
          
          {event.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {event.description}
            </p>
          )}
          
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