import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Heart, X, MessageCircle, User, MapPin, Calendar, Instagram, Camera, ExternalLink } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { DBEvent, Profile } from '@/types/database';
import { Event } from '@/types/concertSearch';
import { useAuth } from '@/hooks/useAuth';
import { VerificationBadge } from '@/components/verification/VerificationBadge';
import type { AccountType } from '@/utils/verificationUtils';

// Union type to handle both old and new event formats
type EventData = DBEvent | Event;
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';

interface EventUsersViewProps {
  event: EventData;
  currentUserId: string;
  onBack: () => void;
  onChatCreated: (chatId: string) => void;
}

interface UserWithProfile {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  instagram_handle: string | null;
  gender: string | null;
  birthday: string | null;
  created_at: string;
  updated_at: string;
  hasSwipedRight?: boolean;
  isMatch?: boolean;
  account_type?: AccountType;
  verified?: boolean;
}

export const EventUsersView = ({ event, currentUserId, onBack, onChatCreated }: EventUsersViewProps) => {
  const [users, setUsers] = useState<UserWithProfile[]>([]);
  const [currentUserIndex, setCurrentUserIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'like' | 'pass' | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [otherEvents, setOtherEvents] = useState<any[]>([]);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const { toast } = useToast();
  const { sessionExpired } = useAuth();

  // Helper functions to handle event data display
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
    return event.event_date;
  };
  
  const getEventTime = () => {
    return 'event_time' in event ? event.event_time : undefined;
  };

  useEffect(() => {
    // Don't fetch data if session is expired
    if (sessionExpired) {
      setLoading(false);
      return;
    }
    
    fetchInterestedUsers();
  }, [event.id, currentUserId, sessionExpired]);

  const fetchInterestedUsers = async () => {
    try {
      // Check if session is expired before making any requests
      if (sessionExpired) {
        console.log('Session expired, skipping users fetch');
        setLoading(false);
        return;
      }

      // Get all users interested in this event (excluding current user)
      const { data: interests, error: interestsError } = await supabase
        .from('user_event_relationships')
        .select('user_id')
        .eq('event_id', event.id)
        .eq('relationship_type', 'interested')
        .neq('user_id', currentUserId);

      if (interestsError) throw interestsError;

      const interestedUserIds = (interests || []).map(i => i.user_id);

      // Early exit if nobody else is interested
      if (interestedUserIds.length === 0) {
        setUsers([]);
        return;
      }

      // Get swipe data for current user
      const { data: swipes, error: swipesError } = await supabase
        .from('user_swipes')
        .select('swiped_user_id, is_interested')
        .eq('swiper_user_id', currentUserId)
        .eq('event_id', event.id);

      if (swipesError) throw swipesError;

      // Get matches for current user
      const { data: matches, error: matchesError } = await supabase
        .from('matches')
        .select('user1_id, user2_id')
        .eq('event_id', event.id)
        .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`);

      if (matchesError) throw matchesError;

      const swipeMap = new Map(swipes?.map(s => [s.swiped_user_id, s.is_interested]) || []);
      const matchSet = new Set(matches?.map(m => 
        m.user1_id === currentUserId ? m.user2_id : m.user1_id
      ) || []);

      // Fetch profiles for those interested users
      const { data: profiles, error: profilesError } = await supabase
        .from('users')
        .select('id, user_id, name, avatar_url, bio, instagram_handle, gender, birthday, created_at, updated_at, account_type, verified')
        .in('user_id', interestedUserIds);

      if (profilesError) throw profilesError;

      // Fix: Ensure we only include profiles with a valid user_id and that have not been swiped on
      const usersWithData: UserWithProfile[] = Array.isArray(profiles)
        ? profiles
            .filter(
              (p: any) =>
                p &&
                typeof p === "object" &&
                p.user_id &&
                !swipeMap.has(p.user_id)
            )
            .map((p: any) => ({
              id: p.id,
              user_id: p.user_id,
              name: p.name,
              avatar_url: p.avatar_url,
              bio: p.bio,
              instagram_handle: p.instagram_handle,
              gender: p.gender,
              birthday: p.birthday,
              created_at: p.created_at,
              updated_at: p.updated_at,
              hasSwipedRight: swipeMap.get(p.user_id) === true,
              isMatch: matchSet.has(p.user_id)
            }))
        : [];

      setUsers(usersWithData);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: "Error",
        description: "Failed to load interested users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchOtherEvents = async (userId: string) => {
    try {
      const { data: userEvents, error } = await supabase
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
        .eq('user_id', userId)
        .eq('relationship_type', 'interested')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const events = userEvents?.map(item => item.events).filter(Boolean) || [];
      setOtherEvents(events);
    } catch (error) {
      console.error('Error fetching other events:', error);
    }
  };

  const handleSwipe = async (direction: 'like' | 'pass') => {
    if (isAnimating || currentUserIndex >= users.length) return;

    const targetUser = users[currentUserIndex];
    setIsAnimating(true);
    setSwipeDirection(direction);

    try {
      // Record the swipe
      const { error } = await supabase
        .from('user_swipes')
        .insert({
          swiper_user_id: currentUserId,
          swiped_user_id: targetUser.user_id,
          event_id: event.id,
          is_interested: direction === 'like'
        });

      if (error) throw error;

      // Check if this creates a match
      if (direction === 'like') {
        const { data: existingSwipe } = await supabase
          .from('user_swipes')
          .select('is_interested')
          .eq('swiper_user_id', targetUser.user_id)
          .eq('swiped_user_id', currentUserId)
          .eq('event_id', event.id)
          .eq('is_interested', true)
          .maybeSingle();

        if (existingSwipe) {
          // Create the match first
          const { data: match, error: matchError } = await supabase
            .from('matches')
            .insert({
              user1_id: currentUserId < targetUser.user_id ? currentUserId : targetUser.user_id,
              user2_id: currentUserId < targetUser.user_id ? targetUser.user_id : currentUserId,
              event_id: event.id
            })
            .select('id')
            .single();

          if (matchError) {
            console.error('Error creating match:', matchError);
          } else if (match) {
            // Create a chat for the match
            const { data: chat, error: chatError } = await supabase
              .from('chats')
              .insert({
                match_id: match.id,
                chat_name: `Concert Buddy Chat`,
                users: [currentUserId, targetUser.user_id],
                is_group_chat: false
              })
              .select('id')
              .single();

            if (chatError) {
              console.error('Error creating chat:', chatError);
            } else if (chat) {
          toast({
            title: "It's a match! 🎉",
            description: `You and ${targetUser.name} both want to connect at ${event.event_name}!`,
          });
              onChatCreated(chat.id);
            }
          }
        } else {
          toast({
            title: direction === 'like' ? "Invitation sent! 💌" : "No worries!",
            description: direction === 'like' 
              ? `You've sent an invitation to ${targetUser.name}. They'll see it in their Requests!`
              : "Moving on to the next person",
          });
        }
      }

      setTimeout(() => {
        setCurrentUserIndex(prev => prev + 1);
        setIsAnimating(false);
        setSwipeDirection(null);
      }, 300);

    } catch (error) {
      console.error('Error recording swipe:', error);
      toast({
        title: "Error",
        description: "Failed to record your choice",
        variant: "destructive",
      });
      setIsAnimating(false);
      setSwipeDirection(null);
    }
  };

  const currentUser = users[currentUserIndex];

  // Session expiration is handled by MainApp, so we don't need to handle it here

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading interested users...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <Card className="max-w-md text-center">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold mb-4">All caught up!</h2>
            <p className="text-muted-foreground mb-6">
              You've seen everyone interested in this event. Check back later for new people!
            </p>
            <Button onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Events
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-sm mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="font-bold text-lg">{getEventName()}</h1>
            <p className="text-sm text-muted-foreground">{getEventLocation()}</p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex justify-center mb-6">
          <Badge variant="secondary">
            {currentUserIndex + 1} of {users.length}
          </Badge>
        </div>

        {/* User Card - Clickable */}
        <div className="relative">
          <Card 
            className={`transition-all duration-300 cursor-pointer hover:shadow-lg ${
              isAnimating 
                ? swipeDirection === 'like' 
                  ? 'transform translate-x-full rotate-12 opacity-0' 
                  : 'transform -translate-x-full -rotate-12 opacity-0'
                : 'transform translate-x-0 rotate-0 opacity-100'
            }`}
            onClick={() => setShowProfile(true)}
          >
            <CardContent className="p-6">
              <div className="text-center">
                <Avatar className="w-24 h-24 mx-auto mb-4">
                  <AvatarImage src={currentUser.avatar_url || undefined} />
                  <AvatarFallback className="text-xl">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex items-center justify-center gap-2 mb-2">
                  <h2 className="text-xl font-bold">{currentUser.name}</h2>
                  {currentUser.verified && currentUser.account_type && (
                    <VerificationBadge
                      accountType={currentUser.account_type}
                      verified={currentUser.verified}
                      size="md"
                    />
                  )}
                </div>
                
                {currentUser.bio && (
                  <p className="text-muted-foreground mb-4 line-clamp-2">
                    {currentUser.bio}
                  </p>
                )}
                
                <Badge className="mb-4">
                  Also interested in {getEventName()}
                </Badge>
                
                <p className="text-xs text-muted-foreground">
                  Tap to view full profile
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 mt-6">
          <Button
            variant="outline"
            size="lg"
            className="flex-1 btn-swipe-pass"
            onClick={() => handleSwipe('pass')}
            disabled={isAnimating}
          >
            <X className="w-5 h-5 mr-2" />
            Pass
          </Button>
          <Button
            size="lg"
            className="flex-1 btn-swipe-like"
            onClick={() => handleSwipe('like')}
            disabled={isAnimating}
          >
            <Heart className="w-5 h-5 mr-2" />
            Connect
          </Button>
        </div>

        {/* Helper text */}
        <p className="text-center text-sm text-muted-foreground mt-4">
          Connect with people you'd like to meet at this event
        </p>
      </div>

      {/* Profile Modal */}
      <Dialog open={showProfile} onOpenChange={(open) => {
        setShowProfile(open);
        if (open && currentUser) {
          fetchOtherEvents(currentUser.user_id);
        }
        setShowAllEvents(false);
      }}>
        <DialogContent className="max-w-[85vw] max-h-[75vh] overflow-y-auto mx-4 sm:max-w-md">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-center text-lg">Profile</DialogTitle>
          </DialogHeader>
          {currentUser && (
            <div className="space-y-4">
              {/* Profile Header */}
              <div className="text-center">
                <Avatar className="w-16 h-16 mx-auto mb-3">
                  <AvatarImage src={currentUser.avatar_url || undefined} />
                  <AvatarFallback className="text-xl">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-bold">{currentUser.name}</h3>
                  {currentUser.verified && currentUser.account_type && (
                    <VerificationBadge
                      accountType={currentUser.account_type}
                      verified={currentUser.verified}
                      size="sm"
                    />
                  )}
                </div>
                {currentUser.bio && (
                  <p className="text-muted-foreground text-xs leading-relaxed line-clamp-2">
                    {currentUser.bio}
                  </p>
                )}
                
                {/* Gender and Age Display */}
                {(currentUser.gender || currentUser.birthday) && (
                  <div className="flex items-center justify-center gap-3 mt-3">
                    {currentUser.gender && (
                      <Badge variant="secondary" className="text-xs">
                        {currentUser.gender}
                      </Badge>
                    )}
                    {currentUser.birthday && (
                      <Badge variant="secondary" className="text-xs">
                        {(() => {
                          const birthDate = new Date(currentUser.birthday);
                          const today = new Date();
                          let age = today.getFullYear() - birthDate.getFullYear();
                          const monthDiff = today.getMonth() - birthDate.getMonth();
                          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                            age--;
                          }
                          return `${age} years old`;
                        })()}
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {/* Social Media Links */}
              {currentUser.instagram_handle && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Social Media</h4>
                  <div className="flex flex-col gap-2">
                    <a
                      href={`https://instagram.com/${currentUser.instagram_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 rounded-lg border hover:bg-pink-50 transition-colors"
                    >
                      <Instagram className="w-4 h-4 text-pink-600" />
                      <span className="text-pink-600 font-medium text-sm">@{currentUser.instagram_handle}</span>
                      <ExternalLink className="w-3 h-3 text-pink-600 ml-auto" />
                    </a>
                  </div>
                </div>
              )}

              {/* Current Event Interest */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Current Event</h4>
                <div className="p-3 rounded-lg border bg-blue-50">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Calendar className="w-3 h-3" />
                    <span>{(() => {
                      try {
                        // Handle both old format (separate date/time) and new format (full timestamp)
                        let dateTime;
                        if (getEventTime()) {
                          // Old format: separate date and time fields
                          dateTime = parseISO(`${getEventDate()}T${getEventTime() || '00:00'}`);
                        } else {
                          // New format: event_date is already a full timestamp
                          dateTime = parseISO(getEventDate());
                        }
                        return `${format(dateTime, 'MMM d, yyyy')} at ${format(dateTime, 'h:mm a')}`;
                      } catch {
                        return `${getEventDate()} at ${getEventTime() || 'TBD'}`;
                      }
                    })()}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <MapPin className="w-3 h-3" />
                    <span className="truncate">{getEventLocation()}</span>
                  </div>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs">
                    Interested in {getEventName()}
                  </Badge>
                </div>
              </div>

              {/* Other Events */}
              {otherEvents.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Other Events</h4>
                  <div className="space-y-1">
                    {(showAllEvents ? otherEvents : otherEvents.slice(0, 2)).map((otherEvent) => (
                      <div key={otherEvent.id} className="p-2 rounded-lg border bg-gray-50">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                          <Calendar className="w-3 h-3" />
                          <span>{(() => {
                            try {
                              // Handle both old format (separate date/time) and new format (full timestamp)
                              if (otherEvent.event_time) {
                                return format(parseISO(`${otherEvent.event_date}T${otherEvent.event_time}`), 'MMM d, yyyy');
                              } else {
                                return format(parseISO(otherEvent.event_date), 'MMM d, yyyy');
                              }
                            } catch {
                              return otherEvent.event_date;
                            }
                          })()}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate">{otherEvent.venue_city && otherEvent.venue_state 
                            ? `${otherEvent.venue_city}, ${otherEvent.venue_state}` 
                            : otherEvent.location || 'Location TBD'}</span>
                        </div>
                        <p className="font-medium text-xs truncate">{otherEvent.title || otherEvent.event_name}</p>
                      </div>
                    ))}
                    {otherEvents.length > 2 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAllEvents(!showAllEvents)}
                        className="w-full text-xs py-1"
                      >
                        {showAllEvents ? 'Show Less' : `Show ${otherEvents.length - 2} More`}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-3 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowProfile(false)}
                  className="flex-1 text-xs"
                >
                  Close
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setShowProfile(false);
                    handleSwipe('like');
                  }}
                  className="flex-1 btn-swipe-like text-xs"
                >
                  <Heart className="w-3 h-3 mr-1" />
                  Connect
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};