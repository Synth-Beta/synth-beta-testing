import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { EventInterestCard } from "@/components/EventInterestCard";
import { EventUsersView } from "@/components/EventUsersView";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import Auth from "@/pages/Auth";
import { DBEvent } from "@/types/database";

type ViewType = 'welcome' | 'events' | 'event-users' | 'profile' | 'settings';

const Index = () => {
  const [currentView, setCurrentView] = useState<ViewType>('welcome');
  const [events, setEvents] = useState<DBEvent[]>([]);
  const [userInterests, setUserInterests] = useState<string[]>([]);
  const [interestCounts, setInterestCounts] = useState<Record<string, number>>({});
  const [selectedEvent, setSelectedEvent] = useState<DBEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user, session, loading: authLoading, signOut } = useAuth();

  useEffect(() => {
    if (user) {
      fetchEvents();
      fetchUserInterests();
    }
  }, [user]);

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('datetime', { ascending: true });

      if (error) throw error;
      setEvents(data || []);
      
      // Fetch interest counts for all events
      const { data: counts, error: countsError } = await supabase
        .from('event_interests')
        .select('event_id')
        .then(({ data }) => {
          const countMap: Record<string, number> = {};
          data?.forEach(interest => {
            countMap[interest.event_id] = (countMap[interest.event_id] || 0) + 1;
          });
          return { data: countMap, error: null };
        });

      if (!countsError) {
        setInterestCounts(counts);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
      toast({
        title: "Error",
        description: "Failed to load events",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUserInterests = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('event_interests')
        .select('event_id')
        .eq('user_id', user.id);

      if (error) throw error;
      setUserInterests(data?.map(interest => interest.event_id) || []);
    } catch (error) {
      console.error('Error fetching user interests:', error);
    }
  };

  const handleGetStarted = () => {
    setCurrentView('events');
  };

  const handleToggleInterest = async (eventId: string) => {
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
          description: `You're now interested in "${event?.title}"`,
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

  const handleViewUsers = (eventId: string) => {
    const event = events.find(e => e.id === eventId);
    if (event) {
      setSelectedEvent(event);
      setCurrentView('event-users');
    }
  };

  const handleChatCreated = (chatId: string) => {
    // For now, just show success message
    // In a full implementation, this would navigate to the chat
    toast({
      title: "Chat created!",
      description: "You can now message your match",
    });
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
      case 'profile':
        return (
          <div className="min-h-screen flex items-center justify-center p-4">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-4">Profile</h2>
              <p className="text-muted-foreground mb-4">Profile management coming soon!</p>
              <Button variant="outline" onClick={signOut}>
                Sign Out
              </Button>
            </div>
          </div>
        );
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
      default:
        return <WelcomeScreen onGetStarted={handleGetStarted} />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {renderCurrentView()}
      {currentView !== 'welcome' && currentView !== 'event-users' && (
        <Navigation 
          currentView={currentView as any}
          onViewChange={(view) => setCurrentView(view as ViewType)}
        />
      )}
    </div>
  );
};

export default Index;