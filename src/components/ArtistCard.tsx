import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Music, 
  Calendar, 
  MapPin, 
  Clock,
  ExternalLink,
  Star,
  Ticket
} from 'lucide-react';
import type { Artist } from '@/types/concertSearch';
import type { JamBaseEvent } from '@/types/eventTypes';
import { cn } from '@/lib/utils';
import { ArtistFollowButton } from '@/components/artists/ArtistFollowButton';
import { supabase } from '@/integrations/supabase/client';
import { VerifiedChatBadge } from '@/components/chats/VerifiedChatBadge';
import { SwiftUIEventCard } from '@/components/events/SwiftUIEventCard';

interface ArtistCardProps {
  artist: Artist;
  events: JamBaseEvent[];
  totalEvents: number;
  source: 'database' | 'api';
  userId?: string;
  onBack?: () => void;
  onViewAllEvents?: () => void;
  showAllEvents?: boolean;
  className?: string;
}

export function ArtistCard({ 
  artist, 
  events, 
  totalEvents, 
  source,
  userId,
  onBack, 
  onViewAllEvents,
  showAllEvents = false,
  className 
}: ArtistCardProps) {
  const [currentUserId, setCurrentUserId] = React.useState<string | undefined>(userId);

  // Get current user if not provided
  React.useEffect(() => {
    if (!userId) {
      supabase.auth.getUser().then(({ data }) => {
        setCurrentUserId(data.user?.id);
      });
    }
  }, [userId]);
  const upcomingEvents = events.filter(event => 
    new Date(event.event_date) > new Date()
  );
  
  // Show all events or limit to 10 based on showAllEvents prop
  const displayedUpcomingEvents = showAllEvents ? upcomingEvents : upcomingEvents.slice(0, 10);

  const formatGenres = (genres: string[] = []) => {
    if (genres.length === 0) return null;
    return genres.slice(0, 4).join(', ');
  };

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

  const getLocationString = (event: JamBaseEvent) => {
    const parts = [event.venue_city, event.venue_state].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Location TBD';
  };

  return (
    <div className={cn("w-full max-w-4xl mx-auto space-y-6 overflow-x-hidden", className)}>
      {/* Back Button */}
      {onBack && (
        <Button
          variant="ghost"
          onClick={onBack}
          className="mb-4"
        >
          ← Back to Search
        </Button>
      )}

      {/* Artist Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-4">
            <Avatar className="w-20 h-20">
              <AvatarImage src={artist.image_url || undefined} />
              <AvatarFallback className="text-2xl">
                <Music className="w-10 h-10" />
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4 mb-2">
                <CardTitle className="text-3xl">{artist.name}</CardTitle>
                <div className="flex items-center gap-2">
                {currentUserId && (
                    <>
                      <VerifiedChatBadge
                        entityType="artist"
                        entityId={artist.id || artist.jambase_artist_id}
                        entityName={artist.name}
                        currentUserId={currentUserId}
                        onChatOpen={(chatId) => {
                          window.location.href = `/chats?chatId=${chatId}`;
                        }}
                        variant="compact"
                      />
                  <ArtistFollowButton
                    artistName={artist.name}
                    jambaseArtistId={artist.jambase_artist_id}
                    userId={currentUserId}
                    variant="outline"
                    size="default"
                    showFollowerCount={true}
                  />
                    </>
                )}
                </div>
              </div>
              
              <div className="flex items-center gap-2 mb-3">
                {artist.jambase_artist_id && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" />
                    JamBase Verified
                  </Badge>
                )}
                <Badge variant="secondary">
                  {source === 'api' ? 'Live Data' : 'Cached Data'}
                </Badge>
              </div>
              
              {artist.description && (
                <p className="text-muted-foreground leading-relaxed mb-4">
                  {artist.description}
                </p>
              )}
              
              {artist.genres && artist.genres.length > 0 && (
                <div className="mb-4">
                  <div className="text-sm font-medium text-muted-foreground mb-2">Genres</div>
                  <div className="flex flex-wrap gap-1">
                    {artist.genres.map((genre, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {genre}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex items-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>{totalEvents} total events</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{upcomingEvents.length} upcoming</span>
                </div>
                {artist.popularity_score && (
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-400 fill-current" />
                    <span>Score: {artist.popularity_score}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Events Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Events</h2>
          {onViewAllEvents && totalEvents > events.length && (
            <Button variant="outline" onClick={onViewAllEvents}>
              View All {totalEvents} Events
            </Button>
          )}
        </div>

        {/* Upcoming Events Grid */}
        {upcomingEvents.length > 0 && (
          <div className="w-full overflow-x-hidden">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Upcoming Events ({upcomingEvents.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
                    {displayedUpcomingEvents.map((event) => (
                <SwiftUIEventCard
                  key={event.jambase_event_id || event.id}
                  event={{
                    id: event.id || event.jambase_event_id || '',
                    title: event.title || 'Event',
                    event_date: event.event_date,
                    venue_name: event.venue_name,
                    venue_city: event.venue_city,
                    venue_state: event.venue_state,
                    doors_time: event.doors_time,
                    price_range: event.price_range,
                    ticket_urls: event.ticket_urls,
                    ticket_available: event.ticket_available,
                    genres: event.genres,
                  }}
                />
                    ))}
              </div>
              {!showAllEvents && upcomingEvents.length > 10 && (
              <div className="mt-2">
                  <Button variant="outline" onClick={onViewAllEvents} className="w-full">
                    Show {upcomingEvents.length - 10} More Upcoming Events
                  </Button>
                </div>
              )}
              {showAllEvents && upcomingEvents.length > 10 && (
              <div className="mt-2">
                  <Button variant="outline" onClick={() => onViewAllEvents?.()} className="w-full">
                    Show Less (Back to 10 events)
                  </Button>
                </div>
              )}
          </div>
        )}


        {/* No Events */}
        {events.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <Music className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Events Found</h3>
              <p className="text-muted-foreground">
                No events found for {artist.name}. This could mean:
              </p>
              <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                <li>• The artist has no upcoming or recent events</li>
                <li>• The artist name might be spelled differently</li>
                <li>• The events might not be in our database yet</li>
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
