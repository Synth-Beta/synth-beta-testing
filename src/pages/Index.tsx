import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { EventInterestCard } from "@/components/EventInterestCard";
import { EventUsersView } from "@/components/EventUsersView";
import { MatchesView } from "@/components/MatchesView";
import { ChatView } from "@/components/ChatView";
import { ProfileView } from "@/components/ProfileView";
import { ProfileEdit } from "@/components/ProfileEdit";
import { ConcertSearch } from "@/components/ConcertSearch";
import { ConcertFeed } from "@/components/ConcertFeed";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import Auth from "@/pages/Auth";
import { DBEvent } from "@/types/database";

type ViewType = 'welcome' | 'events' | 'event-users' | 'matches' | 'chat' | 'profile' | 'profile-edit' | 'settings' | 'search' | 'concert-feed';

const Index = () => {
  const [currentView, setCurrentView] = useState<ViewType>('welcome');
  const [hasSeenWelcome, setHasSeenWelcome] = useState(false);
  const [events, setEvents] = useState<DBEvent[]>([]);
  const [userInterests, setUserInterests] = useState<number[]>([]);
  const [interestCounts, setInterestCounts] = useState<Record<number, number>>({});
  const [selectedEvent, setSelectedEvent] = useState<DBEvent | null>(null);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user, session, loading: authLoading, signOut } = useAuth();
  const { isOnline, isReconnecting } = useNetworkStatus();

  useEffect(() => {
    if (user) {
      // Check if user has seen welcome screen before
      const hasSeenWelcomeBefore = localStorage.getItem(`hasSeenWelcome_${user.id}`);
      if (hasSeenWelcomeBefore) {
        setHasSeenWelcome(true);
        setCurrentView('concert-feed'); // Go directly to concert feed for returning users
      }
      
      fetchEvents();
      fetchUserInterests();
    }
  }, [user]);

  const fetchEvents = async () => {
    try {
      // Check if offline
      if (!isOnline) {
        toast({
          title: "Offline",
          description: "You're currently offline. Please check your connection.",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase
        .from('events')
        .select('*')
        .gte('event_date', new Date().toISOString().split('T')[0])
        .order('event_date', { ascending: true });

      if (error) {
        // Handle API key errors specifically
        if (error.message?.includes('invalid') || error.message?.includes('API key') || error.message?.includes('JWT')) {
          console.error('API key error, signing out:', error);
          toast({
            title: "Session Expired",
            description: "Your session has expired. Please sign in again.",
            variant: "destructive",
          });
          await signOut();
          return;
        }
        throw error;
      }
      
      setEvents((data as any) || []);
      
      // Fetch interest counts for all events
      const { data: counts, error: countsError } = await supabase
        .from('event_interests')
        .select('event_id')
        .then(({ data }) => {
          const countMap: Record<number, number> = {};
          data?.forEach(interest => {
            const eventId = interest.event_id;
            countMap[eventId] = (countMap[eventId] || 0) + 1;
          });
          return { data: countMap, error: null };
        });

      if (!countsError) {
        setInterestCounts(counts);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
      
      // Check if it's a network error
      if (error instanceof TypeError && error.message.includes('fetch')) {
        toast({
          title: "Network Error",
          description: "Please check your internet connection and try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to load events",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchUserInterests = async () => {
    if (!user) return;

    try {
      // Check if offline
      if (!isOnline) {
        return;
      }

      const { data, error } = await supabase
        .from('event_interests')
        .select('event_id')
        .eq('user_id', user.id);

      if (error) {
        // Handle API key errors specifically
        if (error.message?.includes('invalid') || error.message?.includes('API key') || error.message?.includes('JWT')) {
          console.error('API key error in fetchUserInterests, signing out:', error);
          await signOut();
          return;
        }
        throw error;
      }
      
      setUserInterests(data?.map(interest => interest.event_id) || []);
    } catch (error) {
      console.error('Error fetching user interests:', error);
    }
  };

  const handleGetStarted = () => {
    if (user) {
      // Mark that user has seen welcome screen
      localStorage.setItem(`hasSeenWelcome_${user.id}`, 'true');
      setHasSeenWelcome(true);
    }
    setCurrentView('concert-feed');
  };


  const handleToggleInterest = async (eventId: number) => {
    if (!user) return;

    const isCurrentlyInterested = userInterests.includes(eventId);

    try {
      if (isCurrentlyInterested) {
        const { error } = await supabase
          .from('event_interests')
          .delete()
          .eq('user_id', user.id)
          .eq('event_id', eventId);

        if (error) throw error;

        setUserInterests(prev => prev.filter(id => id !== eventId));
        setInterestCounts(prev => ({
          ...prev,
          [eventId]: Math.max(0, (prev[eventId] || 0) - 1)
        }));

        toast({
          title: "Interest removed",
          description: "You're no longer interested in this event",
        });
      } else {
        const { error } = await supabase
          .from('event_interests')
          .insert({
            user_id: user.id,
            event_id: eventId
          });

        if (error) throw error;

        setUserInterests(prev => [...prev, eventId]);
        setInterestCounts(prev => ({
          ...prev,
          [eventId]: (prev[eventId] || 0) + 1
        }));

        const event = events.find(e => e.id === eventId);
        toast({
          title: "Great choice!",
          description: `You're now interested in "${event?.event_name}"`,
        });
      }
    } catch (error) {
      console.error('Error toggling interest:', error);
      toast({
        title: "Error",
        description: "Failed to update your interest",
        variant: "destructive",
      });
    }
  };

  const handleViewUsers = (eventId: number) => {
    const event = events.find(e => e.id === eventId);
    if (event) {
      setSelectedEvent(event);
      setCurrentView('event-users');
    }
  };

  const handleChatCreated = (chatId: string) => {
    setCurrentChatId(chatId);
    setCurrentView('chat');
    toast({
      title: "Chat created!",
      description: "You can now message your match",
    });
  };

  const handleOpenChat = (chatId: string) => {
    setCurrentChatId(chatId);
    setCurrentView('chat');
  };

  const handleBackFromChat = () => {
    setCurrentChatId(null);
    setCurrentView('matches');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user || !session) {
    return <Auth onAuthSuccess={() => setCurrentView('welcome')} />;
  }

  // Show welcome screen only for new users
  if (!hasSeenWelcome) {
    return <WelcomeScreen onGetStarted={handleGetStarted} />;
  }

  const renderCurrentView = () => {
    switch (currentView) {
      case 'welcome':
        return <WelcomeScreen onGetStarted={handleGetStarted} />;
      case 'events':
        if (loading) {
          return (
            <div className="min-h-screen flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading events...</p>
              </div>
            </div>
          );
        }
        
        return (
          <div className="min-h-screen p-4 pb-20">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">Discover Events</h1>
                <Button variant="outline" onClick={signOut}>
                  Sign Out
                </Button>
              </div>
              
              <div className="grid gap-4">
                {events.map((event) => (
                  <EventInterestCard
                    key={event.id}
                    event={event}
                    isInterested={userInterests.includes(event.id)}
                    onToggleInterest={handleToggleInterest}
                    onViewUsers={handleViewUsers}
                    interestedCount={interestCounts[event.id] || 0}
                  />
                ))}
              </div>
              
              {events.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No events available yet.</p>
                </div>
              )}
            </div>
          </div>
        );
      case 'event-users':
        return selectedEvent && user ? (
          <EventUsersView
            event={selectedEvent}
            currentUserId={user.id}
            onBack={() => setCurrentView('events')}
            onChatCreated={handleChatCreated}
          />
        ) : null;
      case 'matches':
        return user ? (
          <MatchesView
            currentUserId={user.id}
            onBack={() => {}}
            onOpenChat={handleOpenChat}
          />
        ) : null;
      case 'chat':
        return currentChatId && user ? (
          <ChatView
            chatId={currentChatId}
            currentUserId={user.id}
            onBack={handleBackFromChat}
          />
        ) : null;
      case 'profile':
        return user ? (
          <ProfileView
            currentUserId={user.id}
            onBack={() => {}}
            onEdit={() => setCurrentView('profile-edit')}
            onSettings={() => setCurrentView('settings')}
            onSignOut={signOut}
          />
        ) : null;
      case 'profile-edit':
        return user ? (
          <ProfileEdit
            currentUserId={user.id}
            onBack={() => setCurrentView('profile')}
            onSave={() => setCurrentView('profile')}
          />
        ) : null;
      case 'settings':
        return (
          <div className="min-h-screen flex items-center justify-center p-4">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-4">Settings</h2>
              <p className="text-muted-foreground mb-4">App settings coming soon!</p>
              <Button variant="outline" onClick={signOut}>
                Sign Out
              </Button>
            </div>
          </div>
        );
      case 'search':
        return user ? (
          <ConcertSearch
            currentUserId={user.id}
            onSelectConcert={(concert) => {
              // Handle concert selection - you can add logic here
              console.log('Selected concert:', concert);
            }}
          />
        ) : null;
      case 'concert-feed':
        return user ? (
          <ConcertFeed
            currentUserId={user.id}
            onBack={() => setCurrentView('events')}
          />
        ) : null;
      default:
        return <WelcomeScreen onGetStarted={handleGetStarted} />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Offline Indicator */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 bg-red-500 text-white text-center py-2 z-50">
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            <span className="text-sm font-medium">You're offline. Please check your connection.</span>
          </div>
        </div>
      )}
      
      {/* Reconnecting Indicator */}
      {isReconnecting && (
        <div className="fixed top-0 left-0 right-0 bg-yellow-500 text-white text-center py-2 z-50">
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            <span className="text-sm font-medium">Reconnecting...</span>
          </div>
        </div>
      )}

      {renderCurrentView()}
      {currentView !== 'welcome' && currentView !== 'event-users' && currentView !== 'chat' && currentView !== 'profile-edit' && (
        <Navigation 
          currentView={currentView as any}
          onViewChange={(view) => setCurrentView(view as ViewType)}
        />
      )}
    </div>
  );
};

export default Index;