import React, { useState, useEffect } from 'react';
import { Navigation } from './Navigation';
import { ConcertFeed } from './events/ConcertFeed';
import { UnifiedFeed } from './UnifiedFeed';
import { SearchMap } from './SearchMap';
import { ProfileView } from './profile/ProfileView';
import { ProfileEdit } from './profile/ProfileEdit';
import { ConcertEvents } from './ConcertEvents';
import { Event as EventCardEvent } from './EventCard';
import Auth from '@/pages/Auth';
import { EventSeeder } from './EventSeeder';
import { SettingsModal } from './SettingsModal';
import { NotificationsPage } from './NotificationsPage';
import { UnifiedChatView } from './UnifiedChatView';
import { MyEventsManagementPanel } from './events/MyEventsManagementPanel';
import { OnboardingReminderBanner } from './onboarding/OnboardingReminderBanner';
import { OnboardingTour } from './onboarding/OnboardingTour';
import { OnboardingFlow } from './onboarding/OnboardingFlow';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { useAccountType } from '@/hooks/useAccountType';
import { OnboardingService } from '@/services/onboardingService';
import CreatorAnalyticsDashboard from '@/pages/Analytics/CreatorAnalyticsDashboard';
import BusinessAnalyticsDashboard from '@/pages/Analytics/BusinessAnalyticsDashboard';
import AdminAnalyticsDashboard from '@/pages/Analytics/AdminAnalyticsDashboard';
import { getFallbackEventImage } from '@/utils/eventImageFallbacks';
import { DiscoverView } from './discover/DiscoverView';
import { ConnectView } from './connect/ConnectView';
import { HomeFeed } from './home/HomeFeed';
import { streamingSyncService } from '@/services/streamingSyncService';
import { ToastAction } from '@/components/ui/toast';
import { EventReviewModal } from './EventReviewModal';
import { PermanentHeader } from './PermanentHeader';

type ViewType = 'feed' | 'search' | 'profile' | 'profile-edit' | 'notifications' | 'chat' | 'analytics' | 'events' | 'onboarding';

interface MainAppProps {
  onSignOut?: () => void;
}

