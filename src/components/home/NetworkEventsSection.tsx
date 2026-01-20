import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Star, Calendar, Heart, Bookmark, Users } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { NetworkEvent } from '@/services/homeFeedService';
import { trackInteraction } from '@/services/interactionTrackingService';
import { getEventUuid, getEventMetadata } from '@/utils/entityUuidResolver';

interface NetworkEventsSectionProps {
  firstDegreeEvents: NetworkEvent[];
  secondDegreeEvents: NetworkEvent[];
  onEventClick?: (eventId: string) => void;
  onFriendClick?: (friendId: string) => void;
  className?: string;
}

export const NetworkEventsSection: React.FC<NetworkEventsSectionProps> = ({
  firstDegreeEvents,
  secondDegreeEvents,
  onEventClick,
  onFriendClick,
  className,
}) => {
  const getActionIcon = (actionType: NetworkEvent['action_type']) => {
    switch (actionType) {
      case 'reviewed':
        return <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />;
      case 'going':
        return <Calendar className="h-4 w-4 text-green-500" />;
      case 'interested':
        return <Heart className="h-4 w-4 text-pink-500" />;
      case 'saved':
        return <Bookmark className="h-4 w-4 text-blue-500" />;
    }
  };

  const getActionLabel = (actionType: NetworkEvent['action_type'], rating?: number) => {
    switch (actionType) {
      case 'reviewed':
        return rating ? `Rated ${rating}/5` : 'Reviewed';
      case 'going':
        return 'Going';
      case 'interested':
        return 'Interested';
      case 'saved':
        return 'Saved';
    }
  };

  const renderNetworkEvent = (event: NetworkEvent, isSecondDegree: boolean = false) => (
    <Card
      key={`${event.event_id}-${event.friend_id}-${event.action_type}`}
      className={cn(
        'cursor-pointer hover:shadow-md transition-shadow',
        isSecondDegree && 'opacity-75'
      )}
      onClick={() => {
        // Track network event click
        try {
          const eventUuid = getEventUuid(event as any);
          const metadata = getEventMetadata(event as any);
          trackInteraction.click(
            'event',
            event.event_id,
            { ...metadata, source: 'network_feed', friend_name: event.friend_name },
            eventUuid || undefined
          );
        } catch (error) {
          console.error('Error tracking network event click:', error);
        }
        onEventClick?.(event.event_id);
      }}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar
            className="h-10 w-10 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onFriendClick?.(event.friend_id);
            }}
          >
            <AvatarImage src={event.friend_avatar || undefined} />
            <AvatarFallback>{event.friend_name[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="font-medium text-sm cursor-pointer hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  onFriendClick?.(event.friend_id);
                }}
              >
                {event.friend_name}
              </span>
              {getActionIcon(event.action_type)}
              <span className="text-xs text-muted-foreground">
                {getActionLabel(event.action_type, event.rating)}
              </span>
              {isSecondDegree && (
                <Badge variant="outline" className="text-xs">
                  <Users className="h-3 w-3 mr-1" />
                  Friend of Friend
                </Badge>
              )}
            </div>
            <h4 className="font-semibold text-sm mb-1 truncate">{event.title}</h4>
            <p className="text-xs text-muted-foreground mb-1">
              {event.artist_name} · {event.venue_name}
            </p>
            {event.review_text && (
              <p className="text-xs text-gray-600 mt-2 line-clamp-2">{event.review_text}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              {format(new Date(event.event_date), 'MMM d, yyyy')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className={cn('space-y-6', className)}>
      {/* First-Degree Network */}
      {firstDegreeEvents.length > 0 && (
        <div>
          <h2 className="text-lg sm:text-xl font-bold mb-4">In Your Network</h2>
          <div className="space-y-3">
            {firstDegreeEvents.map((event) => renderNetworkEvent(event, false))}
          </div>
        </div>
      )}

      {/* Second-Degree Network */}
      {secondDegreeEvents.length > 0 && (
        <div>
          <h2 className="text-base sm:text-lg font-semibold mb-3 text-muted-foreground">
            Friends of Friends
          </h2>
          <div className="space-y-3">
            {secondDegreeEvents.map((event) => renderNetworkEvent(event, true))}
          </div>
        </div>
      )}

      {firstDegreeEvents.length === 0 && secondDegreeEvents.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No network activity yet. Connect with friends to see their events!</p>
        </div>
      )}
    </div>
  );
};

