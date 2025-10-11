import React, { useState, useEffect } from 'react';
import { Navigation } from './Navigation';
import { ConcertFeed } from './ConcertFeed';
import { UnifiedFeed } from './UnifiedFeed';
import { UnifiedSearch } from './UnifiedSearch';
import { SearchMap } from './SearchMap';
import { RedesignedSearchPage } from './search/RedesignedSearchPage';
import { ProfileView } from './profile/ProfileView';
import { ProfileEdit } from './ProfileEdit';
import { ConcertEvents } from './ConcertEvents';
import { Event as EventCardEvent } from './EventCard';
import Auth from '@/pages/Auth';
import { EventSeeder } from './EventSeeder';
import { SettingsModal } from './SettingsModal';
import { NotificationsPage } from './NotificationsPage';
import { ChatView } from './ChatView';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { useAccountType } from '@/hooks/useAccountType';
import CreatorAnalyticsDashboard from '@/pages/Analytics/CreatorAnalyticsDashboard';
import BusinessAnalyticsDashboard from '@/pages/Analytics/BusinessAnalyticsDashboard';
import AdminAnalyticsDashboard from '@/pages/Analytics/AdminAnalyticsDashboard';

type ViewType = 'feed' | 'search' | 'profile' | 'profile-edit' | 'notifications' | 'chat' | 'analytics';

interface MainAppProps {
  onSignOut?: () => void;
}

