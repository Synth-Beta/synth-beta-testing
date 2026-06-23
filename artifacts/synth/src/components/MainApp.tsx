import React, { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { SideMenu } from '@/components/SideMenu/SideMenu';
import { BottomNavAdapter } from './BottomNavAdapter';
import { WebAppShell } from '@/components/layout/WebAppShell';
import { WebDesktopRail } from '@/components/layout/WebDesktopRail';
import { useWebLayoutMode } from '@/hooks/useWebLayoutMode';
import { useMainNavItems, type MainNavCurrentView } from '@/hooks/useMainNavItems';
import { getWebDesktopMainContentClass, type MainAppViewForLayout } from '@/utils/webMainContentClass';
import { useMenuNotificationBadgeCount } from '@/hooks/useMenuNotificationBadgeCount';
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
import { SettingsModal, type SettingsModalView } from './SettingsModal';
import { NotificationsPage } from './NotificationsPage';
import { UnifiedChatView } from './UnifiedChatView';
import { MyEventsManagementPanel } from './events/MyEventsManagementPanel';
import { OnboardingReminderBanner } from './onboarding/OnboardingReminderBanner';
import { ShareWithFriendsBanner, isShareBannerDismissed } from './share/ShareWithFriendsBanner';
import { OnboardingTour } from './onboarding/OnboardingTour';
import { OnboardingFlow } from './onboarding/OnboardingFlow';
import { UsernameRequiredModal } from './onboarding/UsernameRequiredModal';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { useAccountType } from '@/hooks/useAccountType';
import { OnboardingService } from '@/services/onboardingService';
import CreatorAnalyticsDashboard from '@/pages/Analytics/CreatorAnalyticsDashboard';
import BusinessAnalyticsDashboard from '@/pages/Analytics/BusinessAnalyticsDashboard';
import AdminAnalyticsDashboard from '@/pages/Analytics/AdminAnalyticsDashboard';
import { StreamingStatsPage } from '@/pages/StreamingStatsPage';
import { getFallbackEventImage } from '@/utils/eventImageFallbacks';
import { DiscoverView } from './discover/DiscoverView';
import { ConnectView } from './connect/ConnectView';
import { HomeFeed } from './home/HomeFeed';
import { streamingSyncService } from '@/services/streamingSyncService';
import { runStreamingAutoSync } from '@/services/streamingAutoSyncService';
import { getStreamingLinkStatus } from '@/services/streamingConnectionService';
import { SynthLoadingScreen } from './ui/SynthLoader';
import { PushTokenService } from '@/services/pushTokenService';
import { UserEventService } from '@/services/userEventService';
import { MobileHeader } from '@/components/Header/MobileHeader';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchEventForModal } from '@/services/eventLookupService';
import { useEventDetailsFromVenue } from '@/hooks/useEventDetailsFromVenue';
import { useGlobalDetailModal } from '@/hooks/useGlobalDetailModal';
import { useEventReviewModals } from '@/hooks/useEventReviewModals';
import { useFriendCelebration } from '@/hooks/useFriendCelebration';
import { useShareDeepLink } from '@/hooks/useShareDeepLink';
import { GlobalDetailModals } from './GlobalDetailModals';
import { GlobalModals } from './GlobalModals';
import { toast } from '@/hooks/use-toast';

type ViewType =
  | 'feed'
  | 'search'
  | 'streaming-stats'
  | 'profile'
  | 'profile-edit'
  | 'settings'
  | 'notifications'
  | 'chat'
  | 'analytics'
  | 'events'
  | 'onboarding'
  | 'auth';

interface MainAppProps {
  onSignOut?: () => void;
}

