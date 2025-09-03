import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Heart, X, MessageCircle } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { DBEvent, Profile } from '@/types/database';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();

  useEffect(() => {
    fetchInterestedUsers();
  }, [event.id, currentUserId]);

  const fetchInterestedUsers = async () => {
    try {
      // Get all users interested in this event (excluding current user)
      const { data: interests, error: interestsError } = await supabase
        .from('event_interests')
        .select(`
          user_id,
          profiles(*)
        `)
        .eq('event_id', event.id)
        .neq('user_id', currentUserId);

      if (interestsError) throw interestsError;

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

      const usersWithData: UserWithProfile[] = [];
      
      interests?.forEach(interest => {
        const profile = interest.profiles;
        if (profile && !swipeMap.has(interest.user_id)) {
          usersWithData.push({
            id: (profile as any).id,
            user_id: (profile as any).user_id,
            name: (profile as any).name,
            avatar_url: (profile as any).avatar_url,
            bio: (profile as any).bio,
            created_at: (profile as any).created_at,
            updated_at: (profile as any).updated_at,
            hasSwipedRight: swipeMap.get(interest.user_id) === true,
            isMatch: matchSet.has(interest.user_id)
          });
        }
      });

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
          toast({
            title: "It's a match! 🎉",
            description: `You and ${targetUser.name} both want to connect at ${event.title}!`,
          });
          
          // Get the chat for this match
          const { data: match } = await supabase
            .from('matches')
            .select('chats(id)')
            .eq('event_id', event.id)
            .or(`and(user1_id.eq.${currentUserId},user2_id.eq.${targetUser.user_id}),and(user1_id.eq.${targetUser.user_id},user2_id.eq.${currentUserId})`)
            .maybeSingle();

          if (match?.chats && Array.isArray(match.chats) && match.chats[0]?.id) {
            onChatCreated(match.chats[0].id);
          }
        } else {
          toast({
            title: direction === 'like' ? "Great choice!" : "No worries!",
            description: direction === 'like' 
              ? `Your interest in ${targetUser.name} has been noted`
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
            <h1 className="font-bold text-lg">{event.title}</h1>
            <p className="text-sm text-muted-foreground">{event.venue}</p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex justify-center mb-6">
          <Badge variant="secondary">
            {currentUserIndex + 1} of {users.length}
          </Badge>
        </div>

        {/* User Card */}
        <div className="relative">
          <Card className={`transition-all duration-300 ${
            isAnimating 
              ? swipeDirection === 'like' 
                ? 'transform translate-x-full rotate-12 opacity-0' 
                : 'transform -translate-x-full -rotate-12 opacity-0'
              : 'transform translate-x-0 rotate-0 opacity-100'
          }`}>
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
                  <p className="text-muted-foreground mb-4">
                    {currentUser.bio}
                  </p>
                )}
                
                <Badge className="mb-6">
                  Also interested in {event.title}
                </Badge>
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
    </div>
  );
};