export const MainApp = ({ onSignOut }: MainAppProps) => {
  const [currentView, setCurrentView] = useState<ViewType>('feed');
  const [events, setEvents] = useState<EventCardEvent[]>([]);
  const [profileUserId, setProfileUserId] = useState<string | undefined>(undefined);
  const [chatUserId, setChatUserId] = useState<string | undefined>(undefined);
  const { toast } = useToast();
  const { user, session, loading, sessionExpired, signOut, resetSessionExpired } = useAuth();
  const { accountInfo } = useAccountType();
  
  // Track user activity (updates last_active_at periodically)
  useActivityTracker();

  useEffect(() => {
    // MainApp useEffect starting
    loadEvents();

    // Check for URL fragment to determine initial view
    const hash = window.location.hash;
    if (hash === '#profile') {
      setCurrentView('profile');
      // Clear the hash to prevent re-triggering on refresh
      window.history.replaceState(null, '', window.location.pathname);
    }

    // Check for intended view from localStorage (for navigation from other pages)
    const intendedView = localStorage.getItem('intendedView');
    if (intendedView && ['feed', 'search', 'profile'].includes(intendedView)) {
      setCurrentView(intendedView as ViewType);
      // Clear the intended view to prevent re-triggering
      localStorage.removeItem('intendedView');
    }

    // Add keyboard shortcut for testing login (Ctrl/Cmd + L)
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'l') {
        event.preventDefault();
        // Login shortcut triggered
        setShowAuth(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Listen for unified search user-profile navigation
    const handleOpenUserProfile = (e: Event) => {
      const detail = (e as CustomEvent).detail as { userId?: string };
      if (detail?.userId) {
        setProfileUserId(detail.userId);
        setCurrentView('profile');
      }
    };
    window.addEventListener('open-user-profile', handleOpenUserProfile as EventListener);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle session expiration
  useEffect(() => {
    if (sessionExpired) {
      // Session expired, redirecting to login
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
        // API key error detected, treating as session expiration
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
  const [showSettings, setShowSettings] = useState(false);

  const handleForceLogin = () => {
    setShowAuth(true);
  };

  const handleAuthSuccess = async () => {
    setShowAuth(false);
    resetSessionExpired(); // Reset session expired state on successful login
  };

  const loadEvents = async () => {
    // Loading events
    try {
      // Check if session is expired before making any requests
      if (sessionExpired || !user) {
        // Session expired or no user, skipping events load
        return;
      }

      const { data, error } = await supabase
        .from('jambase_events')
        .select('*')
        .order('event_date', { ascending: true });

      if (error) throw error;
      // Events loaded
      
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
      // Error loading events
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
      // Error handling event swipe
      toast({
        title: "Error",
        description: "Failed to process your action",
        variant: "destructive",
      });
    }
  };

  const handleViewChange = (view: ViewType) => {
    // View changing
    setCurrentView(view);
    
    // Special handling for profile navigation
    if (view === 'profile') {
      // If we're already on profile and clicking profile again, go to own profile
      if (currentView === 'profile') {
        setProfileUserId(undefined); // Clear to show own profile
      }
    } else {
      // Clear profileUserId when navigating away from profile
      setProfileUserId(undefined);
    }
    
    // Clear chatUserId when navigating away from chat
    if (view !== 'chat') {
      setChatUserId(undefined);
    }
  };

  const handleProfileEdit = () => {
    // Navigate to profile edit view
    // Navigating to profile edit
    setCurrentView('profile-edit');
  };

  const handleProfileSettings = () => {
    setShowSettings(true);
  };

  const handleProfileSave = () => {
    // Navigate back to profile view after saving
    // Profile saved, navigating back to profile view
    setCurrentView('profile');
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setShowAuth(false); // Hide auth modal
      setShowSettings(false); // Hide settings modal
      toast({
        title: "Signed out",
        description: "You've been successfully signed out.",
      });
    } catch (error: any) {
      // Error signing out
      toast({
        title: "Error",
        description: "Failed to sign out. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleBack = () => {
    setCurrentView('feed');
    // Clear chatUserId when going back to feed
    setChatUserId(undefined);
  };

  const handleNavigateToNotifications = () => {
    setCurrentView('notifications');
  };

  const handleNavigateToProfile = (userId: string) => {
    setProfileUserId(userId);
    setCurrentView('profile');
  };

  const handleNavigateToChat = (userId: string) => {
    setChatUserId(userId);
    setCurrentView('chat');
  };



  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10">
        <div className="text-center space-y-6">
          <div className="w-32 h-32 mx-auto">
            <img
              src="/Logos/Main logo black background.png"
              alt="Synth Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Show auth if no user, session expired, or auth requested
  if (showAuth || sessionExpired || !user?.id) {
    // Showing auth modal
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  // Show API key error banner only when there are actual API key issues
  const showApiKeyError = false; // Set to true if you want to force show the API key error banner

  const renderCurrentView = () => {
    // Rendering current view
    switch (currentView) {
      case 'feed':
        return (
          <UnifiedFeed 
            currentUserId={user.id}
            onBack={handleBack}
            onViewChange={handleViewChange}
            onNavigateToNotifications={handleNavigateToNotifications}
            onNavigateToProfile={handleNavigateToProfile}
            onNavigateToChat={handleNavigateToChat}
          />
        );
      case 'search':
        return (
          <RedesignedSearchPage 
            userId={user.id}
            onNavigateToProfile={handleNavigateToProfile}
            onNavigateToChat={handleNavigateToChat}
          />
        );
      case 'profile':
        return (
          <ProfileView
            currentUserId={user.id}
            profileUserId={profileUserId}
            onBack={handleBack}
            onEdit={handleProfileEdit}
            onSettings={handleProfileSettings}
            onSignOut={handleSignOut}
            onNavigateToProfile={handleNavigateToProfile}
            onNavigateToChat={handleNavigateToChat}
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
      case 'notifications':
        return (
          <NotificationsPage
            currentUserId={user.id}
            onBack={handleBack}
          />
        );
      case 'chat':
        return (
          <ChatView
            currentUserId={user.id}
            chatUserId={chatUserId}
            onBack={handleBack}
          />
        );
      case 'analytics':
        // Render the appropriate analytics dashboard based on account type
        if (!accountInfo) {
          return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
              <div className="text-center">
                <p className="text-gray-600">Loading account information...</p>
              </div>
            </div>
          );
        }
        
        switch (accountInfo.account_type) {
          case 'creator':
            return <CreatorAnalyticsDashboard />;
          case 'business':
            return <BusinessAnalyticsDashboard />;
          case 'admin':
            return <AdminAnalyticsDashboard />;
          default:
            return (
              <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-gray-600">Analytics not available for your account type.</p>
                </div>
              </div>
            );
        }
      default:
        return (
          <UnifiedFeed 
            currentUserId={user.id}
            onBack={handleBack}
            onViewChange={handleViewChange}
            onNavigateToNotifications={handleNavigateToNotifications}
            onNavigateToProfile={handleNavigateToProfile}
            onNavigateToChat={handleNavigateToChat}
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
          currentView={currentView as 'search' | 'profile' | 'analytics'} 
          onViewChange={handleViewChange}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSignOut={handleSignOut}
        userEmail={user?.email}
      />
    </div>
  );
};
