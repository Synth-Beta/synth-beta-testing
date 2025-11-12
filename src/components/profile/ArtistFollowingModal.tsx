import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Music, Calendar, MapPin, ExternalLink, Loader2 } from 'lucide-react';
import { ArtistFollowService } from '@/services/artistFollowService';
import { JamBaseService } from '@/services/jambaseService';
import type { ArtistFollowWithDetails } from '@/types/artistFollow';
import type { JamBaseEvent } from '@/services/jambaseEventsService';
import { format } from 'date-fns';

interface ArtistFollowingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  profileName: string;
  isOwnProfile?: boolean;
}

interface ArtistWithEvents extends ArtistFollowWithDetails {
  upcomingEvents: JamBaseEvent[];
}

export function ArtistFollowingModal({
  open,
  onOpenChange,
  userId,
  profileName,
  isOwnProfile = false
}: ArtistFollowingModalProps) {
  const [followedArtists, setFollowedArtists] = useState<ArtistWithEvents[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && userId) {
      loadFollowedArtists();
    }
  }, [open, userId]);

  const loadFollowedArtists = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get followed artists
      const artists = await ArtistFollowService.getUserFollowedArtists(userId);
      
      // Get upcoming events for each artist
      const artistsWithEvents = await Promise.all(
        artists.map(async (artist) => {
          try {
            // Try to get events by artist name first
            const events = await JamBaseService.searchEvents({
              artist: artist.artist_name,
              limit: 5 // Limit to 5 upcoming events per artist
            });

            // Filter to only upcoming events
            const now = new Date();
            const upcomingEvents = events.filter(event => 
              new Date(event.dateTime) > now
            ).slice(0, 3); // Show max 3 upcoming events per artist

            return {
              ...artist,
              upcomingEvents
            };
          } catch (error) {
            console.warn(`Error loading events for artist ${artist.artist_name}:`, error);
            return {
              ...artist,
              upcomingEvents: []
            };
          }
        })
      );

      setFollowedArtists(artistsWithEvents);
    } catch (error) {
      console.error('Error loading followed artists:', error);
      setError('Failed to load followed artists');
    } finally {
      setLoading(false);
    }
  };

  const handleEventClick = (event: JamBaseEvent) => {
    // Open event in new tab
    if (event.ticketing?.urls?.[0]) {
      window.open(event.ticketing.urls[0], '_blank');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="w-5 h-5 text-pink-500" />
            {isOwnProfile ? 'Artists You Follow' : `${profileName}'s Followed Artists`}
            <Badge variant="secondary" className="ml-2">
              {followedArtists.length}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-pink-500" />
            <span className="ml-2">Loading followed artists...</span>
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-500">
            {error}
          </div>
        ) : followedArtists.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Music className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">
              {isOwnProfile ? "You're not following any artists yet" : `${profileName} isn't following any artists yet`}
            </p>
            <p className="text-sm mt-2">
              {isOwnProfile ? "Start following artists to see their upcoming events here!" : "Check back later to see their followed artists."}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {followedArtists.map((artist) => (
              <Card key={artist.artist_id} className="overflow-hidden">
                <CardContent className="p-0">
                  {/* Artist Header */}
                  <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-pink-50 to-purple-50 border-b">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={artist.artist_image_url} />
                      <AvatarFallback className="bg-pink-100 text-pink-600">
                        <Music className="w-6 h-6" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{artist.artist_name}</h3>
                      <p className="text-sm text-muted-foreground">
                        Following since {format(new Date(artist.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                    {artist.jambase_artist_id && (
                      <Badge variant="outline" className="text-xs">
                        JamBase ID: {artist.jambase_artist_id}
                      </Badge>
                    )}
                  </div>

                  {/* Upcoming Events */}
                  {artist.upcomingEvents.length > 0 ? (
                    <div className="p-4">
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-pink-500" />
                        Upcoming Events ({artist.upcomingEvents.length})
                      </h4>
                      <div className="space-y-3">
                        {artist.upcomingEvents.map((event) => (
                          <div
                            key={event.id}
                            className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                            onClick={() => handleEventClick(event)}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-sm">{event.title}</span>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {format(new Date(event.dateTime), 'MMM d, yyyy')}
                                </div>
                                <div className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {event.venue.city}, {event.venue.state}
                                </div>
                              </div>
                            </div>
                            {event.ticketing?.urls?.[0] && (
                              <ExternalLink className="w-4 h-4 text-pink-500" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 text-center text-muted-foreground">
                      <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No upcoming events found</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
