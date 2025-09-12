import React, { useState, useEffect } from 'react';
import { Navigation } from './Navigation';
import { ConcertFeed } from './ConcertFeed';
import { ConcertSearch } from './ConcertSearch';
import { ProfileView } from './ProfileView';
import { SwipeView } from './SwipeView';
import { ConcertEvents } from './ConcertEvents';
import { Event as EventCardEvent } from './EventCard';
import { WelcomeScreen } from './WelcomeScreen';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type ViewType = 'concert-feed' | 'search' | 'events' | 'profile';

interface MainAppProps {
  onSignOut?: () => void;
}

export const MainApp = ({ onSignOut }: MainAppProps) => {
  const [currentView, setCurrentView] = useState<ViewType>('concert-feed');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventCardEvent[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
    loadEvents();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      } else {
        // Handle no user - redirect to auth or show welcome
        console.log('No authenticated user');
      }
    } catch (error) {
      console.error('Error checking auth:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('event_date', { ascending: true });

      if (error) throw error;
      
      // Transform database events to EventCard format
      const transformedEvents: EventCardEvent[] = (data || []).map((event: any) => ({
        id: event.id,
        title: event.title || event.event_name || 'Untitled Event',
        venue: event.venue || event.location || 'Unknown Venue',
        date: event.event_date || event.date || new Date().toISOString().split('T')[0],
        time: event.event_time || event.time || 'TBD',
        category: 'music' as const, // Default to music for now
        description: event.description || 'No description available',
        image: event.image || '/placeholder.svg',
        price: event.event_price || undefined,
        attendeeCount: Math.floor(Math.random() * 100) + 1 // Mock attendee count
      }));
      
      setEvents(transformedEvents);
    } catch (error) {
      console.error('Error loading events:', error);
      toast({
        title: "Error",
        description: "Failed to load events",
        variant: "destructive",
      });
    }
  };

  const handleEventSwipe = async (eventId: string, direction: 'like' | 'pass') => {
    if (!currentUserId) return;

    try {
      if (direction === 'like') {
        // Add to user's interested events
        const { error } = await supabase
          .from('event_interests')
          .insert({
            user_id: currentUserId,
            event_id: eventId
          });

        if (error) throw error;

        toast({
          title: "Event Added!",
          description: "You've shown interest in this event",
        });
      }
    } catch (error) {
      console.error('Error handling event swipe:', error);
      toast({
        title: "Error",
        description: "Failed to process your action",
        variant: "destructive",
      });
    }
  };

  const handleViewChange = (view: ViewType) => {
    setCurrentView(view);
  };

  const handleProfileEdit = () => {
    // Navigate to profile edit view
    console.log('Edit profile');
  };

  const handleProfileSettings = () => {
    // Navigate to settings
    console.log('Profile settings');
  };

  const handleBack = () => {
    setCurrentView('concert-feed');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!currentUserId) {
    return <WelcomeScreen onAuthSuccess={() => checkAuth()} />;
  }

  const renderCurrentView = () => {
    switch (currentView) {
      case 'concert-feed':
        return (
          <ConcertFeed 
            currentUserId={currentUserId}
            onBack={handleBack}
          />
        );
      case 'search':
        return (
          <ConcertSearch 
            userId={currentUserId}
          />
        );
      case 'events':
        return (
          <ConcertEvents 
            currentUserId={currentUserId}
            onBack={handleBack}
          />
        );
      case 'profile':
        return (
          <ProfileView
            currentUserId={currentUserId}
            onBack={handleBack}
            onEdit={handleProfileEdit}
            onSettings={handleProfileSettings}
            onSignOut={onSignOut}
          />
        );
      default:
        return (
          <ConcertFeed 
            currentUserId={currentUserId}
            onBack={handleBack}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {renderCurrentView()}
      <Navigation 
        currentView={currentView} 
        onViewChange={handleViewChange} 
      />
    </div>
  );
};
