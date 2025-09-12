import React, { useState, useEffect } from 'react';
import { Navigation } from './Navigation';
import { ConcertFeed } from './ConcertFeed';
import { UnifiedSearch } from './UnifiedSearch';
import { ProfileView } from './ProfileView';
import { SwipeView } from './SwipeView';
import { ConcertEvents } from './ConcertEvents';
import { Event as EventCardEvent } from './EventCard';
import { WelcomeScreen } from './WelcomeScreen';
import Auth from '@/pages/Auth';
import { EventSeeder } from './EventSeeder';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type ViewType = 'feed' | 'search' | 'profile';

interface MainAppProps {
  onSignOut?: () => void;
}

export const MainApp = ({ onSignOut }: MainAppProps) => {
  const [currentView, setCurrentView] = useState<ViewType>('feed');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [events, setEvents] = useState<EventCardEvent[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    console.log('🚀 MainApp useEffect starting...');
    checkAuth();
    loadEvents();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔐 Auth state change:', event, session?.user?.id);
        if (event === 'SIGNED_IN' && session) {
          setCurrentUserId(session.user.id);
          setShowAuth(false);
        } else if (event === 'SIGNED_OUT') {
          setCurrentUserId(null);
          setShowAuth(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const checkAuth = async () => {
    console.log('🔍 Checking auth...');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('👤 User data:', user?.id ? 'Found user' : 'No user');
      if (user) {
        setCurrentUserId(user.id);
        setShowAuth(false);
      } else {
        // No user - show welcome screen first, then auth when they click
        console.log('No authenticated user');
        setCurrentUserId(null);
        setLoading(false); // Only set loading false if no user
      }
    } catch (error) {
      console.error('❌ Error checking auth:', error);
      setCurrentUserId(null);
      setLoading(false); // Set loading false on error
    }
  };

  const handleGetStarted = () => {
    setShowAuth(true);
  };

  const handleAuthSuccess = async () => {
    setShowAuth(false);
    await checkAuth(); // Recheck auth after successful login
  };

  const loadEvents = async () => {
    console.log('📅 Loading events...');
    try {
      const { data, error } = await supabase
        .from('jambase_events')
        .select('*')
        .order('event_date', { ascending: true });

      if (error) throw error;
      console.log('✅ Events loaded:', data?.length || 0, 'events');
      
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
    } finally {
      setLoading(false); // Make sure loading is set to false
    }
  };

  const handleEventSwipe = async (eventId: string, direction: 'like' | 'pass') => {
    if (!currentUserId) return;

    try {
      if (direction === 'like') {
        // Add to user's interested events
        const { error } = await supabase
          .from('user_jambase_events')
          .insert({
            user_id: currentUserId,
            jambase_event_id: eventId
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

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      toast({
        title: "Signed out",
        description: "You've been successfully signed out.",
      });
    } catch (error: any) {
      console.error('Error signing out:', error);
      toast({
        title: "Error",
        description: "Failed to sign out. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleBack = () => {
    setCurrentView('feed');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Show auth modal if requested
  if (showAuth) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  // Show welcome screen if no user
  if (!currentUserId) {
    return <WelcomeScreen onGetStarted={handleGetStarted} />;
  }

  const renderCurrentView = () => {
    switch (currentView) {
      case 'feed':
        return (
          <ConcertFeed 
            currentUserId={currentUserId}
            onBack={handleBack}
          />
        );
      case 'search':
        return (
          <div className="min-h-screen bg-background p-4 pb-20">
            <div className="max-w-4xl mx-auto">
              <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900">Search</h1>
                <p className="text-gray-600 mt-2">Find events and connect with other music lovers</p>
              </div>
              <UnifiedSearch 
                userId={currentUserId}
              />
            </div>
          </div>
        );
      case 'profile':
        return (
          <ProfileView
            currentUserId={currentUserId}
            onBack={handleBack}
            onEdit={handleProfileEdit}
            onSettings={handleProfileSettings}
            onSignOut={handleSignOut}
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
