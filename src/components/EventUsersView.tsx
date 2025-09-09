import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Heart, X, MessageCircle, User, MapPin, Calendar, Instagram, Camera, ExternalLink } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { DBEvent, Profile } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';

interface EventUsersViewProps {
  event: DBEvent;
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
  snapchat_handle: string | null;
  created_at: string;
  updated_at: string;
  hasSwipedRight?: boolean;
  isMatch?: boolean;
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

  useEffect(() => {
    fetchInterestedUsers();
  }, [event.id, currentUserId]);

  const fetchInterestedUsers = async () => {
    try {
      // Get all users interested in this event (excluding current user)
      const { data: interests, error: interestsError } = await supabase
        .from('event_interests')
        .select('user_id')
        .eq('event_id', event.id)
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
        .from('profiles')
        .select('id, user_id, name, avatar_url, bio, instagram_handle, snapchat_handle, created_at, updated_at')
        .in('user_id', interestedUserIds);

      if (profilesError) throw profilesError;

      const usersWithData: UserWithProfile[] = (profiles || [])
        .filter(p => !swipeMap.has(p.user_id))
        .map(p => ({
          id: p.id,
          user_id: p.user_id,
          name: p.name,
          avatar_url: p.avatar_url,
          bio: p.bio,
          instagram_handle: p.instagram_handle,
          snapchat_handle: p.snapchat_handle,
          created_at: p.created_at,
          updated_at: p.updated_at,
          hasSwipedRight: swipeMap.get(p.user_id) === true,
          isMatch: matchSet.has(p.user_id)
        }));

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
        .from('event_interests')
        .select(`
          event:events(
            id,
            event_name,
            location,
            event_date,
            event_time
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const events = userEvents?.map(item => item.event).filter(Boolean) || [];
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
                match_id: match.id
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
            <h1 className="font-bold text-lg">{event.event_name}</h1>
            <p className="text-sm text-muted-foreground">{event.location}</p>
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
                
                <h2 className="text-xl font-bold mb-2">{currentUser.name}</h2>
                
                {currentUser.bio && (
                  <p className="text-muted-foreground mb-4 line-clamp-2">
                    {currentUser.bio}
                  </p>
                )}
                
                <Badge className="mb-4">
                  Also interested in {event.event_name}
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
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-center">Profile</DialogTitle>
          </DialogHeader>
          {currentUser && (
            <div className="space-y-6">
              {/* Profile Header */}
              <div className="text-center">
                <Avatar className="w-24 h-24 mx-auto mb-4">
                  <AvatarImage src={currentUser.avatar_url || undefined} />
                  <AvatarFallback className="text-3xl">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <h3 className="text-2xl font-bold mb-2">{currentUser.name}</h3>
                {currentUser.bio && (
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {currentUser.bio}
                  </p>
                )}
              </div>

              {/* Social Media Links */}
              {(currentUser.instagram_handle || currentUser.snapchat_handle) && (
                <div className="space-y-3">
                  <h4 className="font-semibold text-lg">Social Media</h4>
                  <div className="flex flex-col gap-3">
                    {currentUser.instagram_handle && (
                      <a
                        href={`https://instagram.com/${currentUser.instagram_handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-lg border hover:bg-pink-50 transition-colors"
                      >
                        <Instagram className="w-5 h-5 text-pink-600" />
                        <span className="text-pink-600 font-medium">@{currentUser.instagram_handle}</span>
                        <ExternalLink className="w-4 h-4 text-pink-600 ml-auto" />
                      </a>
                    )}
                    {currentUser.snapchat_handle && (
                      <a
                        href={`https://snapchat.com/add/${currentUser.snapchat_handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-lg border hover:bg-yellow-50 transition-colors"
                      >
                        <Camera className="w-5 h-5 text-yellow-600" />
                        <span className="text-yellow-600 font-medium">@{currentUser.snapchat_handle}</span>
                        <ExternalLink className="w-4 h-4 text-yellow-600 ml-auto" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Current Event Interest */}
              <div className="space-y-3">
                <h4 className="font-semibold text-lg">Current Event</h4>
                <div className="p-4 rounded-lg border bg-blue-50">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <Calendar className="w-4 h-4" />
                    <span>{format(parseISO(`${event.event_date}T${event.event_time}`), 'MMM d, yyyy')} at {format(parseISO(`${event.event_date}T${event.event_time}`), 'h:mm a')}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                    <MapPin className="w-4 h-4" />
                    <span>{event.location}</span>
                  </div>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    Interested in {event.event_name}
                  </Badge>
                </div>
              </div>

              {/* Other Events */}
              {otherEvents.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-semibold text-lg">Other Events</h4>
                  <div className="space-y-2">
                    {(showAllEvents ? otherEvents : otherEvents.slice(0, 3)).map((otherEvent) => (
                      <div key={otherEvent.id} className="p-3 rounded-lg border bg-gray-50">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                          <Calendar className="w-4 h-4" />
                          <span>{format(parseISO(`${otherEvent.event_date}T${otherEvent.event_time}`), 'MMM d, yyyy')}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                          <MapPin className="w-4 h-4" />
                          <span>{otherEvent.location}</span>
                        </div>
                        <p className="font-medium text-sm">{otherEvent.event_name}</p>
                      </div>
                    ))}
                    {otherEvents.length > 3 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAllEvents(!showAllEvents)}
                        className="w-full"
                      >
                        {showAllEvents ? 'Show Less' : `Show ${otherEvents.length - 3} More Events`}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setShowProfile(false)}
                  className="flex-1"
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    setShowProfile(false);
                    handleSwipe('like');
                  }}
                  className="flex-1 btn-swipe-like"
                >
                  <Heart className="w-4 h-4 mr-2" />
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