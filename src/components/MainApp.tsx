import React, { useState, useEffect } from 'react';
import { Navigation } from './Navigation';
import { ConcertFeed } from './ConcertFeed';
import { UnifiedFeed } from './UnifiedFeed';
import { UnifiedSearch } from './UnifiedSearch';
import { SearchMap } from './SearchMap';
import { ProfileView } from './ProfileView';
import { ProfileEdit } from './ProfileEdit';
import { ConcertEvents } from './ConcertEvents';
import { Event as EventCardEvent } from './EventCard';
import { WelcomeScreen } from './WelcomeScreen';
import Auth from '@/pages/Auth';
import { EventSeeder } from './EventSeeder';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

type ViewType = 'feed' | 'search' | 'profile' | 'profile-edit';

interface MainAppProps {
  onSignOut?: () => void;
}

export const MainApp = ({ onSignOut }: MainAppProps) => {
  const [currentView, setCurrentView] = useState<ViewType>('feed');
  const [events, setEvents] = useState<EventCardEvent[]>([]);
  const { toast } = useToast();
  const { user, session, loading, sessionExpired, signOut, resetSessionExpired } = useAuth();

  useEffect(() => {
    console.log('🚀 MainApp useEffect starting...');
    loadEvents();

    // Add keyboard shortcut for testing login (Ctrl/Cmd + L)
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'l') {
        event.preventDefault();
        console.log('🔐 Login shortcut triggered');
        setShowAuth(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle session expiration
  useEffect(() => {
    if (sessionExpired) {
      console.log('🔐 Session expired, redirecting to login');
      toast({
        title: "Session Expired",
        description: "Your session has expired. Please sign in again.",
        variant: "destructive",
      });
      // Clear any local state and show auth
      setCurrentView('feed');
      setShowAuth(true); // Force show auth modal
    }
  }, [sessionExpired, toast]);

  // Handle API key errors as session expiration
  useEffect(() => {
    const handleApiError = (event: CustomEvent) => {
      if (event.detail?.message?.includes('Invalid API key')) {
        console.log('🔐 API key error detected, treating as session expiration');
        setShowAuth(true);
        toast({
          title: "Configuration Error",
          description: "Please check your Supabase configuration and sign in again.",
          variant: "destructive",
        });
      }
    };

    window.addEventListener('api-error', handleApiError as EventListener);
    return () => window.removeEventListener('api-error', handleApiError as EventListener);
  }, [toast]);

  const [showAuth, setShowAuth] = useState(false);

  const handleGetStarted = () => {
    setShowAuth(true);
  };

  const handleForceLogin = () => {
    setShowAuth(true);
  };

  const handleAuthSuccess = async () => {
    setShowAuth(false);
    resetSessionExpired(); // Reset session expired state on successful login
  };

  const loadEvents = async () => {
    console.log('📅 Loading events...');
    try {
      // Check if session is expired before making any requests
      if (sessionExpired || !user) {
        console.log('Session expired or no user, skipping events load');
        return;
      }

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
    }
  };

  const handleEventSwipe = async (eventId: string, direction: 'like' | 'pass') => {
    if (!user?.id) return;

    try {
      if (direction === 'like') {
        // Add to user's interested events
        const { error } = await supabase
          .from('user_jambase_events')
          .insert({
            user_id: user.id,
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
    console.log('🔄 View changing from', currentView, 'to', view);
    setCurrentView(view);
  };

  const handleProfileEdit = () => {
    // Navigate to profile edit view
    console.log('Navigating to profile edit');
    setCurrentView('profile-edit');
  };

  const handleProfileSettings = () => {
    // For now, just show a toast - you can implement settings later
    toast({
      title: "Settings",
      description: "Settings feature coming soon!",
    });
  };

  const handleProfileSave = () => {
    // Navigate back to profile view after saving
    console.log('Profile saved, navigating back to profile view');
    setCurrentView('profile');
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setShowAuth(false); // Hide auth modal
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

  // Show auth modal if requested or session expired
  if (showAuth || sessionExpired) {
    console.log('🔐 Showing auth modal. showAuth:', showAuth, 'sessionExpired:', sessionExpired);
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  // Show welcome screen if no user
  if (!user?.id) {
    return <WelcomeScreen onGetStarted={handleGetStarted} onLogin={handleForceLogin} />;
  }

  // Show API key error banner only when there are actual API key issues
  const showApiKeyError = false; // Set to true if you want to force show the API key error banner

  const renderCurrentView = () => {
    console.log('🎨 Rendering current view:', currentView);
    switch (currentView) {
      case 'feed':
        return (
          <UnifiedFeed 
            currentUserId={user.id}
            onBack={handleBack}
            onViewChange={handleViewChange}
          />
        );
      case 'search':
        return (
          <div className="min-h-screen bg-background p-4 pb-20">
            <div className="max-w-4xl mx-auto">
              <div className="mb-6">
                <h1 className="synth-heading text-3xl">Search</h1>
                <p className="synth-text text-muted-foreground mt-2">Find events and connect with other music lovers</p>
              </div>
              
              {/* Search Component */}
              <div className="mb-6">
                <UnifiedSearch 
                  userId={user.id}
                />
              </div>
              
              {/* Map Component */}
              <div className="mb-6">
                <SearchMap userId={user.id} />
              </div>
            </div>
          </div>
        );
      case 'profile':
        return (
          <ProfileView
            currentUserId={user.id}
            onBack={handleBack}
            onEdit={handleProfileEdit}
            onSettings={handleProfileSettings}
            onSignOut={handleSignOut}
          />
        );
      case 'profile-edit':
        return (
          <ProfileEdit
            currentUserId={user.id}
            onBack={() => setCurrentView('profile')}
            onSave={handleProfileSave}
          />
        );
      default:
        return (
          <UnifiedFeed 
            currentUserId={user.id}
            onBack={handleBack}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* API Key Error Banner - Only show if there's actually an API key issue */}
      {showApiKeyError && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold">API Key Error Detected</p>
              <p className="text-sm">Your Supabase API key is invalid. Please check your configuration.</p>
            </div>
            <button 
              onClick={handleForceLogin}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
            >
              Go to Login
            </button>
          </div>
        </div>
      )}
      
      <div className="pb-16">
        {renderCurrentView()}
      </div>
      {/* Only show navigation when not in profile-edit mode and not in feed (feed handles its own nav) */}
      {currentView !== 'profile-edit' && currentView !== 'feed' && (
        <Navigation 
          currentView={currentView as 'search' | 'profile'} 
          onViewChange={handleViewChange} 
        />
      )}
    </div>
  );
};
