import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { ShareWithFriendsBanner, isShareBannerDismissed } from './share/ShareWithFriendsBanner';
import { OnboardingTour } from './onboarding/OnboardingTour';
import { OnboardingFlow } from './onboarding/OnboardingFlow';
import { supabase } from '@/integrations/supabase/client';
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
import { EventReviewModal } from './EventReviewModal';
import { FriendTaggedReviewInviteModal, type PrefillEvent } from './reviews/FriendTaggedReviewInviteModal';
import { NotificationService } from '@/services/notificationService';
import { SynthLoadingScreen } from './ui/SynthLoader';
import { PushTokenService } from '@/services/pushTokenService';
import { UserEventService } from '@/services/userEventService';
import { ArtistDetailModal } from '@/components/discover/modals/ArtistDetailModal';
import { VenueDetailModal } from '@/components/discover/modals/VenueDetailModal';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { MobileHeader } from '@/components/Header/MobileHeader';
import { ShareService } from '@/services/shareService';
import { useLocation, useNavigate } from 'react-router-dom';

type ViewType =
  | 'feed'
  | 'search'
  | 'profile'
  | 'profile-edit'
  | 'notifications'
  | 'chat'
  | 'analytics'
  | 'events'
  | 'onboarding'
  | 'auth';

interface MainAppProps {
  onSignOut?: () => void;
}

type GlobalDetailModalState =
  | { open: false }
  | {
      open: true;
      type: 'artist';
      artistId: string;
      artistName: string;
    }
  | {
      open: true;
      type: 'venue';
      venueId: string;
      venueName: string;
    }
  | {
      open: true;
      type: 'profile';
      userId: string;
      userName: string;
    };

