import React, { useState, useEffect } from 'react';
import { SideMenu } from '@/components/SideMenu/SideMenu';
import { BottomNavAdapter } from './BottomNavAdapter';
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll';
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
import { SynthLoadingScreen } from './ui/SynthLoader';
import { PushTokenService } from '@/services/pushTokenService';
import { UserEventService } from '@/services/userEventService';

type ViewType = 'feed' | 'search' | 'profile' | 'profile-edit' | 'notifications' | 'chat' | 'analytics' | 'events' | 'onboarding';

interface MainAppProps {
  onSignOut?: () => void;
}

export const MainApp = ({ onSignOut }: MainAppProps) => {
  const [currentView, setCurrentView] = useState<ViewType>('feed');
  const [events, setEvents] = useState<EventCardEvent[]>([]);
  const [profileUserId, setProfileUserId] = useState<string | undefined>(undefined);
  const [notificationFilter, setNotificationFilter] = useState<'friends_only' | 'exclude_friends' | undefined>(undefined);
  const [chatUserId, setChatUserId] = useState<string | undefined>(undefined);
  const [chatId, setChatId] = useState<string | undefined>(undefined);
  const [showOnboardingReminder, setShowOnboardingReminder] = useState(false);
  const [runTour, setRunTour] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Trigger to refresh views when review is submitted
  const [isChatSelected, setIsChatSelected] = useState(false); // Track if a chat is selected in UnifiedChatView
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
              className=""
              style={{ backgroundColor: 'var(--brand-pink-500)', color: 'var(--neutral-50)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--brand-pink-600)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--brand-pink-500)'; }}
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
        } else if (status.onboarding_completed && !status.tour_completed) {
          // If onboarding is complete but tour is not, trigger it after a short delay
          // Only trigger if we're already on the feed view (not onboarding)
          if (currentView === 'feed') {
            setTimeout(() => setRunTour(true), 1500);
          }
        }
      }
    };

    if (!loading && user) {
      checkOnboardingStatus();
    }
  }, [user, loading, currentView]);

  // Initialize push notifications when user is authenticated
  useEffect(() => {
    if (!loading && user) {
      // Initialize push notifications (only on native platforms)
      PushTokenService.initialize().catch((error) => {
        console.error('Failed to initialize push notifications:', error);
      });
    }

    // Cleanup on unmount or logout
    return () => {
      if (!user) {
        PushTokenService.cleanup().catch((error) => {
          console.error('Failed to cleanup push notifications:', error);
        });
      }
    };
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
    const handleOpenEventDetails = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { event?: any; eventId?: string };
      if (detail?.event) {
        // Store the event data in localStorage for the feed to pick up
        localStorage.setItem('selectedEvent', JSON.stringify(detail.event));
        // Navigate to feed where the event modal will open
        setCurrentView('feed');
      } else if (detail?.eventId) {
        // If only eventId is provided, fetch the event first
        try {
          const { data: eventData, error } = await supabase
            .from('events')
            .select('*')
            .eq('id', detail.eventId)
            .single();

          if (eventData && !error) {
            localStorage.setItem('selectedEvent', JSON.stringify(eventData));
            setCurrentView('feed');
          }
        } catch (error) {
          console.error('Error fetching event:', error);
        }
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
  const [menuOpen, setMenuOpen] = useState(false);

  // Lock body scroll when menu is open
  useLockBodyScroll(menuOpen);

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
        await UserEventService.setEventInterest(user.id, eventId, true);

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

  // Scroll to top whenever the view changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentView]);

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
    // Use browser history navigation if available, otherwise fallback to feed
    // This allows back button to return to previous screen instead of always going to feed
    if (window.history.length > 1) {
      window.history.back();
    } else {
    setCurrentView('feed');
    // Clear chatUserId when going back to feed
    setChatUserId(undefined);
    }
  };

  const handleNavigateToNotifications = (filter?: 'friends_only' | 'exclude_friends') => {
    setNotificationFilter(filter);
    setCurrentView('notifications');
  };

  const handleNavigateToEvent = async (eventId: string) => {
    try {
      // Fetch event data from database using events table with JOINs to get normalized artist/venue names via foreign keys
      const { data: eventData, error } = await supabase
        .from('events')
        .select('*, artists(name), venues(name)')
        .eq('id', eventId)
        .single();

      if (error) {
        console.error('Error fetching event:', error);
        toast({
          title: "Error",
          description: "Failed to load event details",
          variant: "destructive",
        });
        return;
      }

      if (eventData) {
        // Normalize the event data to include artist_name and venue_name from JOINed data
        const normalizedEvent = {
          ...eventData,
          artist_name: (eventData.artists?.name) || null,
          venue_name: (eventData.venues?.name) || null,
        };
        // Store the event data in localStorage for the feed to pick up
        localStorage.setItem('selectedEvent', JSON.stringify(normalizedEvent));
        // Navigate to feed where the event modal will open
        // The HomeFeed useEffect will detect this and open the modal
        setCurrentView('feed');
        // Also dispatch custom event as backup mechanism
        window.dispatchEvent(new CustomEvent('open-event-details', { 
          detail: { event: normalizedEvent } 
        }));
      }
    } catch (error) {
      console.error('Error navigating to event:', error);
      toast({
        title: "Error",
        description: "Failed to load event",
        variant: "destructive",
      });
    }
  };

  const handleNavigateToArtist = (artistId: string) => {
    // Dispatch custom event to open artist detail modal (works in both web and mobile)
    window.dispatchEvent(new CustomEvent('open-artist-card', {
      detail: {
        artistId: artistId,
        artistName: artistId // Will be resolved by the modal
      }
    }));
  };

  const handleNavigateToVenue = (venueName: string) => {
    // Dispatch custom event to open venue detail modal (works in both web and mobile)
    window.dispatchEvent(new CustomEvent('open-venue-card', {
      detail: {
        venueId: venueName,
        venueName: venueName
      }
    }));
  };

  const handleNavigateToProfile = (userId?: string, tab?: 'timeline' | 'interested') => {
    setCurrentView('profile');
    if (tab) {
      sessionStorage.setItem('profileTab', tab);
    } else {
      sessionStorage.removeItem('profileTab');
    }
    setProfileUserId(userId);
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
    setIsChatSelected(false); // Reset chat selected state when navigating to chat view
  };

  const handleMenuToggle = () => {
    setMenuOpen(!menuOpen);
  };

  const handleMenuClose = () => {
    setMenuOpen(false);
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
    return <SynthLoadingScreen text="Loading Synth..." />;
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
            onNavigateToEvent={handleNavigateToEvent}
            onNavigateToArtist={handleNavigateToArtist}
            onNavigateToVenue={handleNavigateToVenue}
            onNavigateToChat={handleNavigateToChat}
            onViewChange={handleViewChange}
            menuOpen={menuOpen}
            onMenuClick={handleMenuToggle}
            refreshTrigger={refreshTrigger}
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
            menuOpen={menuOpen}
            onMenuClick={handleMenuToggle}
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
            menuOpen={menuOpen}
            onMenuClick={handleMenuToggle}
            refreshTrigger={refreshTrigger}
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
            onBack={() => setCurrentView('feed')}
            onNavigateToProfile={handleNavigateToProfile}
            onNavigateToEvent={handleNavigateToEvent}
            onNavigateToArtist={handleNavigateToArtist}
            onNavigateToVenue={handleNavigateToVenue}
            filter={notificationFilter}
          />
        );
      case 'chat':
        return (
          <UnifiedChatView
            currentUserId={user.id}
            onBack={handleBack}
            menuOpen={menuOpen}
            onMenuClick={handleMenuToggle}
            hideHeader={hideNavigation}
            onChatSelected={setIsChatSelected}
          />
        );
      case 'analytics':
        // Render the appropriate analytics dashboard based on account type
        if (!accountInfo) {
            return (
              <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--neutral-50)', paddingBottom: 'var(--spacing-bottom-nav, 32px)' }}>
                <div className="text-center">
                  <p style={{ color: 'var(--neutral-600)' }}>Loading account information...</p>
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
              <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--neutral-50)', paddingBottom: 'var(--spacing-bottom-nav, 32px)' }}>
                <div className="text-center">
                  <p style={{ color: 'var(--neutral-600)' }}>Analytics not available for your account type.</p>
                  <p style={{ 
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)',
                    color: 'var(--neutral-600)',
                    marginTop: 'var(--spacing-small, 12px)'
                  }}>Account type: {accountInfo.account_type}</p>
                </div>
              </div>
            );
        }
      case 'events':
        return (
          <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--neutral-50)', paddingBottom: 'var(--spacing-bottom-nav, 32px)' }}>
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
  
  // Hide header and bottom nav when review modal is open
  const hideNavigation = showEventReviewModal;

  return (
    <div 
      className="min-h-screen"
      style={{
        paddingBottom: 'max(5rem, calc(5rem + env(safe-area-inset-bottom, 0px)))',
        backgroundColor: 'var(--neutral-50)',
        // Set CSS variable for onboarding banner height so MobileHeader can position below it
        '--onboarding-banner-height': showOnboardingReminder && !hideNavigation ? '60px' : '0px',
        // Set CSS variable for header padding-top: when banner is visible, no safe area padding needed
        // (banner already accounts for it); when banner is not visible, header needs safe area padding
        '--mobile-header-padding-top': showOnboardingReminder && !hideNavigation ? '0px' : 'env(safe-area-inset-top, 0px)',
      } as React.CSSProperties}
    >
      {/* Onboarding Reminder Banner */}
      {showOnboardingReminder && !hideNavigation && (
        <OnboardingReminderBanner onComplete={() => setCurrentView('onboarding')} />
      )}

      {/* API Key Error Banner - Only show if there's actually an API key issue */}
      {showApiKeyError && !hideNavigation && (
        <div 
          className="border-l-4 p-4 mb-4" 
          style={{ 
            backgroundColor: 'var(--status-error-050)', 
            borderColor: 'var(--status-error-500)', 
            color: 'var(--status-error-500)',
            marginTop: 'env(safe-area-inset-top, 0px)'
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold">API Key Error Detected</p>
              <p className="text-sm">Your Supabase API key is invalid. Please check your configuration.</p>
            </div>
            <button 
              onClick={handleForceLogin}
              className="px-4 py-2 rounded"
              style={{ backgroundColor: 'var(--status-error-500)', color: 'var(--neutral-50)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--status-error-500)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--status-error-500)'; }}
            >
              Go to Login
            </button>
          </div>
        </div>
      )}
      
      <main style={{ backgroundColor: 'transparent' }}>
        {renderCurrentView()}
      </main>

      {/* New Bottom Navigation - replaces old Navigation */}
      {/* Show bottom nav on messages list, but hide when a chat is selected */}
      {!hideNavigation && showMainNav && (currentView !== 'chat' || !isChatSelected) && (
        <BottomNavAdapter 
          currentView={currentView}
          onViewChange={handleViewChange}
          onOpenEventReview={() => setShowEventReviewModal(true)}
        />
      )}
      {!hideNavigation && !showMainNav && currentView !== 'profile-edit' && (currentView !== 'chat' || !isChatSelected) && (
        <BottomNavAdapter 
          currentView={currentView}
          onViewChange={handleViewChange}
          onOpenEventReview={() => setShowEventReviewModal(true)}
        />
      )}

      {/* New Side Menu */}
      <SideMenu
        isOpen={menuOpen}
        onClose={handleMenuClose}
        onToggle={handleMenuToggle}
        onNavigateToNotifications={handleNavigateToNotifications}
        onNavigateToProfile={handleNavigateToProfile}
        onNavigateToSettings={() => setShowSettings(true)}
        onNavigateToVerification={() => {
          handleNavigateToProfile(undefined, 'timeline');
        }}
        onSignOut={handleSignOut}
      />

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
            // Trigger refresh of profile and feed views
            setRefreshTrigger(prev => prev + 1);
          }}
        />
      )}

      {/* Onboarding Tour */}
      <OnboardingTour run={runTour} onFinish={handleTourFinish} onViewChange={handleViewChange} />
    </div>
  );
};