export const MainApp = ({ onSignOut }: MainAppProps) => {
  const isIosNative =
  Capacitor.isNativePlatform() &&
  typeof Capacitor.getPlatform === 'function' &&
  Capacitor.getPlatform() === 'ios';
  const USE_NATIVE_NAV = true;
  const [currentView, setCurrentView] = useState<ViewType>('feed');
  const prevViewRef = useRef<ViewType>('feed');
  // Track whether the user has ever been authenticated in this session.
  // If true and then user === null, it means an explicit sign-out happened —
  // on iOS we should show the web login form rather than the loading screen.
  const hasEverHadUserRef = useRef(false);
  // Safety net: if no native session arrives within 8s, fall through to web login
  const [nativeAuthTimedOut, setNativeAuthTimedOut] = useState(false);
  const [events, setEvents] = useState<EventCardEvent[]>([]);
  const [profileUserId, setProfileUserId] = useState<string | undefined>(undefined);
  const [notificationFilter, setNotificationFilter] = useState<'friends_only' | 'exclude_friends' | undefined>(undefined);
  const [chatUserId, setChatUserId] = useState<string | undefined>(undefined);
  const [chatId, setChatId] = useState<string | undefined>(undefined);
  const [showOnboardingReminder, setShowOnboardingReminder] = useState(false);
  const [usernameRequired, setUsernameRequired] = useState<string | null>(null); // non-null = auto-generated username that needs replacing
  const [showShareBanner, setShowShareBanner] = useState(() => !isShareBannerDismissed());
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ type: 'artist' | 'venue'; id: string; name: string } | null>(null);
  const [runTour, setRunTour] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Trigger to refresh views when review is submitted
  const [isChatSelected, setIsChatSelected] = useState(false); // Track if a chat is selected in UnifiedChatView
  const { user, session, loading, sessionExpired, signOut, resetSessionExpired } = useAuth();
  const layoutMode = useWebLayoutMode();
  const menuNotificationBadgeCount = useMenuNotificationBadgeCount(user?.id);
  const webDesktopChrome = layoutMode === 'web-desktop';

  // Once the user is authenticated, remember it for this session so we can
  // detect an explicit sign-out later (vs. the initial unauthenticated load).
  useEffect(() => {
    if (user?.id) hasEverHadUserRef.current = true;
  }, [user?.id]);

  // On iOS: if the Swift layer never sends a session (e.g. expired native tokens),
  // give up waiting after 8s and show the web login form instead of loading forever.
  useEffect(() => {
    if (!isIosNative) return;
    const timer = setTimeout(() => setNativeAuthTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, [isIosNative]);
  const { accountInfo } = useAccountType();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Guard to prevent redirecting back into onboarding after skip/complete
  const onboardingExitInProgressRef = useRef(false);
  
  // Track user activity (updates last_active_at periodically)
  useActivityTracker();

  // --- Extracted hooks ---
  const {
    handleEventClickFromVenue,
    selectedEventFromVenue,
    setSelectedEventFromVenue,
    eventDetailsFromVenueOpen,
    setEventDetailsFromVenueOpen,
    selectedEventFromVenueInterested,
    setSelectedEventFromVenueInterested,
  } = useEventDetailsFromVenue(user?.id);

  const {
    detailModal,
    manualArtistDetail,
    isEventDetailsOpen,
    handleCloseGlobalDetail,
    handleShareGlobalDetail,
    closeManualArtistDetail,
    toggleManualArtistFollow,
  } = useGlobalDetailModal(user?.id, handleEventClickFromVenue);

  const {
    showEventReviewModal,
    setShowEventReviewModal,
    eventReviewPrefill,
    setEventReviewPrefill,
    friendTaggedInviteNotification,
    setFriendTaggedInviteNotification,
    showFriendTaggedInviteModal,
    setShowFriendTaggedInviteModal,
  } = useEventReviewModals(user?.id, loading);

  const { friendCelebration, setFriendCelebration } = useFriendCelebration();

  const hideNavigation = showEventReviewModal;
  const navViewForBottomNav: ViewType =
    detailModal.open && (detailModal.type === 'artist' || detailModal.type === 'venue')
      ? 'onboarding'
      : currentView;

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
  }, [isIosNative]);

  // Background streaming refresh when linked (weekly stale data + one-time migrations)
  useEffect(() => {
    if (!user?.id) return;

    void (async () => {
      try {
        const linkStatus = await getStreamingLinkStatus(user.id);
        if (!linkStatus.linked || linkStatus.provider === 'unknown') return;

        const serviceType = linkStatus.provider;
        const { data: row } = await supabase
          .from('streaming_profiles')
          .select('profile_data, last_updated')
          .eq('user_id', user.id)
          .eq('service_type', serviceType)
          .maybeSingle();

        await runStreamingAutoSync({
          userId: user.id,
          serviceType,
          profileData: (row?.profile_data as Record<string, unknown> | null) ?? null,
          lastSynced: row?.last_updated ?? null,
          linked: true,
        });
      } catch (error) {
        console.warn('Background streaming auto-sync skipped:', error);
      }
    })();
  }, [user?.id]);

  // Check whether the logged-in user has an auto-generated username and needs to pick a real one
  useEffect(() => {
    if (loading || !user) return;
    const checkUsername = async () => {
      try {
        const { data } = await supabase
          .from('users')
          .select('username')
          .eq('user_id', user.id)
          .maybeSingle();
        const username: string = data?.username ?? '';
        const { isAutoGeneratedUsername } = await import('@/utils/usernameUtils');
        if (isAutoGeneratedUsername(username)) {
          setUsernameRequired(username || '(none)');
        }
      } catch (err) {
        // Non-fatal — let user through if check fails
        console.warn('Username check failed:', err);
      }
    };
    checkUsername();
  }, [user?.id, loading]);

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

        // If user hasn't completed onboarding and hasn't skipped it, redirect to onboarding.
        // iOS native: Swift handles the onboarding flow, so never redirect to the React screen.
        if (!status.onboarding_completed && !status.onboarding_skipped) {
          if (isIosNative) {
            return; // Native Swift handles onboarding
          }
          setCurrentView('onboarding');
        }
        if (isIosNative && currentView === 'onboarding') {
          setCurrentView('feed');
        }
        else if (status.onboarding_skipped && !status.onboarding_completed) {
          // Show reminder banner if they skipped
          setShowOnboardingReminder(true);
          // Start tour if not completed (tour should start after skip too)
          if (!status.tour_completed && currentView === 'feed') {
            setTimeout(() => setRunTour(true), 1500);
          }
        } else if (status.onboarding_completed && !status.tour_completed) {
          // Onboarding done but tour not yet seen — fire it on all platforms.
          // iOS: native Swift onboarding sets onboarding_completed; tour runs in the Capacitor WebView.
          // Android/web: React onboarding sets it; tour runs immediately after.
          if (currentView === 'feed') {
            setTimeout(() => setRunTour(true), 1500);
          }
        }
      }
    };

    if (!loading && user) {
      checkOnboardingStatus();
    }
  }, [user, loading, currentView, isIosNative]);

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
      if (!isIosNative) {
        setCurrentView('onboarding');
      }
      // Clear the hash to prevent re-triggering on refresh
      navigate(`${location.pathname}${location.search}`, { replace: true });
    } else if (hash === '#profile') {
      setCurrentView('profile');
      // Clear the hash to prevent re-triggering on refresh
      navigate(`${location.pathname}${location.search}`, { replace: true });
    }
  }, [location.hash, location.pathname, location.search, navigate, isIosNative]);

  // ── Deep-link + share referral handling ─────────────────────────────────
  // useShareDeepLink handles: URL param capture, Universal Links, Capacitor
  // appUrlOpen, native SynthDeepLinkRouter events, auto-friend the referrer,
  // and routing to the shared content once the user is authenticated.
  // It is wired up below (after nav helpers are defined) via shareDeepLinkNavRef.

  useEffect(() => {
    // MainApp useEffect starting
    loadEvents();

    // Check for intended view from localStorage (for navigation from other pages)
    const intendedView = localStorage.getItem('intendedView');
    if (intendedView) {
      if (intendedView === 'onboarding') {
        if (!isIosNative) {
          setCurrentView('onboarding');
        }
        localStorage.removeItem('intendedView');
      } else if (['feed', 'search', 'profile'].includes(intendedView)) {
        setCurrentView(intendedView as ViewType);
        // Clear the intended view to prevent re-triggering
        localStorage.removeItem('intendedView');
      }
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
    
    // Listen for push notification navigation events (dispatched by pushTokenService)
    const handleSynthNavigate = (e: Event) => {
      const detail = (e as CustomEvent).detail as { view?: string; chatId?: string };
      if (!detail?.view) return;
      switch (detail.view) {
        case 'notifications':
          setCurrentView('notifications');
          break;
        case 'discover':
          setCurrentView('discover');
          break;
        case 'chat':
          if (detail.chatId) {
            setChatId(detail.chatId);
          }
          setCurrentView('chat');
          break;
        default:
          setCurrentView('feed');
      }
    };

    window.addEventListener('open-user-profile', handleOpenUserProfile as EventListener);
    window.addEventListener('open-event-details', handleOpenEventDetails as EventListener);
    window.addEventListener('synth-navigate', handleSynthNavigate as EventListener);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-user-profile', handleOpenUserProfile as EventListener);
      window.removeEventListener('open-event-details', handleOpenEventDetails as EventListener);
      window.removeEventListener('synth-navigate', handleSynthNavigate as EventListener);
    };
  }, []);

  // Handle session expiration
  useEffect(() => {
    if (sessionExpired) {
      setCurrentView('feed');
      setShowAuth(true); // Force show auth modal
    }
  }, [sessionExpired]);

  // Defensive auth-state sync: if a signed-in session transitions to signed-out,
  // force an auth-safe view to prevent rendering authenticated screens with null user.
  useEffect(() => {
    if (!loading && !user?.id) {
      setCurrentView('auth');
      setMenuOpen(false);
    }
  }, [loading, user?.id]);

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

  // Show in-app toast when a push notification arrives while the app is foregrounded
  useEffect(() => {
    const handlePushReceived = (e: Event) => {
      const detail = (e as CustomEvent).detail as { title?: string; body?: string; data?: any };
      toast({
        title: detail?.title ?? 'New notification',
        description: detail?.body,
        duration: 5000,
      });
    };

    window.addEventListener('synth-push-received', handlePushReceived as EventListener);
    return () => window.removeEventListener('synth-push-received', handlePushReceived as EventListener);
  }, []);

  const [showAuth, setShowAuth] = useState(false);
  const [settingsInitialView, setSettingsInitialView] = useState<SettingsModalView>('menu');
  const settingsReturnViewRef = useRef<ViewType>('profile');
  // hasCheckedFriendCelebration removed — celebration is now triggered manually via buttons
  const [menuOpen, setMenuOpen] = useState(false);

  // Lock body scroll when menu is open
  useLockBodyScroll(menuOpen);

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
    // Update prevView ref AFTER the render cycle so it reflects the just-left view
    return () => { prevViewRef.current = currentView; };
  }, [currentView]);

  const getViewTransitionClass = (prev: ViewType, next: ViewType): string => {
    if (prev === next) return '';
    if (next === 'notifications' || next === 'streaming-stats') return 'view-enter-up';
    if (next === 'feed') return 'view-enter-left';
    return 'view-enter-right';
  };
  const transitionClass = getViewTransitionClass(prevViewRef.current, currentView);

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

  // Hide bottom nav / rail when a chat thread is open on phone-style layouts only.
  // On web-desktop, keep the rail mounted so WebAppShell does not remount and wipe chat selection.
  const showPrimaryNav =
    !hideNavigation &&
    currentView !== 'profile-edit' &&
    currentView !== 'settings' &&
    (currentView !== 'chat' || !isChatSelected || layoutMode === 'web-desktop') &&
    !(USE_NATIVE_NAV && isIosNative);

  const showBottomNavChrome =
    showPrimaryNav && layoutMode !== 'web-desktop' && !(currentView === 'chat' && isChatSelected);
  const showDesktopRail = showPrimaryNav && layoutMode === 'web-desktop';
  const webDesktopContentClass = showDesktopRail
    ? getWebDesktopMainContentClass(currentView as MainAppViewForLayout)
    : '';
  const sideMenuAnchor: 'left' | 'right' = layoutMode === 'web-desktop' ? 'left' : 'right';
  const isGlobalArtistOrVenueOpen =
    detailModal.open && (detailModal.type === 'artist' || detailModal.type === 'venue');

  const { items: mainNavItems, handleItemClick: handleMainNavItemClick } = useMainNavItems({
    currentView: navViewForBottomNav as MainNavCurrentView,
    onViewChange: (v) => handleViewChange(v as ViewType),
    onOpenEventReview: () => setShowEventReviewModal(true),
    profileUserId,
    interactionSource: layoutMode === 'web-desktop' ? 'web_rail' : 'bottom_nav',
  });

  const handleProfileEdit = () => {
    // Navigate to profile edit view
    // Navigating to profile edit
    setCurrentView('profile-edit');
  };

  const openSettingsPage = (view: SettingsModalView = 'menu') => {
    settingsReturnViewRef.current = currentView;
    setSettingsInitialView(view);
    setCurrentView('settings');
  };

  const handleProfileSettings = () => {
    openSettingsPage('menu');
  };

  const handleProfileSave = () => {
    // Navigate back to profile view after saving
    // Profile saved, navigating back to profile view
    setCurrentView('profile');
  };

  const handleSignOut = async () => {
    try {
      setCurrentView('auth');
      setMenuOpen(false);
      await signOut();
      setShowAuth(false); // Hide auth modal
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
      const { event: normalizedEvent, error } = await fetchEventForModal(eventId);
      if (error) {
        console.error('Error fetching event:', error);
        return;
      }

      if (!normalizedEvent) {
        console.warn('Event not found for id:', eventId);
        return;
      }

      localStorage.setItem('selectedEvent', JSON.stringify(normalizedEvent));
      setCurrentView('feed');

      const open = () => {
        window.dispatchEvent(
          new CustomEvent('open-event-details', {
            detail: { event: normalizedEvent },
          })
        );
      };
      open();
      setTimeout(open, 300);
      setTimeout(open, 1000);
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

  const handleNavigateToReview = (reviewId: string) => {
    setCurrentView('feed');
    window.dispatchEvent(
      new CustomEvent('open-review-by-id', { detail: { reviewId } })
    );
  };

  // ── Share deep-link hook ────────────────────────────────────────────────────
  // Handles: URL param capture, Universal Links, native SynthDeepLinkRouter events,
  // auto-friend the referrer, route to shared content + welcome toast.
  useShareDeepLink({
    userId:  user?.id,
    loading,
    onNavigate: (instruction) => {
      if (instruction.type === 'event') {
        handleNavigateToEvent(instruction.id);
      } else if (instruction.type === 'review' && instruction.reviewId) {
        handleNavigateToReview(instruction.reviewId);
      } else if (instruction.type === 'artist') {
        handleNavigateToArtist(instruction.id);
      } else if (instruction.type === 'venue') {
        handleNavigateToVenue(instruction.id);
      }
    },
  });

  // Notify the native Swift layer when the side menu opens/closes so the
  // native BottomNav can be hidden behind the menu overlay.
  useEffect(() => {
    if (!isIosNative) return;
    window.dispatchEvent(new CustomEvent('synthMenuStateChanged', { detail: { open: menuOpen } }));
  }, [menuOpen, isIosNative]);

  useEffect(() => {
    if (!isIosNative) return;
    const shouldHideNav = currentView === 'chat' && isChatSelected;
    window.dispatchEvent(new CustomEvent('synthMenuStateChanged', { detail: { open: shouldHideNav } }));
  }, [isIosNative, currentView, isChatSelected]);

  // Keep the native BottomNav selected-tab indicator in sync with the React
  // view so internal navigations (back button, notifications, deep links, side
  // menu items) are reflected in the native UI.
  useEffect(() => {
    if (!isIosNative) return;
    const viewToTabIndex: Partial<Record<ViewType, number>> = {
      feed: 0,
      search: 1,
      chat: 3,
      profile: 4,
    };
    const index = viewToTabIndex[currentView];
    if (typeof index === 'number') {
      window.dispatchEvent(new CustomEvent('synthActiveTabChanged', { detail: { index } }));
    }
  }, [currentView, isIosNative]);

  useEffect(() => {
    if (!isIosNative) return;

    const handleNativeTabSelected = (event: Event) => {
      const index = (event as CustomEvent<{ index?: number }>).detail?.index;
      if (typeof index !== 'number') return;
      const navItem = mainNavItems[index];
      if (!navItem) return;
      handleMainNavItemClick(navItem);
    };

    window.addEventListener('synthNativeTabSelected', handleNativeTabSelected as EventListener);
    return () => {
      window.removeEventListener('synthNativeTabSelected', handleNativeTabSelected as EventListener);
    };
  }, [isIosNative, mainNavItems, handleMainNavItemClick]);

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

  const handleOnboardingReminderComplete = () => {
    if (isIosNative) {
      return;
    }
    setCurrentView('onboarding');
  };

  const handleTourFinish = () => {
    setRunTour(false);
  };

  if (loading) {
    return <SynthLoadingScreen text="Loading Synth..." />;
  }

  // Show auth if no user, session expired, or auth requested
  if (showAuth || sessionExpired || !user?.id) {
    // On iOS native, during the INITIAL load (user has never been authenticated
    // this session) we defer to the Swift layer and show a loading screen.
    // But after an explicit sign-out (hasEverHadUserRef.current === true),
    // Swift won't re-show its auth UI on its own, so we render the web login form.
    if (isIosNative && !hasEverHadUserRef.current && !nativeAuthTimedOut) {
      return <SynthLoadingScreen text="Loading Synth..." />;
    }
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  // Show API key error banner only when there are actual API key issues
  const showApiKeyError = false; // Set to true if you want to force show the API key error banner

  const renderCurrentView = () => {
    // Rendering current view
    switch (currentView) {
      case 'auth':
        return isIosNative ? (
          <SynthLoadingScreen text="Loading Synth..." />
        ) : (
          <Auth onAuthSuccess={handleAuthSuccess} />
        );
      case 'onboarding':
        return isIosNative ? (
          <SynthLoadingScreen text="Loading Synth..." />
        ) : (
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
            webDesktopChrome={webDesktopChrome}
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
            webDesktopChrome={webDesktopChrome}
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
            onNavigateToDiscover={profileUserId ? () => { setProfileUserId(undefined); setCurrentView('search'); } : undefined}
            menuOpen={menuOpen}
            onMenuClick={handleMenuToggle}
            hideHeader={
              (detailModal.open &&
                (detailModal.type === 'artist' || detailModal.type === 'venue')) ||
              isEventDetailsOpen
            }
            refreshTrigger={refreshTrigger}
            webDesktopChrome={webDesktopChrome}
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
      case 'settings':
        return (
          <SettingsModal
            variant="page"
            isOpen
            initialView={settingsInitialView}
            userEmail={user.email}
            onSignOut={handleSignOut}
            onClose={() => {
              setCurrentView(settingsReturnViewRef.current);
              setSettingsInitialView('menu');
            }}
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
            webDesktopChrome={webDesktopChrome}
          />
        );
      case 'streaming-stats':
        return <StreamingStatsPage onBack={() => setCurrentView('feed')} />;
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

  // Block the entire app until the user picks a real username
  if (usernameRequired !== null) {
    return (
      <UsernameRequiredModal
        currentUsername={usernameRequired}
        onComplete={(newUsername) => {
          setUsernameRequired(null);
          // Patch the auth user metadata so ProfileView shows the new username immediately
          console.log('✅ Username updated to:', newUsername);
        }}
      />
    );
  }

  return (
    <div
      className="flex h-full flex-col"
      style={{
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        paddingBottom: showBottomNavChrome
          ? 'max(5rem, calc(5rem + env(safe-area-inset-bottom, 0px)))'
          : 0,
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
          onComplete={handleOnboardingReminderComplete}
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

      <WebAppShell
        enabled={showDesktopRail}
        rail={
          <WebDesktopRail
            items={mainNavItems}
            onItemClick={handleMainNavItemClick}
            onOpenMenu={handleMenuToggle}
            menuBadgeCount={menuNotificationBadgeCount}
          />
        }
        mainContentClassName={webDesktopContentClass}
        mainKey={currentView}
        transitionClass={transitionClass}
      >
        {renderCurrentView()}
      </WebAppShell>

      <GlobalDetailModals
        userId={user?.id ?? ''}
        detailModal={detailModal}
        manualArtistDetail={manualArtistDetail}
        eventDetailsFromVenueOpen={eventDetailsFromVenueOpen}
        selectedEventFromVenue={selectedEventFromVenue}
        selectedEventFromVenueInterested={selectedEventFromVenueInterested}
        onCloseDetailModal={handleCloseGlobalDetail}
        onCloseEventDetailsFromVenue={() => {
          setEventDetailsFromVenueOpen(false);
          setSelectedEventFromVenue(null);
        }}
        onEventFromVenueChange={(newEvent, isInterested) => {
          setSelectedEventFromVenue(newEvent);
          setSelectedEventFromVenueInterested(isInterested ?? false);
        }}
        onInterestToggle={async (_eventId, interested) => {
          setSelectedEventFromVenueInterested(interested);
        }}
        onNavigateToProfile={handleNavigateToProfile}
        onNavigateToChat={handleNavigateToChat}
        onEventClickFromVenue={handleEventClickFromVenue}
        closeManualArtistDetail={closeManualArtistDetail}
        toggleManualArtistFollow={toggleManualArtistFollow}
      />

      {showBottomNavChrome && !menuOpen ? (
        <BottomNavAdapter items={mainNavItems} onItemClick={handleMainNavItemClick} />
      ) : null}

      {/* New Side Menu */}
      <SideMenu
        isOpen={menuOpen}
        onClose={handleMenuClose}
        onToggle={handleMenuToggle}
        onNavigateToNotifications={handleNavigateToNotifications}
        onNavigateToProfile={handleNavigateToProfile}
        onNavigateToSettings={() => openSettingsPage()}
        onNavigateToStreamingStats={() => setCurrentView('streaming-stats')}
        onNavigateToVerification={() => {
          handleNavigateToProfile(undefined, 'timeline');
        }}
        onSignOut={handleSignOut}
        anchor={sideMenuAnchor}
      />

      <GlobalModals
        userId={user?.id ?? ''}
        userEmail={user?.email}
        friendMatchSelfDisplayName={
          (user?.user_metadata?.full_name as string | undefined) ??
          (user?.user_metadata?.name as string | undefined) ??
          user?.email?.split('@')[0] ??
          null
        }
        onSignOut={handleSignOut}
        showEventReviewModal={showEventReviewModal}
        eventReviewPrefill={eventReviewPrefill}
        onCloseEventReview={() => {
          setShowEventReviewModal(false);
          setEventReviewPrefill(null);
        }}
        onReviewSubmitted={() => {
          setShowEventReviewModal(false);
          setEventReviewPrefill(null);
          setRefreshTrigger((prev) => prev + 1);
        }}
        showFriendTaggedInviteModal={showFriendTaggedInviteModal}
        friendTaggedInviteNotification={friendTaggedInviteNotification}
        onCloseFriendTaggedInviteModal={() => {
          setShowFriendTaggedInviteModal(false);
          setFriendTaggedInviteNotification(null);
        }}
        onWriteReview={(prefillEvent) => {
          setEventReviewPrefill(prefillEvent);
          setShowEventReviewModal(true);
          setShowFriendTaggedInviteModal(false);
          setFriendTaggedInviteNotification(null);
        }}
        friendCelebration={friendCelebration}
        onCloseFriendCelebration={() => setFriendCelebration(null)}
        onCelebrationEventClick={(eventId) => {
          window.dispatchEvent(new CustomEvent('open-event-details', { detail: { eventId } }));
        }}
        onCelebrationArtistClick={(artistId, artistName) => {
          window.dispatchEvent(new CustomEvent('open-artist-card', { detail: { artistId, artistName } }));
        }}
        onCelebrationVenueClick={(venueId, venueName) => {
          window.dispatchEvent(new CustomEvent('open-venue-card', { detail: { venueId, venueName } }));
        }}
      />

      {/* Onboarding Tour */}
      <OnboardingTour run={runTour} onFinish={handleTourFinish} onViewChange={handleViewChange} />
    </div>
  );
};