export const MainApp = ({ onSignOut }: MainAppProps) => {
  const [currentView, setCurrentView] = useState<ViewType>('feed');
  const [events, setEvents] = useState<EventCardEvent[]>([]);
  const [profileUserId, setProfileUserId] = useState<string | undefined>(undefined);
  const [notificationFilter, setNotificationFilter] = useState<'friends_only' | 'exclude_friends' | undefined>(undefined);
  const [chatUserId, setChatUserId] = useState<string | undefined>(undefined);
  const [chatId, setChatId] = useState<string | undefined>(undefined);
  const [showOnboardingReminder, setShowOnboardingReminder] = useState(false);
  const [showShareBanner, setShowShareBanner] = useState(() => !isShareBannerDismissed());
  const [runTour, setRunTour] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Trigger to refresh views when review is submitted
  const [isChatSelected, setIsChatSelected] = useState(false); // Track if a chat is selected in UnifiedChatView
  const { user, session, loading, sessionExpired, signOut, resetSessionExpired } = useAuth();
  const { accountInfo } = useAccountType();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Guard to prevent redirecting back into onboarding after skip/complete
  const onboardingExitInProgressRef = useRef(false);
  
  // Track user activity (updates last_active_at periodically)
  useActivityTracker();

  // Listen for streaming sync completion and show notification
  useEffect(() => {
    // Restore sync state on mount (in case page was reloaded during sync)
    streamingSyncService.restoreState();

    const unsubscribe = streamingSyncService.subscribe((syncState) => {
      if (syncState.status === 'completed' && syncState.serviceType) {
        // Clear sync state after completion
        setTimeout(() => {
          streamingSyncService.clearSync();
        }, 1000);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Check onboarding status on mount
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      if (!user) return;

      // Don't redirect to onboarding if exit is in progress
      if (onboardingExitInProgressRef.current) {
        return;
      }

      const status = await OnboardingService.checkOnboardingStatus(user.id);
      if (status) {
        // If onboarding_skipped is true, reset the guard after confirming it's persisted
        if (status.onboarding_skipped === true) {
          // Reset guard after confirming skip is persisted
          setTimeout(() => {
            onboardingExitInProgressRef.current = false;
          }, 2000);
        }

        // If user hasn't completed onboarding and hasn't skipped it, redirect to onboarding
        if (!status.onboarding_completed && !status.onboarding_skipped) {
          setCurrentView('onboarding');
        } else if (status.onboarding_skipped && !status.onboarding_completed) {
          // Show reminder banner if they skipped
          setShowOnboardingReminder(true);
          // Start tour if not completed (tour should start after skip too)
          if (!status.tour_completed && currentView === 'feed') {
            setTimeout(() => setRunTour(true), 1500);
          }
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

  // Check for unread friend-tagged-in-review notifications on login (popup on next login)
  useEffect(() => {
    if (!loading && user && !hasCheckedFriendTaggedInvite.current) {
      hasCheckedFriendTaggedInvite.current = true;
      NotificationService.getNotifications({
        type: 'friend_tagged_in_review',
        is_read: false,
        limit: 1,
      })
        .then(({ notifications }) => {
          const first = notifications[0];
          if (first) {
            setFriendTaggedInviteNotification(first);
            setShowFriendTaggedInviteModal(true);
          }
        })
        .catch(() => {});
    }
  }, [loading, user]);

  // Listen for open-review-invite (from NotificationsPage tap on friend_tagged_in_review)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && (detail as any).artist_id && (detail as any).venue_id) {
        setEventReviewPrefill({
          id: `invite-${(detail as any).review_id || 'tap'}`,
          artist_id: (detail as any).artist_id,
          artist_name: (detail as any).artist_name,
          venue_id: (detail as any).venue_id,
          venue_name: (detail as any).venue_name,
          event_date: (detail as any).event_date,
          attendees: (detail as any).attendees,
        });
        setShowEventReviewModal(true);
      }
    };
    window.addEventListener('open-review-invite', handler);
    return () => window.removeEventListener('open-review-invite', handler);
  }, []);

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

  // Handle hash-based entry (e.g. /#onboarding) without hard navigation
  useEffect(() => {
    const hash = location.hash;
    if (hash === '#onboarding') {
      setCurrentView('onboarding');
      // Clear the hash to prevent re-triggering on refresh
      navigate(`${location.pathname}${location.search}`, { replace: true });
    } else if (hash === '#profile') {
      setCurrentView('profile');
      // Clear the hash to prevent re-triggering on refresh
      navigate(`${location.pathname}${location.search}`, { replace: true });
    }
  }, [location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    // MainApp useEffect starting
    loadEvents();

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
      setCurrentView('feed');
      setShowAuth(true); // Force show auth modal
    }
  }, [sessionExpired]);

  // Handle API key errors as session expiration
  useEffect(() => {
    const handleApiError = (event: CustomEvent) => {
      if (event.detail?.message?.includes('Invalid API key')) {
        setShowAuth(true);
      }
    };

    window.addEventListener('api-error', handleApiError as EventListener);
    return () => window.removeEventListener('api-error', handleApiError as EventListener);
  }, []);

  const [showAuth, setShowAuth] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showEventReviewModal, setShowEventReviewModal] = useState(false);
  const [eventReviewPrefill, setEventReviewPrefill] = useState<PrefillEvent | null>(null);
  const [friendTaggedInviteNotification, setFriendTaggedInviteNotification] = useState<any>(null);
  const [showFriendTaggedInviteModal, setShowFriendTaggedInviteModal] = useState(false);
  const hasCheckedFriendTaggedInvite = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Global detail modal state shared across views (artist/venue + future profile popups)
  const [detailModal, setDetailModal] = useState<GlobalDetailModalState>({ open: false });
  // Track whether any EventDetailsModal is open anywhere in the app so we can
  // hide underlying page headers (Profile/Home/etc) and avoid double headers.
  const [isEventDetailsOpen, setIsEventDetailsOpen] = useState(false);
  // Event details when opened from venue modal (global VenueDetailModal)
  const [selectedEventFromVenue, setSelectedEventFromVenue] = useState<any>(null);
  const [eventDetailsFromVenueOpen, setEventDetailsFromVenueOpen] = useState(false);
  const [selectedEventFromVenueInterested, setSelectedEventFromVenueInterested] = useState(false);

  // Lock body scroll when menu is open
  useLockBodyScroll(menuOpen);

  const handleEventClickFromVenue = useCallback(async (eventId: string) => {
    if (!eventId || !user?.id) return;
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*, artists(name), venues(name)')
        .eq('id', eventId)
        .single();

      if (!error && data) {
        const normalizedEvent = {
          ...data,
          artist_name: (data.artists as any)?.name || data.artist_name || null,
          venue_name: (data.venues as any)?.name || data.venue_name || null,
        };
        setSelectedEventFromVenue(normalizedEvent);
        const interested = await UserEventService.isUserInterested(user.id, eventId);
        setSelectedEventFromVenueInterested(interested);
        setDetailModal({ open: false });
        setEventDetailsFromVenueOpen(true);
      }
    } catch (err) {
      console.error('Error opening event from venue:', err);
    }
  }, [user?.id]);

  // Listen globally so artist/venue modals open from anywhere (review pills, links, etc.)
  useEffect(() => {
    const openArtist = async (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      let artistId: string | null = detail.artistId || null;
      let artistName: string = detail.artistName || '';

      // If we have an ID but no name, resolve name for better modal UX.
      if (artistId && !artistName) {
        try {
          const { data } = await supabase.from('artists').select('name').eq('id', artistId).maybeSingle();
          if (data?.name) artistName = data.name;
        } catch {
          // Non-fatal; modal can still open with fallback name
        }
      }

      // If we don't have an ID, try resolving by name.
      if (!artistId && artistName) {
        try {
          const { data } = await supabase.from('artists').select('id, name').ilike('name', artistName).limit(1).maybeSingle();
          if (data?.id) artistId = data.id;
          if (data?.name) artistName = data.name;
        } catch {
          // Ignore
        }
      }

      if (artistId) {
        setDetailModal({
          open: true,
          type: 'artist',
          artistId,
          artistName: artistName || 'Artist',
        });
      }
    };

    const openVenue = async (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      let venueId: string | null = detail.venueId || null;
      let venueName: string = detail.venueName || '';

      if (venueId && !venueName) {
        try {
          const { data } = await supabase.from('venues').select('name').eq('id', venueId).maybeSingle();
          if (data?.name) venueName = data.name;
        } catch {
          // Non-fatal
        }
      }

      if (!venueId && venueName) {
        try {
          const { data } = await supabase.from('venues').select('id, name').ilike('name', venueName).limit(1).maybeSingle();
          if (data?.id) venueId = data.id;
          if (data?.name) venueName = data.name;
        } catch {
          // Ignore
        }
      }

      if (venueId) {
        setDetailModal({
          open: true,
          type: 'venue',
          venueId,
          venueName: venueName || 'Venue',
        });
      }
    };

    window.addEventListener('open-artist-card', openArtist as EventListener);
    window.addEventListener('open-venue-card', openVenue as EventListener);
    const handleEventDetailsOpen = () => setIsEventDetailsOpen(true);
    const handleEventDetailsClose = () => setIsEventDetailsOpen(false);
    window.addEventListener('event-details-open', handleEventDetailsOpen as EventListener);
    window.addEventListener('event-details-close', handleEventDetailsClose as EventListener);
    const handleOpenEventDetails = (e: Event) => {
      const detail = (e as CustomEvent).detail as { eventId?: string };
      if (detail?.eventId) {
        handleEventClickFromVenue(detail.eventId);
      }
    };
    window.addEventListener('open-event-details', handleOpenEventDetails as EventListener);
    return () => {
      window.removeEventListener('open-artist-card', openArtist as EventListener);
      window.removeEventListener('open-venue-card', openVenue as EventListener);
      window.removeEventListener('event-details-open', handleEventDetailsOpen as EventListener);
      window.removeEventListener('event-details-close', handleEventDetailsClose as EventListener);
      window.removeEventListener('open-event-details', handleOpenEventDetails as EventListener);
    };
  }, [handleEventClickFromVenue]);

  const handleForceLogin = () => {
    setShowAuth(true);
  };

  const handleAuthSuccess = async () => {
    setShowAuth(false);
    resetSessionExpired(); // Reset session expired state on successful login
    onboardingExitInProgressRef.current = false; // Re-enable onboarding redirects after auth
    if (currentView === 'auth') {
      setCurrentView('feed');
    }
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
    }
  };

  const handleEventSwipe = async (eventId: string, direction: 'like' | 'pass') => {
    if (!user?.id) return;

    try {
      if (direction === 'like') {
        await UserEventService.setEventInterest(user.id, eventId, true);
      }
    } catch (error) {
      // Error handling event swipe
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
    } catch (error: any) {
      // Error signing out
    }
  };

  const handleBack = () => {
    // Check if we came from profile when in chat
    if (currentView === 'chat') {
      const chatFromProfile = sessionStorage.getItem('chatFromProfile');
      const chatFromProfileUserId = sessionStorage.getItem('chatFromProfileUserId');
      if (chatFromProfile === 'true' && chatFromProfileUserId) {
        // Return to profile
        sessionStorage.removeItem('chatFromProfile');
        sessionStorage.removeItem('chatFromProfileUserId');
        setProfileUserId(chatFromProfileUserId);
        setCurrentView('profile');
        setChatUserId(undefined);
        return;
      }
    }
    
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
        return;
      }

      if (eventData) {
        const normalizedEvent = {
          ...eventData,
          artist_name: (eventData.artists?.name) || null,
          venue_name: (eventData.venues?.name) || null,
        };
        localStorage.setItem('selectedEvent', JSON.stringify(normalizedEvent));
        setCurrentView('feed');
        window.dispatchEvent(new CustomEvent('open-event-details', {
          detail: { event: normalizedEvent }
        }));
      }
    } catch (error) {
      console.error('Error navigating to event:', error);
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
    // Set guard to prevent immediate redirect back to onboarding
    onboardingExitInProgressRef.current = true;
    
    setCurrentView('feed');
    setShowOnboardingReminder(false);
    // Ensure we're on home route without full reload (also clears any lingering hash)
    navigate('/', { replace: true });
    
    // Check if user should see the tour (works for both completed and skipped)
    if (user) {
      const status = await OnboardingService.checkOnboardingStatus(user.id);
      if (status && !status.tour_completed) {
        // Delay tour start slightly so feed loads first
        setTimeout(() => setRunTour(true), 1000);
      }
      
      // Reset guard after 3 seconds or after confirming status is persisted
      setTimeout(() => {
        onboardingExitInProgressRef.current = false;
      }, 3000);
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
      case 'auth':
        return <Auth onAuthSuccess={handleAuthSuccess} />;
      case 'onboarding':
        return (
          <OnboardingFlow
            onComplete={handleOnboardingComplete}
            onExit={() => {
              onboardingExitInProgressRef.current = true;
              setCurrentView('auth');
            }}
          />
        );
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
            hideHeader={
              (detailModal.open &&
                (detailModal.type === 'artist' || detailModal.type === 'venue')) ||
              isEventDetailsOpen
            }
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
            onNavigateToDiscover={profileUserId ? () => setCurrentView('search') : undefined}
            menuOpen={menuOpen}
            onMenuClick={handleMenuToggle}
            hideHeader={
              (detailModal.open &&
                (detailModal.type === 'artist' || detailModal.type === 'venue')) ||
              isEventDetailsOpen
            }
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
            onNavigateToChat={handleNavigateToChat}
            onNavigateToDiscover={() => setCurrentView('search')}
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

  // Don't show normal UI if in onboarding/auth landing
  if (currentView === 'onboarding' || currentView === 'auth') {
    return renderCurrentView();
  }

  const showMainNav = ['feed', 'search', 'profile', 'chat'].includes(currentView);
  // When a global artist/venue detail modal is open (for example, opened from a review),
  // we don't want any bottom nav tab to appear selected. We reuse the 'onboarding' view
  // here because BottomNavAdapter does not mark any tab as active for that value.
  const navViewForBottomNav: ViewType =
    detailModal.open && (detailModal.type === 'artist' || detailModal.type === 'venue')
      ? 'onboarding'
      : currentView;
  
  // Hide header and bottom nav when review modal is open
  const hideNavigation = showEventReviewModal;

  const isGlobalArtistOrVenueOpen =
    detailModal.open && (detailModal.type === 'artist' || detailModal.type === 'venue');

  const handleCloseGlobalDetail = () => {
    setDetailModal({ open: false });
  };

  const handleShareGlobalDetail = async () => {
    if (!detailModal.open) return;
    try {
      if (detailModal.type === 'artist') {
        await ShareService.shareArtist(
          detailModal.artistId,
          `${detailModal.artistName} on Synth`,
          `Check out ${detailModal.artistName} on Synth.`
        );
      } else if (detailModal.type === 'venue') {
        await ShareService.shareVenue(
          detailModal.venueId,
          `${detailModal.venueName} on Synth`,
          `Check out ${detailModal.venueName} on Synth.`
        );
      }
    } catch (error) {
      console.error('Error sharing detail:', error);
    }
  };

  return (
    <div 
      className="min-h-screen"
      style={{
        paddingBottom: 'max(5rem, calc(5rem + env(safe-area-inset-bottom, 0px)))',
        backgroundColor: 'var(--neutral-50)',
        // Set CSS variable for top banner height (onboarding + share) so MobileHeader positions below it
        '--onboarding-banner-height': !hideNavigation
          ? `${(showOnboardingReminder ? 60 : 0) + (showShareBanner ? 56 : 0)}px`
          : '0px',
        // Set CSS variable for header padding-top: when banner is visible, no safe area padding needed
        // (banner already accounts for it); when banner is not visible, header needs safe area padding
        '--mobile-header-padding-top': showOnboardingReminder && !hideNavigation ? '0px' : 'env(safe-area-inset-top, 0px)',
      } as React.CSSProperties}
    >
      {/* Onboarding Reminder Banner */}
      {showOnboardingReminder && !hideNavigation && (
        <OnboardingReminderBanner
          onComplete={() => setCurrentView('onboarding')}
          onDismiss={() => setShowOnboardingReminder(false)}
        />
      )}
      {/* Share with friends banner (dismissible, site-wide) */}
      {showShareBanner && !hideNavigation && (
        <div style={{ position: 'fixed', top: showOnboardingReminder ? 60 : 0, left: 0, right: 0, zIndex: 59 }}>
          <ShareWithFriendsBanner onDismiss={() => setShowShareBanner(false)} />
        </div>
      )}

      {/* Global Discover-style header for artist/venue detail modals opened from anywhere */}
      {isGlobalArtistOrVenueOpen && (
        <MobileHeader
          alignLeft={true}
          leftIcon="left"
          onLeftIconClick={handleCloseGlobalDetail}
          rightButton={
            <button
              className="mobile-header__menu-button"
              onClick={handleShareGlobalDetail}
              aria-label="Share"
              type="button"
            >
              <span
                style={{
                  display: 'inline-flex',
                  width: 24,
                  height: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--neutral-900)',
                }}
              >
                {/* Using an inline SVG here to avoid additional icon imports */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              </span>
            </button>
          }
        >
          <h1
            className="font-bold truncate"
            style={{
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-h2-size, 24px)',
              fontWeight: 'var(--typography-h2-weight, 700)',
              lineHeight: 'var(--typography-h2-line-height, 1.3)',
              color: 'var(--neutral-900)',
            }}
          >
            {detailModal.type === 'artist'
              ? detailModal.artistName
              : detailModal.type === 'venue'
              ? detailModal.venueName
              : ''}
          </h1>
        </MobileHeader>
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

      <div style={{ backgroundColor: 'transparent' }}>
        {renderCurrentView()}
      </div>

      {/* Global Artist/Venue Detail Modals */}
      {user?.id && detailModal.open && detailModal.type === 'artist' && detailModal.artistId && (
        <ArtistDetailModal
          isOpen={detailModal.open}
          onClose={handleCloseGlobalDetail}
          artistId={detailModal.artistId}
          artistName={detailModal.artistName || 'Artist'}
          currentUserId={user.id}
        />
      )}
      {user?.id && detailModal.open && detailModal.type === 'venue' && detailModal.venueId && (
        <VenueDetailModal
          isOpen={detailModal.open}
          onClose={handleCloseGlobalDetail}
          venueId={detailModal.venueId}
          venueName={detailModal.venueName || 'Venue'}
          currentUserId={user.id}
          onEventClick={handleEventClickFromVenue}
        />
      )}

      {/* Event Details Modal (opened from global venue modal event cards) */}
      {eventDetailsFromVenueOpen && selectedEventFromVenue && user?.id && (
        <EventDetailsModal
          isOpen={eventDetailsFromVenueOpen}
          onClose={() => {
            setEventDetailsFromVenueOpen(false);
            setSelectedEventFromVenue(null);
          }}
          event={selectedEventFromVenue}
          currentUserId={user.id}
          isInterested={selectedEventFromVenueInterested}
          onInterestToggle={async (eventId, interested) => {
            try {
              await UserEventService.setEventInterest(user.id, eventId, interested);
              setSelectedEventFromVenueInterested(interested);
            } catch (error) {
              console.error('Error toggling interest:', error);
            }
          }}
          onNavigateToProfile={handleNavigateToProfile}
          onNavigateToChat={handleNavigateToChat}
        />
      )}

      {/* New Bottom Navigation - replaces old Navigation */}
      {/* Show bottom nav on messages list, but hide when a chat is selected */}
      {!hideNavigation && showMainNav && (currentView !== 'chat' || !isChatSelected) && (
        <BottomNavAdapter 
          currentView={navViewForBottomNav}
          onViewChange={handleViewChange}
          onOpenEventReview={() => setShowEventReviewModal(true)}
          profileUserId={profileUserId}
        />
      )}
      {!hideNavigation && !showMainNav && currentView !== 'profile-edit' && (currentView !== 'chat' || !isChatSelected) && (
        <BottomNavAdapter 
          currentView={navViewForBottomNav}
          onViewChange={handleViewChange}
          onOpenEventReview={() => setShowEventReviewModal(true)}
          profileUserId={profileUserId}
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

      {/* Friend Tagged in Review Invite Modal - shows on login when user was tagged */}
      {friendTaggedInviteNotification && (
        <FriendTaggedReviewInviteModal
          notification={friendTaggedInviteNotification}
          isOpen={showFriendTaggedInviteModal}
          onClose={async () => {
            const notifId = friendTaggedInviteNotification?.id;
            setShowFriendTaggedInviteModal(false);
            setFriendTaggedInviteNotification(null);
            if (notifId) {
              try {
                await NotificationService.markAsRead(notifId);
              } catch {}
            }
          }}
          onWriteReview={(prefillEvent) => {
            const notifId = friendTaggedInviteNotification?.id;
            setEventReviewPrefill(prefillEvent);
            setShowEventReviewModal(true);
            setShowFriendTaggedInviteModal(false);
            setFriendTaggedInviteNotification(null);
            if (notifId) {
              NotificationService.markAsRead(notifId).catch(() => {});
            }
          }}
        />
      )}

      {/* Event Review Modal */}
      {user?.id && (
        <EventReviewModal
          isOpen={showEventReviewModal}
          onClose={() => {
            setShowEventReviewModal(false);
            setEventReviewPrefill(null);
          }}
          event={(eventReviewPrefill || { id: 'new-review' }) as any}
          userId={user.id}
          onReviewSubmitted={() => {
            setShowEventReviewModal(false);
            setEventReviewPrefill(null);
            // Trigger refresh of profile and feed views
            setRefreshTrigger((prev) => prev + 1);
          }}
        />
      )}

      {/* Onboarding Tour */}
      <OnboardingTour run={runTour} onFinish={handleTourFinish} onViewChange={handleViewChange} />
    </div>
  );
};
