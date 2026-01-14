import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, MessageCircle, Heart, MapPin, Calendar, Instagram, Camera, ExternalLink, X } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';

interface MatchesViewProps {
  currentUserId: string;
  onBack: () => void;
  onOpenChat: (chatId: string) => void;
}

interface MatchWithChat {
  id: string;
  user1_id: string;
  user2_id: string;
  event_id: string;
  created_at: string;
  event: {
    title: string;
    venue_city: string | null;
    venue_state: string | null;
    event_date: string;
    // Legacy fields for backward compatibility
    event_name?: string;
    location?: string;
    event_time?: string;
  };
  chats: {
    id: string;
    created_at: string;
    updated_at: string;
  }[];
  other_user: {
    id: string;
    user_id: string;
    name: string;
    avatar_url: string | null;
    bio: string | null;
    instagram_handle: string | null;
  };
  other_user_events: {
    id: string;
    title: string;
    venue_city: string | null;
    venue_state: string | null;
    event_date: string;
    // Legacy fields for backward compatibility
    event_name?: string;
    location?: string;
    event_time?: string;
  }[];
}

interface PendingInvitation {
  id: string;
  swiper_user_id: string;
  swiped_user_id: string;
  event_id: string;
  created_at: string;
  event: {
    title: string;
    venue_city: string | null;
    venue_state: string | null;
    event_date: string;
    // Legacy fields for backward compatibility
    event_name?: string;
    location?: string;
    event_time?: string;
  };
  swiper_user: {
    id: string;
    user_id: string;
    name: string;
    avatar_url: string | null;
    bio: string | null;
  };
}