export const MainApp = ({ onSignOut }: MainAppProps) => {
  const [currentView, setCurrentView] = useState<ViewType>('feed');
  const [events, setEvents] = useState<EventCardEvent[]>([]);
  const [profileUserId, setProfileUserId] = useState<string | undefined>(undefined);
  const [chatUserId, setChatUserId] = useState<string | undefined>(undefined);
  const [chatId, setChatId] = useState<string | undefined>(undefined);
  const [showOnboardingReminder, setShowOnboardingReminder] = useState(false);
  const [runTour, setRunTour] = useState(false);
  const { toast } = useToast();
  const { user, session, loading, sessionExpired, signOut, resetSessionExpired } = useAuth();
  const { accountInfo } = useAccountType();
  
  // Track user activity (updates last_active_at periodically)
  useActivityTracker();

  // Listen for streaming sync completion and show notification
  useEffect(() => {
    // Restore sync state on mount (in case page was reloaded during sync)
    streamingSyncService.restoreState();

    const unsubscribe = streamingSyncService.subscribe((syncState) => {
      if (syncState.status === 'completed' && syncState.serviceType) {
        const serviceName = syncState.serviceType === 'spotify' ? 'Spotify' : 'Apple Music';
        
        toast({
          title: "🎵 Stats Ready!",
          description: `Your ${serviceName} streaming stats have been synced and are ready to view.`,
          action: (
            <ToastAction
              altText="View stats"
              onClick={() => {
                window.location.href = '/streaming-stats';
                localStorage.setItem('intendedView', 'profile');
              }}
              className="bg-pink-500 hover:bg-pink-600 text-white"
            >
              View Stats
            </ToastAction>
          ),
        });

        // Clear sync state after showing notification
        setTimeout(() => {
          streamingSyncService.clearSync();
        }, 1000);
      } else if (syncState.status === 'error') {
        toast({
          title: "Sync Error",
          description: `Failed to sync your ${syncState.serviceType === 'spotify' ? 'Spotify' : 'Apple Music'} stats: ${syncState.error || 'Unknown error'}`,
          variant: "destructive",
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [toast]);

  // Check onboarding status on mount
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      if (!user) return;

      const status = await OnboardingService.checkOnboardingStatus(user.id);
      if (status) {
        // If user hasn't completed onboarding and hasn't skipped it, redirect to onboarding
        if (!status.onboarding_completed && !status.onboarding_skipped) {
          setCurrentView('onboarding');
        } else if (status.onboarding_skipped && !status.onboarding_completed) {
          // Show reminder banner if they skipped
          setShowOnboardingReminder(true);
        }
        // If onboarding is complete but tour is not, we'll trigger it after first navigation
      }
    };

    if (!loading && user) {
      checkOnboardingStatus();
    }
  }, [user, loading]);

  useEffect(() => {
    // MainApp useEffect starting
    loadEvents();

    // Check for URL fragment to determine initial view
    const hash = window.location.hash;
    if (hash === '#onboarding') {
      setCurrentView('onboarding');
      // Clear the hash to prevent re-triggering on refresh
      window.history.replaceState(null, '', window.location.pathname);
    } else if (hash === '#profile') {
      setCurrentView('profile');
      // Clear the hash to prevent re-triggering on refresh
      window.history.replaceState(null, '', window.location.pathname);
    }

    // Check for intended view from localStorage (for navigation from other pages)
    const intendedView = localStorage.getItem('intendedView');
    if (intendedView && ['feed', 'search', 'profile', 'onboarding'].includes(intendedView)) {
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
    
    // Listen for event details navigation
    const handleOpenEventDetails = (e: Event) => {
      const detail = (e as CustomEvent).detail as { event?: any; eventId?: string };
      if (detail?.event) {
        // Store the event data in localStorage for the feed to pick up
        localStorage.setItem('selectedEvent', JSON.stringify(detail.event));
        // Navigate to feed where the event modal will open
        setCurrentView('feed');
      }
    };
    
    window.addEventListener('open-user-profile', handleOpenUserProfile as EventListener);
    window.addEventListener('open-event-details', handleOpenEventDetails as EventListener);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-user-profile', handleOpenUserProfile as EventListener);
      window.removeEventListener('open-event-details', handleOpenEventDetails as EventListener);
    };
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
  const [showEventReviewModal, setShowEventReviewModal] = useState(false);

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
        .from('events')
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
        image: event.image || getFallbackEventImage(event.id || event.title || event.event_name || 'synth-event'),
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

  const handleNavigateToChat = (userIdOrChatId: string) => {
    // Check if this is a chatId (UUID format) or userId
    const isChatId = userIdOrChatId.includes('-') && userIdOrChatId.length === 36;
    
    if (isChatId) {
      // This is a group chat ID
      setChatId(userIdOrChatId);
      setChatUserId(undefined); // Clear direct chat
    } else {
      // This is a user ID for direct chat
      setChatUserId(userIdOrChatId);
      setChatId(undefined); // Clear group chat
    }
    setCurrentView('chat');
  };

  const handleOnboardingComplete = async () => {
    setCurrentView('feed');
    setShowOnboardingReminder(false);
    
    // Check if user should see the tour
    if (user) {
      const status = await OnboardingService.checkOnboardingStatus(user.id);
      if (status && !status.tour_completed) {
        // Delay tour start slightly so feed loads first
        setTimeout(() => setRunTour(true), 1000);
      }
    }
  };

  const handleTourFinish = () => {
    setRunTour(false);
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
      case 'onboarding':
        return <OnboardingFlow onComplete={handleOnboardingComplete} />;
      case 'feed':
        return (
          <HomeFeed
            currentUserId={user.id}
            onNavigateToNotifications={handleNavigateToNotifications}
            onNavigateToProfile={handleNavigateToProfile}
            onNavigateToChat={handleNavigateToChat}
            onViewChange={handleViewChange}
          />
        );
      case 'search':
        return (
          <DiscoverView
            currentUserId={user.id}
            onBack={handleBack}
            onNavigateToProfile={handleNavigateToProfile}
            onNavigateToChat={handleNavigateToChat}
            onNavigateToNotifications={handleNavigateToNotifications}
            onViewChange={handleViewChange}
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
            onNavigateToNotifications={handleNavigateToNotifications}
            onViewChange={handleViewChange}
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
          <UnifiedChatView
            currentUserId={user.id}
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
        
        console.log('🔍 MainApp: Account info for analytics:', accountInfo);
        console.log('🔍 MainApp: Account type:', accountInfo.account_type);
        
        switch (accountInfo.account_type) {
          case 'creator':
            console.log('🔍 MainApp: Rendering CreatorAnalyticsDashboard');
            return <CreatorAnalyticsDashboard />;
          case 'business':
            console.log('🔍 MainApp: Rendering BusinessAnalyticsDashboard');
            return <BusinessAnalyticsDashboard />;
          case 'admin':
            console.log('🔍 MainApp: Rendering AdminAnalyticsDashboard');
            return <AdminAnalyticsDashboard />;
          default:
            console.log('🔍 MainApp: Unknown account type, showing not available message');
            return (
              <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-gray-600">Analytics not available for your account type.</p>
                  <p className="text-sm text-gray-500 mt-2">Account type: {accountInfo.account_type}</p>
                </div>
              </div>
            );
        }
      case 'events':
        return (
          <div className="min-h-screen bg-gray-50 p-6">
            <MyEventsManagementPanel />
          </div>
        );
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

  // Don't show normal UI if in onboarding
  if (currentView === 'onboarding') {
    return renderCurrentView();
  }

  const showMainNav = ['feed', 'search', 'profile', 'chat'].includes(currentView);

  return (
    <div className="min-h-screen bg-background">
      {/* Permanent Header - shown on all pages */}
      <PermanentHeader
        currentUserId={user?.id || ''}
        onNavigateToNotifications={handleNavigateToNotifications}
      />

      {/* Onboarding Reminder Banner */}
      {showOnboardingReminder && (
        <OnboardingReminderBanner onComplete={() => setCurrentView('onboarding')} />
      )}

      {/* API Key Error Banner - Only show if there's actually an API key issue */}
      {showApiKeyError && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" style={{ marginTop: '59px' }}>
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
      
      <div className={showMainNav ? 'pt-[59px] pb-20' : 'pt-[59px] pb-16'}>
        {renderCurrentView()}
      </div>
      {/* Show bottom navigation for main pages (Discover, Connect, Share) */}
      {showMainNav && (
        <Navigation 
          currentView={currentView as 'feed' | 'search' | 'profile' | 'analytics' | 'events' | 'chat'} 
          onViewChange={handleViewChange}
          onOpenEventReview={() => setShowEventReviewModal(true)}
        />
      )}
      {/* Show bottom navigation for other pages (analytics, events, etc.) */}
      {!showMainNav && currentView !== 'profile-edit' && (
        <Navigation 
          currentView={currentView as 'search' | 'profile' | 'analytics' | 'events' | 'chat'} 
          onViewChange={handleViewChange}
          onOpenEventReview={() => setShowEventReviewModal(true)}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSignOut={handleSignOut}
        userEmail={user?.email}
      />

      {/* Event Review Modal */}
      {user?.id && (
        <EventReviewModal
          isOpen={showEventReviewModal}
          onClose={() => setShowEventReviewModal(false)}
          event={{ id: 'new-review' } as any} // Placeholder event for creating a new review
          userId={user.id}
          onReviewSubmitted={() => {
            setShowEventReviewModal(false);
            // Optionally refresh the current view
          }}
        />
      )}

      {/* Onboarding Tour */}
      <OnboardingTour run={runTour} onFinish={handleTourFinish} />
    </div>
  );
};