export const MatchesView = ({ currentUserId, onBack, onOpenChat }: MatchesViewProps) => {
  const [matches, setMatches] = useState<MatchWithChat[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [showRequests, setShowRequests] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Helper functions to handle event data display
  const getEventName = (event: any) => {
    return event.title || event.event_name || 'Unknown Event';
  };

  const getEventLocation = (event: any) => {
    if (event.venue_city && event.venue_state) {
      return `${event.venue_city}, ${event.venue_state}`;
    }
    return event.location || 'Location TBD';
  };

  useEffect(() => {
    fetchMatches();
    fetchPendingInvitations();
  }, [currentUserId]);

  const fetchMatches = async () => {
    try {
      const { data, error } = await supabase
        .from('matches')
        .select(`
          id,
          user1_id,
          user2_id,
          event_id,
          created_at
        `)
        .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get the other user's profile, event data, and their events for each match
      const matchesWithProfiles = await Promise.all(
        (data || []).map(async (match) => {
          const otherUserId = match.user1_id === currentUserId 
            ? match.user2_id 
            : match.user1_id;

          // Fetch the event data separately
          const { data: eventData, error: eventError } = await supabase
            .from('events')
            .select('title, venue_city, venue_state, event_date')
            .eq('id', match.event_id)
            .single();

          if (eventError) {
            console.error('Error fetching event data:', eventError);
            return null;
          }

          const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('id, user_id, name, avatar_url, bio, instagram_handle')
            .eq('user_id', otherUserId)
            .single();

          if (profileError) {
            console.error('Error fetching profile for user:', otherUserId, profileError);
            return null;
          }

          // Get other user's event interests
          const { data: userEvents, error: eventsError } = await supabase
            .from('user_event_relationships')
            .select(`
              events:events!user_event_relationships_event_id_fkey(
                id,
                title,
                venue_city,
                venue_state,
                event_date
              )
            `)
            .eq('user_id', otherUserId)
            .eq('relationship_type', 'interested')
            .order('created_at', { ascending: false })
            .limit(5); // Show up to 5 recent events

          const otherUserEvents = userEvents?.map(item => item.events).filter(Boolean) || [];

          // Get chats for this match
          const { data: chatsData, error: chatsError } = await supabase
            .from('chats')
            .select('id, created_at, updated_at')
            .eq('match_id', match.id);

          const chats = chatsError ? [] : (chatsData || []);

          return {
            ...match,
            event: eventData,
            other_user: profile,
            other_user_events: otherUserEvents,
            chats: chats
          };
        })
      );

      // Avoid unsafe casting, do a runtime check for each match
      const validMatches = matchesWithProfiles.filter(
        (m): m is MatchWithChat =>
          !!m &&
          m.other_user &&
          m.other_user.id !== undefined &&
          m.other_user.name !== undefined &&
          Array.isArray(m.other_user_events)
      );
      setMatches(validMatches);
    } catch (error) {
      console.error('Error fetching matches:', error);
      toast({
        title: "Error",
        description: "Failed to load matches",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingInvitations = async () => {
    try {
      // Get swipes where someone swiped right on the current user, but there's no match yet
      const { data: swipes, error: swipesError } = await supabase
        .from('user_swipes')
        .select(`
          id,
          swiper_user_id,
          swiped_user_id,
          event_id,
          created_at
        `)
        .eq('swiped_user_id', currentUserId)
        .eq('is_interested', true);

      if (swipesError) throw swipesError;

      // Filter out swipes that already have matches
      const { data: existingMatches, error: matchesError } = await supabase
        .from('matches')
        .select('user1_id, user2_id, event_id')
        .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`);

      if (matchesError) throw matchesError;

      const matchSet = new Set(
        existingMatches?.map(m => `${m.user1_id}-${m.user2_id}-${m.event_id}`) || []
      );

      const pendingSwipes = (swipes || []).filter(swipe => {
        const matchKey = `${swipe.swiper_user_id}-${swipe.swiped_user_id}-${swipe.event_id}`;
        const reverseMatchKey = `${swipe.swiped_user_id}-${swipe.swiper_user_id}-${swipe.event_id}`;
        return !matchSet.has(matchKey) && !matchSet.has(reverseMatchKey);
      });

      // Get profiles for the swipers
      const swiperIds = pendingSwipes.map(swipe => swipe.swiper_user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('users')
        .select('id, user_id, name, avatar_url, bio')
        .in('user_id', swiperIds);

      if (profilesError) throw profilesError;

      // Fetch event data for all pending swipes
      const invitationsWithProfiles = await Promise.all(
        pendingSwipes.map(async (swipe) => {
          const { data: eventData, error: eventError } = await supabase
            .from('events')
            .select('title, venue_city, venue_state, event_date')
            .eq('id', swipe.event_id)
            .single();

          if (eventError) {
            console.error('Error fetching event data for invitation:', eventError);
            return null;
          }

          const profile = profiles?.find(p => p.user_id === swipe.swiper_user_id);
          return {
            id: swipe.id,
            swiper_user_id: swipe.swiper_user_id,
            swiped_user_id: swipe.swiped_user_id,
            event_id: swipe.event_id,
            created_at: swipe.created_at,
            event: eventData,
            swiper_user: profile || {
              id: '',
              user_id: swipe.swiper_user_id,
              name: 'Unknown User',
              avatar_url: null,
              bio: null
            }
          };
        })
      );

      setPendingInvitations(invitationsWithProfiles.filter(Boolean) as PendingInvitation[]);
    } catch (error) {
      console.error('Error fetching pending invitations:', error);
    }
  };

  const handleAcceptInvitation = async (invitation: PendingInvitation) => {
    try {
      // Create a swipe back from current user to the swiper
      const { error: swipeError } = await supabase
        .from('user_swipes')
        .insert({
          swiper_user_id: currentUserId,
          swiped_user_id: invitation.swiper_user_id,
          event_id: invitation.event_id,
          is_interested: true
        });

      if (swipeError) throw swipeError;

      // The match and chat will be created automatically by the trigger
      toast({
        title: "Invitation accepted! 🎉",
        description: `You and ${invitation.swiper_user.name} are now matched for ${invitation.event.event_name}!`,
      });

      // Refresh data
      fetchMatches();
      fetchPendingInvitations();
    } catch (error) {
      console.error('Error accepting invitation:', error);
      toast({
        title: "Error",
        description: "Failed to accept invitation",
        variant: "destructive",
      });
    }
  };

  const handleRejectInvitation = async (invitation: PendingInvitation) => {
    try {
      // Create a swipe back from current user to the swiper (as not interested)
      const { error: swipeError } = await supabase
        .from('user_swipes')
        .insert({
          swiper_user_id: currentUserId,
          swiped_user_id: invitation.swiper_user_id,
          event_id: invitation.event_id,
          is_interested: false
        });

      if (swipeError) throw swipeError;

      toast({
        title: "Invitation declined",
        description: "You've declined this invitation",
      });

      // Refresh data
      fetchPendingInvitations();
    } catch (error) {
      console.error('Error rejecting invitation:', error);
      toast({
        title: "Error",
        description: "Failed to reject invitation",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading matches...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Your Matches</h1>
            <p className="text-muted-foreground">People you've connected with at events</p>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowRequests(!showRequests)}
            className="relative"
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            Requests
            {pendingInvitations.length > 0 && (
              <Badge className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs">
                {pendingInvitations.length}
              </Badge>
            )}
          </Button>
        </div>

        {/* Pending Invitations - Only show when button is clicked */}
        {showRequests && pendingInvitations.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Pending Invitations</h2>
            <div className="space-y-4">
              {pendingInvitations.map((invitation) => {
                const eventDateTime = (() => {
                  try {
                    // Handle both old format (separate date/time) and new format (full timestamp)
                    if (invitation.event.event_time) {
                      return parseISO(`${invitation.event.event_date}T${invitation.event.event_time}`);
                    } else {
                      return parseISO(invitation.event.event_date);
                    }
                  } catch {
                    return new Date();
                  }
                })();
                return (
                  <Card key={invitation.id} className="border-orange-200 bg-orange-50">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <Avatar className="w-12 h-12">
                          <AvatarImage src={invitation.swiper_user.avatar_url || undefined} />
                          <AvatarFallback>
                            {invitation.swiper_user.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h3 className="font-semibold text-lg">{invitation.swiper_user.name}</h3>
                              <p className="text-sm text-muted-foreground">
                                Wants to connect at {getEventName(invitation.event)}
                              </p>
                            </div>
                            <Badge variant="outline" className="bg-orange-100 text-orange-800">
                              Pending
                            </Badge>
                          </div>

                          <div className="space-y-2 mb-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Calendar className="w-4 h-4" />
                              <span>{format(eventDateTime, 'MMM d, yyyy')} at {format(eventDateTime, 'h:mm a')}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <MapPin className="w-4 h-4" />
                              <span>{getEventLocation(invitation.event)}</span>
                            </div>
                          </div>

                          {invitation.swiper_user.bio && (
                            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                              {invitation.swiper_user.bio}
                            </p>
                          )}

                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleAcceptInvitation(invitation)}
                              className="btn-swipe-like"
                            >
                              <Heart className="w-4 h-4 mr-2" />
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRejectInvitation(invitation)}
                            >
                              <X className="w-4 h-4 mr-2" />
                              Decline
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Matches List */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold mb-4">Your Matches</h2>
          {matches.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Heart className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No matches yet</h3>
                <p className="text-muted-foreground mb-4">
                  Start swiping on people interested in events to make connections!
                </p>
                <Button onClick={onBack}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Browse Events
                </Button>
              </CardContent>
            </Card>
          ) : (
            matches.map((match) => {
              const eventDateTime = (() => {
                try {
                  // Handle both old format (separate date/time) and new format (full timestamp)
                  if (match.event.event_time) {
                    return parseISO(`${match.event.event_date}T${match.event.event_time || '00:00'}`);
                  } else {
                    return parseISO(match.event.event_date);
                  }
                } catch {
                  return new Date();
                }
              })();
              const chat = match.chats[0]; // Should only be one chat per match

              return (
                <Card key={match.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={match.other_user.avatar_url || undefined} />
                        <AvatarFallback>
                          {match.other_user.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="font-semibold text-lg">{match.other_user.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              Matched {(() => {
                                try {
                                  const matchDate = new Date(match.created_at);
                                  if (isNaN(matchDate.getTime())) return 'recently';
                                  return format(matchDate, 'MMM d, yyyy');
                                } catch {
                                  return 'recently';
                                }
                              })()}
                            </p>
                          </div>
                          <Badge variant="secondary">
                            <Heart className="w-3 h-3 mr-1" />
                            Match
                          </Badge>
                        </div>

                        <div className="space-y-2 mb-4">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="w-4 h-4" />
                            <span>{format(eventDateTime, 'MMM d, yyyy')} at {format(eventDateTime, 'h:mm a')}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <MapPin className="w-4 h-4" />
                            <span>{getEventLocation(match.event)}</span>
                          </div>
                        </div>

                        {/* Social Media Links */}
                        {match.other_user.instagram_handle && (
                          <div className="flex items-center gap-3 mb-3">
                            <a
                              href={`https://instagram.com/${match.other_user.instagram_handle}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-pink-600 hover:text-pink-700 transition-colors text-sm"
                            >
                              <Instagram className="w-3 h-3" />
                              <span>@{match.other_user.instagram_handle}</span>
                              <ExternalLink className="w-2 h-2" />
                            </a>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <div className="text-sm">
                            <p className="font-medium text-primary">{getEventName(match.event)}</p>
                            {match.other_user.bio && (
                              <p className="text-muted-foreground line-clamp-1">
                                {match.other_user.bio}
                              </p>
                            )}
                          </div>
                          
                          {chat && (
                            <Button 
                              onClick={() => onOpenChat(chat.id)}
                              className="btn-swipe-like"
                            >
                              <MessageCircle className="w-4 h-4 mr-2" />
                              Chat
                            </Button>
                          )}
                        </div>

                        {/* Other User's Event Interests */}
                        {match.other_user_events.length > 0 && (
                          <div className="mt-4 pt-3 border-t">
                            <p className="text-xs font-medium text-muted-foreground mb-2">
                              Also interested in:
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {match.other_user_events.slice(0, 3).map((event) => (
                                <Badge key={event.id} variant="outline" className="text-xs">
                                  {getEventName(event)}
                                </Badge>
                              ))}
                              {match.other_user_events.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{match.other_user_events.length - 3} more
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
