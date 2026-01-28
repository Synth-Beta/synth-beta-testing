import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PersonalizedFeedService, type PersonalizedEvent, type FeedItem } from '@/services/personalizedFeedService';
import { HomeFeedService, type NetworkEvent, type EventList, type TrendingEvent, type NetworkReview } from '@/services/homeFeedService';
import { UnifiedFeedService, type UnifiedFeedItem } from '@/services/unifiedFeedService';
import { UserEventService } from '@/services/userEventService';
import { SimpleEventRecommendationService } from '@/services/simpleEventRecommendationService';
import { UserVisibilityService } from '@/services/userVisibilityService';
import { supabase } from '@/integrations/supabase/client';
import { HomeFeedHeader, type DateWindow } from './HomeFeedHeader';
import { MobileHeader } from '@/components/Header/MobileHeader';
import { NetworkEventsSection } from './NetworkEventsSection';
import { EventListsCarousel } from './EventListsCarousel';
import { CompactEventCard } from './CompactEventCard';
import { SwiftUIEventCard } from '@/components/events/SwiftUIEventCard';
import { SwiftUIReviewCard } from '@/components/reviews/SwiftUIReviewCard';
import type { ReviewWithEngagement } from '@/services/reviewService';
import { ReviewDetailView } from '@/components/reviews/ReviewDetailView';
import { PreferencesV4FeedSection } from './PreferencesV4FeedSection';
import { UnifiedEventsFeed } from './UnifiedEventsFeed';
import { JamBaseHeaderAttribution } from './JamBaseHeaderAttribution';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { EventFilters, type FilterState } from '@/components/search/EventFilters';
import { Users, Sparkles, TrendingUp, UserPlus, UserCheck, MessageSquare, MessageCircle, ChevronRight, ChevronDown, MapPin, Plus, Loader2 } from 'lucide-react';
import { Icon } from '@/components/Icon';
import { SynthLoadingInline, SynthLoader } from '@/components/ui/SynthLoader';
import { FriendSuggestionsRail } from '@/components/feed/FriendSuggestionsRail';
import { FriendsService } from '@/services/friendsService';
import { Button } from '@/components/ui/button';
import { FlagContentModal } from '@/components/moderation/FlagContentModal';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { LocationService } from '@/services/locationService';
import { getFallbackEventImage, replaceJambasePlaceholder } from '@/utils/eventImageFallbacks';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { useViewTracking } from '@/hooks/useViewTracking';
import { trackInteraction } from '@/services/interactionTrackingService';
import { getEventUuid, getEventMetadata } from '@/utils/entityUuidResolver';
import { triggerNativeEventShare, isNativeShareAvailable, setupNativeShareListener } from '@/utils/nativeShareService';
import { EventShareModal } from '@/components/events/EventShareModal';
import { InAppShareService } from '@/services/inAppShareService';
import { ArtistDetailModal } from '@/components/discover/modals/ArtistDetailModal';
import { VenueDetailModal } from '@/components/discover/modals/VenueDetailModal';
import { useNavigate } from 'react-router-dom';
import { NotificationService } from '@/services/notificationService';

// Helper function to format member count - guaranteed to return clean string
const formatMemberCount = (count: number | string | null | undefined): string => {
  // Convert to number - be very explicit
  let num = 0;
  if (count != null && count !== undefined) {
    if (typeof count === 'number') {
      num = Math.floor(Math.max(0, count));
    } else if (typeof count === 'string') {
      // Remove ALL non-numeric characters
      const cleaned = count.replace(/[^0-9]/g, '');
      if (cleaned.length > 0) {
        const parsed = parseInt(cleaned, 10);
        if (!isNaN(parsed) && parsed >= 0) {
          num = parsed;
        }
      }
    }
  }
  
  // Ensure it's a clean integer
  num = Math.floor(Math.max(0, num));
  
  // Format as string - use explicit string concatenation, no template literals
  // This ensures no unexpected characters can be added
  // Return a completely new string to avoid any reference issues
  if (num === 0) {
    return new String('0 members').toString();
  } else if (num === 1) {
    return new String('1 member').toString();
  } else {
    // Convert number to string explicitly and create new string
    const numStr = String(num);
    return new String(numStr + ' members').toString();
  }
};

interface HomeFeedProps {
  currentUserId: string;
  onNavigateToNotifications?: () => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToEvent?: (eventId: string) => void;
  onNavigateToArtist?: (artistId: string) => void;
  onNavigateToVenue?: (venueName: string) => void;
  onNavigateToChat?: (userId: string) => void;
  onViewChange?: (view: 'feed' | 'search' | 'profile') => void;
  menuOpen?: boolean;
  onMenuClick?: () => void;
  hideHeader?: boolean;
  refreshTrigger?: number;
}

export const HomeFeed: React.FC<HomeFeedProps> = ({
  currentUserId,
  onNavigateToProfile,
  onNavigateToEvent,
  onNavigateToArtist,
  onNavigateToVenue,
  onNavigateToChat,
  onNavigateToNotifications,
  onViewChange,
  menuOpen = false,
  onMenuClick,
  hideHeader = false,
  refreshTrigger = 0,
}) => {
  // Header state
  const [activeCity, setActiveCity] = useState<string | null>(null);
  const [dateWindow, setDateWindow] = useState<DateWindow>('next_30_days');
  const [cityCoordinates, setCityCoordinates] = useState<{ lat: number; lng: number } | null>(null);

  // Filter state for all sections
  const [filters, setFilters] = useState<FilterState>({
    genres: [],
    selectedCities: [],
    dateRange: {},
    showFilters: false,
    radiusMiles: 50,
    filterByFollowing: 'all',
    daysOfWeek: [],
  });

  // Refs for filter management
  const locationAutoAppliedRef = useRef(false);
  
  // Refs to store latest function references to avoid stale closures
  // Note: Will be initialized with actual callbacks immediately after they're created
  const loadTrendingEventsRef = useRef<((reset: boolean) => Promise<void>) | null>(null);
  const loadNetworkEventsRef = useRef<((reset: boolean) => Promise<void>) | null>(null);
  
  // Refs to store current page numbers for synchronous access in callbacks
  const trendingPageRef = useRef(0);
  const friendsPageRef = useRef(0);
  
  // Refs to store current filter values for synchronous access in callbacks (avoid stale closures)
  const filtersRef = useRef<FilterState>(filters);
  const cityCoordinatesRef = useRef<{ lat: number; lng: number } | null>(cityCoordinates);
  const activeCityRef = useRef<string | null>(activeCity);
  
  // Refs to store loading/hasMore states for synchronous access in event handlers (avoid stale closures)
  // Initialized with default values, will be synced with state via useEffect
  const trendingHasMoreRef = useRef(false);
  const loadingTrendingRef = useRef(true);
  const friendsHasMoreRef = useRef(false);
  const loadingNetworkRef = useRef(true);

  // Available genres and cities for filters
  const [availableGenres] = useState<string[]>([
    'Rock', 'Pop', 'Hip-Hop', 'Electronic', 'Jazz', 'Classical', 'Country', 
    'R&B', 'Reggae', 'Folk', 'Blues', 'Alternative', 'Indie', 'Punk',
    'Metal', 'Funk', 'Soul', 'Gospel', 'Latin', 'World'
  ]);
  const [availableCities, setAvailableCities] = useState<string[]>([]);

  // Feed sections state
  const [recommendedEvents, setRecommendedEvents] = useState<PersonalizedEvent[]>([]);
  const [firstDegreeEvents, setFirstDegreeEvents] = useState<NetworkEvent[]>([]);
  const [secondDegreeEvents, setSecondDegreeEvents] = useState<NetworkEvent[]>([]);
  const [reviews, setReviews] = useState<NetworkReview[]>([]);
  const [eventLists, setEventLists] = useState<EventList[]>([]);
  const [trendingEvents, setTrendingEvents] = useState<TrendingEvent[]>([]);

  // Pagination state for each section
  const [trendingPage, setTrendingPage] = useState(0);
  const [friendsPage, setFriendsPage] = useState(0);
  const [trendingHasMore, setTrendingHasMore] = useState(true);
  const [friendsHasMore, setFriendsHasMore] = useState(true);
  
  // Keep refs in sync with state for synchronous access in callbacks
  useEffect(() => {
    trendingPageRef.current = trendingPage;
  }, [trendingPage]);
  
  useEffect(() => {
    friendsPageRef.current = friendsPage;
  }, [friendsPage]);
  const [recommendedFriends, setRecommendedFriends] = useState<Array<{
    connected_user_id: string;
  name: string;
    avatar_url?: string;
    mutual_friends_count?: number;
    connection_degree: 2 | 3;
  }>>([]);
  const [sendingFriendRequests, setSendingFriendRequests] = useState<Set<string>>(new Set());
  const [sentFriendRequests, setSentFriendRequests] = useState<Set<string>>(new Set());
  const [joiningGroupChats, setJoiningGroupChats] = useState<Set<string>>(new Set());
  const [joinedGroupChats, setJoinedGroupChats] = useState<Set<string>>(new Set());
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [unreadFriendRequestsCount, setUnreadFriendRequestsCount] = useState(0);
  const [recommendedGroupChats, setRecommendedGroupChats] = useState<Array<{
    id: string;
    chat_name: string;
    member_count: number;
    friends_in_chat_count?: number;
    entity_type?: string;
    entity_name?: string;
    entity_image_url?: string;
    relevance_score?: number;
    distance_miles?: number;
  }>>([]);

  // Loading states
  const [loadingRecommended, setLoadingRecommended] = useState(true);
  const [loadingNetwork, setLoadingNetwork] = useState(true);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [loadingRecommendedFriends, setLoadingRecommendedFriends] = useState(false);
  const [loadingRecommendedGroupChats, setLoadingRecommendedGroupChats] = useState(false);
  
  // Recommended friends for friend suggestions rail (2nd and 3rd degree)
  const [friendSuggestionsForRail, setFriendSuggestionsForRail] = useState<Array<{
    user_id: string;
    name: string;
    avatar_url: string | null;
    verified?: boolean;
    connection_depth: number;
    mutual_friends_count: number;
    shared_genres_count?: number;
  }>>([]);

  // Flag modal state
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [flaggedEvent, setFlaggedEvent] = useState<{ id: string; title: string } | null>(null);

  // Feed type selection - simplified to just Events and Reviews
  const [selectedFeedType, setSelectedFeedType] = useState<string>('events');
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);

  // Location state for feed filtering
  const [feedLocation, setFeedLocation] = useState<{
    latitude: number;
    longitude: number;
    radiusMiles: number;
    locationName: string; // Current location from geolocation
    specifiedLocationName?: string; // User specified location (from profile/filters)
    specifiedLatitude?: number;
    specifiedLongitude?: number;
  } | null>(null);

  // Event details modal
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [selectedEventInterested, setSelectedEventInterested] = useState<boolean>(false);

  // Share modal state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedEventForShare, setSelectedEventForShare] = useState<any>(null);

  // Review detail modal
  const [selectedReview, setSelectedReview] = useState<UnifiedFeedItem | null>(null);
  const [reviewDetailOpen, setReviewDetailOpen] = useState(false);

  // Artist/Venue detail modals
  const [artistModalOpen, setArtistModalOpen] = useState(false);
  const [venueModalOpen, setVenueModalOpen] = useState(false);
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);
  const [selectedArtistName, setSelectedArtistName] = useState<string>('');
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [selectedVenueName, setSelectedVenueName] = useState<string>('');

  const navigate = useNavigate();

  // Refs for feed containers
  const trendingFeedRef = useRef<HTMLDivElement>(null);
  const friendsFeedRef = useRef<HTMLDivElement>(null);

  // Friend event interests
interface FriendEventInterest {
  id: string;
  friend_id: string;
  friend_name: string;
    friend_avatar?: string;
  event_id: string;
  event_title: string;
  artist_name?: string;
  venue_name?: string;
  event_date?: string;
  created_at: string;
}
  const [friendEventInterests, setFriendEventInterests] = useState<FriendEventInterest[]>([]);

  // Track home feed view
  useViewTracking('view', 'home_feed', { source: 'home' });

  // Setup native share listener for "Share in Chat" callback
  useEffect(() => {
    if (!isNativeShareAvailable()) {
      return; // Only setup listener if native share is available
    }

    const cleanup = setupNativeShareListener((event) => {
      // Handle share in chat from native layer
      setSelectedEventForShare({
        id: event.eventId,
        title: event.title,
        artist_name: event.artistName,
        venue_name: event.venueName,
        venue_city: event.venueCity,
        event_date: event.eventDate,
        image_url: event.imageUrl,
        poster_image_url: event.posterImageUrl,
      });
      setShareModalOpen(true);
    });

    return cleanup;
  }, []);

  // Load user's active city and apply to filters
  useEffect(() => {
    loadUserCity();
    loadFeedLocation(); // Also load location for feed filtering
  }, [currentUserId]);

  // Fetch unread notifications count for header badge (includes friend requests in total)
  useEffect(() => {
    const fetchNotificationCounts = async () => {
      try {
        // Fetch unread notifications count (excluding friend requests)
        const { count: notifCount } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', currentUserId)
          .eq('is_read', false)
          .not('type', 'eq', 'friend_request');
        
        // Fetch unread friend requests count
        const { count: friendReqCount } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', currentUserId)
          .eq('is_read', false)
          .eq('type', 'friend_request');
        
        setUnreadNotificationsCount(notifCount || 0);
        setUnreadFriendRequestsCount(friendReqCount || 0);
      } catch (error) {
        console.error('HomeFeed: Error fetching notification counts', error);
      }
    };

    if (currentUserId) {
      fetchNotificationCounts();
      
      // Set up real-time subscription for notification updates
      const channel = supabase
        .channel('home-feed-notifications')
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'notifications',
            filter: `user_id=eq.${currentUserId}`
          }, 
          () => {
            fetchNotificationCounts();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [currentUserId]);

  // Check for selectedEvent in localStorage (from notification navigation)
  useEffect(() => {
    const checkForSelectedEvent = async () => {
      try {
        const storedEvent = localStorage.getItem('selectedEvent');
        if (storedEvent) {
          const eventData = JSON.parse(storedEvent);
          
          // Clear localStorage immediately to prevent re-opening
          localStorage.removeItem('selectedEvent');
          
          // Set the event first
          setSelectedEvent(eventData);
          
          // Check if user is interested in this event
          if (eventData.id) {
            const interested = await UserEventService.isUserInterested(currentUserId, eventData.id);
            setSelectedEventInterested(interested);
          }
          
          // Open the modal after a brief delay to ensure state is set
          setTimeout(() => {
            setEventDetailsOpen(true);
          }, 50);
        }
      } catch (error) {
        console.error('Error loading selectedEvent from localStorage:', error);
        localStorage.removeItem('selectedEvent'); // Clear invalid data
      }
    };

    // Check immediately on mount or when currentUserId changes
    checkForSelectedEvent();

    // Also listen for the open-event-details custom event
    const handleOpenEventDetails = (e: Event) => {
      const detail = (e as CustomEvent).detail as { event?: any; eventId?: string };
      if (detail?.event) {
        checkForSelectedEvent();
      }
    };

    window.addEventListener('open-event-details', handleOpenEventDetails);

    return () => {
      window.removeEventListener('open-event-details', handleOpenEventDetails);
    };
  }, [currentUserId]);

  // Note: Location filtering is now handled by loadFeedLocation which always uses lat/long + radius
  // This useEffect is kept for backwards compatibility but doesn't set city names anymore

  // Load cities for filters
  useEffect(() => {
    const loadCities = async () => {
      try {
        const { data } = await supabase.rpc('get_available_cities_for_filter', {
          min_event_count: 1,
          limit_count: 500
        });
        if (data) {
          setAvailableCities(data.map((row: any) => row.city_name));
        }
      } catch (error) {
        console.error('Error loading cities:', error);
      }
    };
    loadCities();
  }, []);

  // Load feed data when feed type changes or user changes
  // Include currentUserId to ensure data is reloaded when user changes (security/data-leakage prevention)
  useEffect(() => {
    console.log('🔄 [HOME FEED] Feed type changed:', selectedFeedType);
    if (selectedFeedType === 'trending') {
      console.log('🔥 [HOME FEED] Loading trending events...');
      loadTrendingEvents(true);
    } else if (selectedFeedType === 'friends') {
      loadNetworkEvents(true);
    } else if (selectedFeedType === 'group-chats') {
      loadRecommendedGroupChats();
      loadFriendSuggestionsForRail();
    } else if (selectedFeedType === 'reviews') {
      loadReviews();
      loadRecommendedFriends();
    } else if (selectedFeedType === 'recommended') {
      // PreferencesV4FeedSection handles its own data loading via useEffect on mount/filter changes
      // No explicit load call needed here as the component initializes automatically
      console.log('✅ [HOME FEED] Recommended feed selected - PreferencesV4FeedSection will handle loading');
    }
  }, [selectedFeedType, currentUserId]); // Add currentUserId to prevent data leakage when user changes

  // Refresh reviews when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      console.log('🔄 [HOME FEED] Refresh trigger changed, refetching reviews...');
      if (selectedFeedType === 'reviews') {
        loadReviews();
      }
    }
  }, [refreshTrigger, selectedFeedType]);

  // Update dropdown button border when open state changes
  useEffect(() => {
    const trigger = document.querySelector('[data-tour="feed-toggle"]') as HTMLElement;
    if (trigger) {
      trigger.style.borderColor = dropdownOpen ? 'var(--brand-pink-500)' : 'var(--neutral-200)';
    }
  }, [dropdownOpen]);

  // Reload sections when filters change (but NOT for friends feed - no filters on friends feed)
  useEffect(() => {
    if (selectedFeedType === 'trending') {
    loadTrendingEvents(true);
    }
    // Friends feed does NOT reload on filter changes - it shows all events
  }, [filters.genres, filters.selectedCities, filters.dateRange]);

  // Infinite scroll and pull-to-refresh handlers for trending feed
  useEffect(() => {
    if (selectedFeedType !== 'trending') return;
    const feedElement = trendingFeedRef.current;
    if (!feedElement) return;
    // Ensure ref is assigned before attaching listeners (callback should be created and ref set by now)
    if (!loadTrendingEventsRef.current) return;

    let touchStartY = 0;
    const pullToRefreshThreshold = 80;
    let isPullingToRefresh = false;
    let pullDistance = 0;

    const handleScroll = () => {
      const scrollHeight = feedElement.scrollHeight;
      const clientHeight = feedElement.clientHeight;
      const scrollTop = feedElement.scrollTop;

      // Use refs to get current state values (avoid stale closures)
      if (scrollHeight - scrollTop - clientHeight < 200 && trendingHasMoreRef.current && !loadingTrendingRef.current) {
        // Update ref BEFORE setState to ensure it's synchronized before load function accesses it
        // This prevents race conditions where ref and state are temporarily out of sync
        const nextPage = trendingPageRef.current + 1;
        trendingPageRef.current = nextPage;
        setTrendingPage(nextPage);
        // Use ref to get latest function reference (checked for null to prevent errors)
        if (loadTrendingEventsRef.current) {
          loadTrendingEventsRef.current(false);
        }
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
      pullDistance = 0;
      isPullingToRefresh = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touchY = e.touches[0].clientY;
      const deltaY = touchY - touchStartY;

      if (feedElement.scrollTop === 0 && deltaY > 0) {
        e.preventDefault();
        pullDistance = deltaY;
        isPullingToRefresh = true;

        if (pullDistance > pullToRefreshThreshold) {
          feedElement.style.transform = `translateY(${Math.min(pullDistance, 120)}px)`;
        } else {
          feedElement.style.transform = `translateY(${pullDistance}px)`;
        }
      }
    };

    const handleTouchEnd = () => {
      if (isPullingToRefresh && pullDistance > pullToRefreshThreshold) {
        feedElement.style.transform = '';
        feedElement.style.transition = 'transform 0.3s ease';
        setTrendingPage(prevPage => {
          trendingPageRef.current = 0;
          return 0;
        });
        // Use ref to get latest function reference (checked for null to prevent errors)
        if (loadTrendingEventsRef.current) {
          loadTrendingEventsRef.current(true);
        }
      } else if (isPullingToRefresh) {
        feedElement.style.transform = '';
        feedElement.style.transition = 'transform 0.3s ease';
      }

      isPullingToRefresh = false;
      pullDistance = 0;
    };

    // Store options objects to reuse for cleanup (browser requires matching options)
    const scrollOptions = { passive: true } as AddEventListenerOptions;
    const touchendOptions = { passive: false } as AddEventListenerOptions;
    const touchstartOptions = { passive: true } as AddEventListenerOptions;
    const touchmoveOptions = { passive: false } as AddEventListenerOptions;

    feedElement.addEventListener('scroll', handleScroll, scrollOptions);
    feedElement.addEventListener('touchend', handleTouchEnd, touchendOptions);
    feedElement.addEventListener('touchstart', handleTouchStart, touchstartOptions);
    feedElement.addEventListener('touchmove', handleTouchMove, touchmoveOptions);

    return () => {
      // Remove listeners with the same options to ensure proper cleanup
      feedElement.removeEventListener('scroll', handleScroll, scrollOptions);
      feedElement.removeEventListener('touchend', handleTouchEnd, touchendOptions);
      feedElement.removeEventListener('touchstart', handleTouchStart, touchstartOptions);
      feedElement.removeEventListener('touchmove', handleTouchMove, touchmoveOptions);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFeedType, trendingEvents.length]);

  // Infinite scroll and pull-to-refresh handlers for friends feed
  useEffect(() => {
    if (selectedFeedType !== 'friends') return;
    const feedElement = friendsFeedRef.current;
    if (!feedElement) return;
    // Ensure ref is assigned before attaching listeners (callback should be created and ref set by now)
    if (!loadNetworkEventsRef.current) return;

    let touchStartY = 0;
    const pullToRefreshThreshold = 80;
    let isPullingToRefresh = false;
    let pullDistance = 0;

    const handleScroll = () => {
      const scrollHeight = feedElement.scrollHeight;
      const clientHeight = feedElement.clientHeight;
      const scrollTop = feedElement.scrollTop;

      // Use refs to get current state values (avoid stale closures)
      if (scrollHeight - scrollTop - clientHeight < 200 && friendsHasMoreRef.current && !loadingNetworkRef.current) {
        // Update ref BEFORE setState to ensure it's synchronized before load function accesses it
        // This prevents race conditions where ref and state are temporarily out of sync
        const nextPage = friendsPageRef.current + 1;
        friendsPageRef.current = nextPage;
        setFriendsPage(nextPage);
        // Use ref to get latest function reference (checked for null to prevent errors)
        if (loadNetworkEventsRef.current) {
          loadNetworkEventsRef.current(false);
        }
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
      pullDistance = 0;
      isPullingToRefresh = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touchY = e.touches[0].clientY;
      const deltaY = touchY - touchStartY;

      if (feedElement.scrollTop === 0 && deltaY > 0) {
        e.preventDefault();
        pullDistance = deltaY;
        isPullingToRefresh = true;

        if (pullDistance > pullToRefreshThreshold) {
          feedElement.style.transform = `translateY(${Math.min(pullDistance, 120)}px)`;
        } else {
          feedElement.style.transform = `translateY(${pullDistance}px)`;
        }
      }
    };

    const handleTouchEnd = () => {
      if (isPullingToRefresh && pullDistance > pullToRefreshThreshold) {
        feedElement.style.transform = '';
        feedElement.style.transition = 'transform 0.3s ease';
        setFriendsPage(prevPage => {
          friendsPageRef.current = 0;
          return 0;
        });
        // Use ref to get latest function reference (checked for null to prevent errors)
        if (loadNetworkEventsRef.current) {
          loadNetworkEventsRef.current(true);
        }
      } else if (isPullingToRefresh) {
        feedElement.style.transform = '';
        feedElement.style.transition = 'transform 0.3s ease';
      }

      isPullingToRefresh = false;
      pullDistance = 0;
    };

    // Store options objects to reuse for cleanup (browser requires matching options)
    const scrollOptions = { passive: true } as AddEventListenerOptions;
    const touchendOptions = { passive: false } as AddEventListenerOptions;
    const touchstartOptions = { passive: true } as AddEventListenerOptions;
    const touchmoveOptions = { passive: false } as AddEventListenerOptions;

    feedElement.addEventListener('scroll', handleScroll, scrollOptions);
    feedElement.addEventListener('touchend', handleTouchEnd, touchendOptions);
    feedElement.addEventListener('touchstart', handleTouchStart, touchstartOptions);
    feedElement.addEventListener('touchmove', handleTouchMove, touchmoveOptions);

    return () => {
      // Remove listeners with the same options to ensure proper cleanup
      feedElement.removeEventListener('scroll', handleScroll, scrollOptions);
      feedElement.removeEventListener('touchend', handleTouchEnd, touchendOptions);
      feedElement.removeEventListener('touchstart', handleTouchStart, touchstartOptions);
      feedElement.removeEventListener('touchmove', handleTouchMove, touchmoveOptions);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFeedType]);

  // Load user location for feed filtering - ALWAYS use lat/long + radius, NEVER city names
  const loadFeedLocation = async () => {
    try {
      // Always get current location from geolocation first
      let currentLocation: { latitude: number; longitude: number } | null = null;
      let currentLocationName: string | null = null;

      try {
        currentLocation = await LocationService.getCurrentLocation();
        const cityName = await LocationService.reverseGeocode(
          currentLocation.latitude,
          currentLocation.longitude
        );
        if (cityName) {
          currentLocationName = cityName;
        }
      } catch (geoError: any) {
        // Only log unexpected errors, not permission denials
        if (geoError?.code !== 1) { // 1 = PERMISSION_DENIED
          console.error('Error getting current location:', geoError);
        }
        // If geolocation fails, currentLocationName stays null (will show "Not found")
      }

      // Get user's specified location from database/profile
      const { data: userProfile } = await supabase
        .from('users')
        .select('location_city, latitude, longitude')
        .eq('user_id', currentUserId)
        .single();

      let specifiedLocationName: string | undefined;
      let specifiedLat: number | undefined;
      let specifiedLng: number | undefined;

      // Convert user's specified city to coordinates if they have one
      if (userProfile?.location_city) {
        specifiedLocationName = userProfile.location_city;
        
        // Convert city name to coordinates using city_centers table
        try {
          const { RadiusSearchService } = await import('@/services/radiusSearchService');
          const coords = await RadiusSearchService.getCityCoordinates(userProfile.location_city);
          if (coords) {
            specifiedLat = coords.lat;
            specifiedLng = coords.lng;
          }
        } catch (error) {
          console.error('Error converting city to coordinates:', error);
        }
      } else if (userProfile?.latitude && userProfile?.longitude) {
        // User has coordinates saved
        specifiedLat = userProfile.latitude;
        specifiedLng = userProfile.longitude;
        try {
          const cityName = await LocationService.reverseGeocode(
            userProfile.latitude,
            userProfile.longitude
          );
          if (cityName) {
            specifiedLocationName = cityName;
          }
        } catch (error) {
          console.error('Error reverse geocoding specified location:', error);
        }
      }

      // Use specified location for filtering (if available), otherwise use current location
      const filterLat = specifiedLat || currentLocation?.latitude;
      const filterLng = specifiedLng || currentLocation?.longitude;

      if (filterLat && filterLng) {
        setFeedLocation({
          latitude: filterLat,
          longitude: filterLng,
          radiusMiles: 50,
          locationName: currentLocationName,
          specifiedLocationName,
          specifiedLatitude: specifiedLat,
          specifiedLongitude: specifiedLng,
        });

        // ALWAYS use lat/long + radius for filtering, NEVER city names
        setFilters(prev => ({
          ...prev,
          latitude: filterLat,
          longitude: filterLng,
          radiusMiles: prev.radiusMiles || 50,
          selectedCities: [], // Clear city names - we use coordinates
        }));
      } else if (currentLocation) {
        // Fallback to current location only
        setFeedLocation({
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          radiusMiles: 50,
          locationName: currentLocationName,
        });

        setFilters(prev => ({
          ...prev,
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          radiusMiles: prev.radiusMiles || 50,
          selectedCities: [],
        }));
      }
    } catch (error) {
      console.error('Error loading feed location:', error);
    }
  };

  const loadUserCity = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('location_city')
        .eq('user_id', currentUserId)
        .single();

      if (error) throw error;
      if (data?.location_city) {
        setActiveCity(data.location_city);
        // Get city coordinates
        try {
          const { RadiusSearchService } = await import('@/services/radiusSearchService');
          const coords = await RadiusSearchService.getCityCoordinates(data.location_city);
          if (coords) setCityCoordinates(coords);
        } catch (err) {
          console.error('Error getting city coordinates:', err);
        }
      } else {
        // Explicitly set to null if no city found (so useEffect can trigger)
        setActiveCity(null);
      }
    } catch (error) {
      console.error('Error loading user city:', error);
      // Set to null on error so feed can still load
      setActiveCity(null);
    }
  };

  const getDateRange = (): { from?: Date; to?: Date } => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (dateWindow) {
      case 'today':
        return { from: today, to: today };
      case 'this_week':
        const weekEnd = new Date(today);
        weekEnd.setDate(today.getDate() + 7);
        return { from: today, to: weekEnd };
      case 'weekend':
        const saturday = new Date(today);
        saturday.setDate(today.getDate() + ((6 - today.getDay()) % 7));
        const sunday = new Date(saturday);
        sunday.setDate(saturday.getDate() + 1);
        return { from: saturday, to: sunday };
      case 'next_30_days':
        const thirtyDays = new Date(today);
        thirtyDays.setDate(today.getDate() + 30);
        return { from: today, to: thirtyDays };
      default:
        return {};
    }
  };

  const loadAllFeedSections = async () => {
    console.log('🔄 HomeFeed: Loading all feed sections...', { currentUserId, activeCity, dateWindow });

    // Load all sections in parallel with error handling
    // Use Promise.allSettled so one failure doesn't block others
    // Note: loadRecommendedEvents is now handled by PreferencesV4FeedSection component
    // loadTrendingEvents and loadNetworkEvents now handle their own filter application
    const results = await Promise.allSettled([
      // loadRecommendedEvents(filters), // Now handled by PreferencesV4FeedSection
      loadNetworkEvents(true), // Reset to page 0
      loadReviews(),
      loadEventLists(),
      loadTrendingEvents(true), // Reset to page 0
      loadRecommendedFriends(),
      loadRecommendedGroupChats(),
      loadFriendSuggestionsForRail(),
    ]);
    
    // Log any failures
    results.forEach((result, index) => {
      const sectionNames = ['Recommended', 'Network', 'Reviews', 'Lists', 'Trending', 'Friends', 'GroupChats'];
      if (result.status === 'rejected') {
        console.error(`❌ HomeFeed: ${sectionNames[index]} section failed:`, result.reason);
      } else {
        console.log(`✅ HomeFeed: ${sectionNames[index]} section loaded successfully`);
      }
    });
    
    console.log('✅ HomeFeed: All feed sections loading completed');
  };

  const loadRecommendedEvents = async (filters: any) => {
    setLoadingRecommended(true);
    try {
      // Add timeout to prevent infinite loading (30 seconds)
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Feed loading timeout after 30s')), 30000)
      );
      
      const eventsPromise = PersonalizedFeedService.getPersonalizedFeed(
        currentUserId,
        20,
        0,
        false,
        filters
      );
      
      const events = await Promise.race([eventsPromise, timeoutPromise]);
      setRecommendedEvents(events);
    } catch (error) {
      console.error('Error loading recommended events:', error);
      setRecommendedEvents([]);
    } finally {
      setLoadingRecommended(false);
    }
  };

  const loadNetworkEvents = useCallback(async (reset: boolean = false) => {
    if (reset) {
      friendsPageRef.current = 0; // Update ref BEFORE setState (React best practice)
      setFriendsPage(0);
    }
    // Set loading state for both reset and pagination to prevent race conditions
    setLoadingNetwork(true);
    try {
      const pageSize = 18;
      // Access friendsPage from ref to get current value synchronously (avoid stale closure)
      const currentPage = reset ? 0 : friendsPageRef.current;
      const [firstDegree, secondDegree] = await Promise.all([
        HomeFeedService.getFirstDegreeNetworkEvents(currentUserId, (currentPage + 1) * 10),
        HomeFeedService.getSecondDegreeNetworkEvents(currentUserId, (currentPage + 1) * 8),
      ]);
      
      // NO FILTERS - show all events that any friend is going to
      // Split into first and second degree
      if (reset) {
        setFirstDegreeEvents(firstDegree.slice(0, 10));
        setSecondDegreeEvents(secondDegree.slice(0, 8));
      } else {
        setFirstDegreeEvents(prev => [...prev, ...firstDegree.slice(currentPage * 10, (currentPage + 1) * 10)]);
        setSecondDegreeEvents(prev => [...prev, ...secondDegree.slice(currentPage * 8, (currentPage + 1) * 8)]);
      }
      
      const totalEvents = firstDegree.length + secondDegree.length;
      setFriendsHasMore(totalEvents > (currentPage + 1) * pageSize);
    } catch (error) {
      console.error('Error loading network events:', error);
      if (reset) {
      setFirstDegreeEvents([]);
      setSecondDegreeEvents([]);
      }
    } finally {
      setLoadingNetwork(false);
    }
  }, [currentUserId]); // Only depend on stable userId, access other values via refs
  
  // Keep filter/state refs in sync with current state values
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);
  
  useEffect(() => {
    cityCoordinatesRef.current = cityCoordinates;
  }, [cityCoordinates]);
  
  useEffect(() => {
    activeCityRef.current = activeCity;
  }, [activeCity]);
  
  // Keep loading/hasMore refs in sync with state
  useEffect(() => {
    trendingHasMoreRef.current = trendingHasMore;
  }, [trendingHasMore]);
  
  useEffect(() => {
    loadingTrendingRef.current = loadingTrending;
  }, [loadingTrending]);
  
  useEffect(() => {
    friendsHasMoreRef.current = friendsHasMore;
  }, [friendsHasMore]);
  
  useEffect(() => {
    loadingNetworkRef.current = loadingNetwork;
  }, [loadingNetwork]);
  
  // Keep ref in sync when callback changes
  // Only assign in useEffect to avoid race conditions - event listeners are attached in a separate useEffect
  // that depends on selectedFeedType, which ensures proper ordering
  useEffect(() => {
    loadNetworkEventsRef.current = loadNetworkEvents;
  }, [loadNetworkEvents]);

  const loadMoreFriends = () => {
    if (!loadingNetwork && friendsHasMore) {
      // Calculate next page and update state, then sync ref in setState callback to maintain consistency
      setFriendsPage(prevPage => {
        friendsPageRef.current = prevPage + 1;
        return prevPage + 1;
      });
      // Use ref to get latest function reference (checked for null to prevent errors)
      if (loadNetworkEventsRef.current) {
        loadNetworkEventsRef.current(false);
      }
    }
  };

  const loadReviews = async () => {
    setLoadingReviews(true);
    try {
      const networkReviews = await HomeFeedService.getNetworkReviews(currentUserId, 20);
      setReviews(networkReviews);
    } catch (error) {
      console.error('Error loading reviews:', error);
      setReviews([]);
    } finally {
      setLoadingReviews(false);
    }
  };

  const loadEventLists = async () => {
    setLoadingLists(true);
    try {
      const lists = await HomeFeedService.getEventLists(currentUserId, 3);
      setEventLists(lists);
    } catch (error) {
      console.error('Error loading event lists:', error);
      setEventLists([]);
    } finally {
      setLoadingLists(false);
    }
  };

  // Helper function to apply filters to events
  const applyFiltersToEvents = <T extends { event_date?: string; venue_city?: string; genres?: string[] | null }>(
    events: T[],
    filterState: FilterState = filters
  ): T[] => {
    console.log('🔍 [FILTER] applyFiltersToEvents called:', { 
      eventCount: events.length, 
      filters: {
        selectedCities: filterState.selectedCities,
        dateRange: filterState.dateRange,
        genres: filterState.genres
      }
    });
    
    const filtered = events.filter((event, index) => {
      // Date filter
      if (filterState.dateRange.from || filterState.dateRange.to) {
        if (!event.event_date) {
          console.log(`🔍 [FILTER] Event ${index} filtered out: no event_date`);
          return false;
        }
        const eventDate = new Date(event.event_date);
        if (filterState.dateRange.from && eventDate < filterState.dateRange.from) {
          console.log(`🔍 [FILTER] Event ${index} filtered out: before date range`, eventDate);
          return false;
        }
        if (filterState.dateRange.to) {
          const toDate = new Date(filterState.dateRange.to);
          toDate.setHours(23, 59, 59, 999);
          if (eventDate > toDate) {
            console.log(`🔍 [FILTER] Event ${index} filtered out: after date range`, eventDate);
            return false;
          }
        }
      }

      // City filter removed - location filtering is done by coordinates in the service layer

      // Genre filter (skip if genres not available on event)
      if (filterState.genres && filterState.genres.length > 0) {
        const eventGenres = (event.genres || []).map((g: string) => g.toLowerCase());
        if (eventGenres.length === 0) {
          console.log(`🔍 [FILTER] Event ${index} filtered out: no genres`);
          return false; // No genres on event, skip if genre filter active
        }
        const matches = filterState.genres.some(genre => 
          eventGenres.some((eg: string) => eg.includes(genre.toLowerCase()) || genre.toLowerCase().includes(eg))
        );
        if (!matches) {
          console.log(`🔍 [FILTER] Event ${index} filtered out: genre mismatch`, { eventGenres, filterGenres: filterState.genres });
          return false;
        }
      }

      return true;
    });
    
    console.log('🔍 [FILTER] applyFiltersToEvents result:', { 
      inputCount: events.length, 
      outputCount: filtered.length 
    });
    
    return filtered;
  };

  const loadTrendingEvents = useCallback(async (reset: boolean = false) => {
    // Access current state values via refs to avoid stale closures
    // This allows the callback to be stable while still using current values
    const currentPage = reset ? 0 : trendingPageRef.current;
    const currentCityCoordinates = cityCoordinatesRef.current;
    const currentActiveCity = activeCityRef.current;
    const currentFilters = filtersRef.current;
    
    console.log('🔥 [TRENDING] loadTrendingEvents called', { reset, currentPage, currentCityCoordinates });
    
    if (reset) {
      // Update state first, then sync ref in setState callback to maintain consistency
      setTrendingPage(0);
      trendingPageRef.current = 0;
    }
    // Set loading state for both reset and pagination to prevent race conditions
    setLoadingTrending(true);
    try {
      const pageSize = 12;
      console.log('🔥 [TRENDING] Calling getTrendingEvents with params:', {
        userId: currentUserId,
        cityLat: currentCityCoordinates?.lat,
        cityLng: currentCityCoordinates?.lng,
        radiusMiles: 50,
        limit: (currentPage + 1) * pageSize,
        activeCity: currentActiveCity,
      });
      
      const events = await HomeFeedService.getTrendingEvents(
        currentUserId,
        currentCityCoordinates?.lat,
        currentCityCoordinates?.lng,
        50,
        (currentPage + 1) * pageSize,
        currentActiveCity || undefined
      );
      
      console.log('🔥 [TRENDING] getTrendingEvents returned:', { eventCount: events.length, events });
      
      // Apply filters using current filters
      const filteredEvents = applyFiltersToEvents(events, currentFilters);
      console.log('🔥 [TRENDING] After applying filters:', { filteredCount: filteredEvents.length });
      
      if (reset) {
        setTrendingEvents(filteredEvents.slice(0, pageSize));
        console.log('🔥 [TRENDING] Set trending events (reset):', filteredEvents.slice(0, pageSize).length);
      } else {
        setTrendingEvents(prev => {
          const newEvents = [...prev, ...filteredEvents.slice(currentPage * pageSize, (currentPage + 1) * pageSize)];
          console.log('🔥 [TRENDING] Set trending events (append):', { prevCount: prev.length, newCount: newEvents.length });
          return newEvents;
        });
      }
      
      setTrendingHasMore(filteredEvents.length > (currentPage + 1) * pageSize);
      console.log('🔥 [TRENDING] Load complete:', { hasMore: filteredEvents.length > (currentPage + 1) * pageSize });
    } catch (error) {
      console.error('❌ [TRENDING] Error loading trending events:', error);
      if (reset) setTrendingEvents([]);
    } finally {
      setLoadingTrending(false);
      console.log('🔥 [TRENDING] Loading state set to false');
    }
    // Capture dependencies at callback creation time, but callback will be recreated when these change
    // We rely on the ref assignment effect to update the ref when callback changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]); // Only depend on stable userId, access other values via refs
  
  // Keep ref in sync when callback changes
  // Only assign in useEffect to avoid race conditions - event listeners are attached in a separate useEffect
  // that depends on selectedFeedType, which ensures proper ordering
  useEffect(() => {
    loadTrendingEventsRef.current = loadTrendingEvents;
  }, [loadTrendingEvents]);

  const loadMoreTrending = () => {
    if (!loadingTrending && trendingHasMore) {
      // Calculate next page and update ref BEFORE setState (React best practice)
      const nextPage = trendingPageRef.current + 1;
      trendingPageRef.current = nextPage;
      setTrendingPage(nextPage);
      // Use ref to get latest function reference (checked for null to prevent errors)
      if (loadTrendingEventsRef.current) {
        loadTrendingEventsRef.current(false);
      }
    }
  };

  const loadRecommendedFriends = async () => {
    setLoadingRecommendedFriends(true);
    try {
      // First, fetch existing friend relationships to filter them out
      // Only exclude users with 'pending' or 'accepted' status, not 'declined'
      const { data: existingRelationships } = await supabase
        .from('user_relationships')
        .select('user_id, related_user_id, status')
        .eq('relationship_type', 'friend')
        .in('status', ['pending', 'accepted'])
        .or(`user_id.eq.${currentUserId},related_user_id.eq.${currentUserId}`);

      // Create a set of user IDs we already have relationships with (pending or accepted)
      // Users with 'declined' status are NOT excluded and remain eligible for recommendations
      const excludedUserIds = new Set<string>();
      if (existingRelationships) {
        existingRelationships.forEach((rel: any) => {
          // Add the other user in the relationship (not the current user)
          const otherUserId = rel.user_id === currentUserId ? rel.related_user_id : rel.user_id;
          excludedUserIds.add(otherUserId);
        });
      }

      const [secondDegreeRes, thirdDegreeRes] = await Promise.allSettled([
        supabase.rpc('get_second_degree_connections', { target_user_id: currentUserId }),
        supabase.rpc('get_third_degree_connections', { target_user_id: currentUserId }),
      ]);

      const secondDegree = secondDegreeRes.status === 'fulfilled' && !secondDegreeRes.value.error && secondDegreeRes.value.data
        ? secondDegreeRes.value.data.map((f: any) => ({ ...f, connection_degree: 2 as const }))
        : [];

      const thirdDegree = thirdDegreeRes.status === 'fulfilled' && !thirdDegreeRes.value.error && thirdDegreeRes.value.data
        ? thirdDegreeRes.value.data.map((f: any) => ({ ...f, connection_degree: 3 as const }))
        : [];

      // Combine, filter out existing relationships, and sort by mutual friends count (if available) or connection degree
      const allFriends = [...secondDegree, ...thirdDegree]
        .filter((f: any) => {
          // Filter out users we already have friend relationships with (pending or accepted)
          const userId = f.connected_user_id || f.user_id;
          return !excludedUserIds.has(userId);
        })
        .sort((a, b) => {
          // Prioritize by mutual friends count, then by connection degree (2nd before 3rd)
          const aMutual = a.mutual_friends_count || 0;
          const bMutual = b.mutual_friends_count || 0;
          if (aMutual !== bMutual) return bMutual - aMutual;
          return a.connection_degree - b.connection_degree;
        })
        .slice(0, 20); // Limit to 20 recommended friends

      setRecommendedFriends(allFriends);
    } catch (error) {
      console.error('Error loading recommended friends:', error);
      setRecommendedFriends([]);
    } finally {
      setLoadingRecommendedFriends(false);
    }
  };

  const loadFriendSuggestionsForRail = async () => {
    try {
      const suggestions = await FriendsService.getRecommendedFriends(currentUserId);
      // FriendsService.getRecommendedFriends already returns the correct format
      setFriendSuggestionsForRail(suggestions);
    } catch (error) {
      console.error('Error loading friend suggestions for rail:', error);
      setFriendSuggestionsForRail([]);
    }
  };

  const handleSendFriendRequestForRail = async (userId: string) => {
    let shouldRemove = false;
    // Track sending state to show loading spinner
    setSendingFriendRequests(prev => new Set(prev).add(userId));
    
    try {
      const { error } = await supabase.rpc('create_friend_request', {
        receiver_user_id: userId
      });

      if (error) {
        // Only remove user if it's a validation/business logic error (already sent, etc.)
        // Don't remove on actual network/connection failures
        const errorCode = error.code || error.message || '';
        const isBusinessError = errorCode.includes('already') || 
                                errorCode.includes('duplicate') ||
                                errorCode.includes('invalid') ||
                                errorCode === '23505' || // PostgreSQL unique constraint
                                errorCode === 'PGRST204'; // Supabase conflict
        
        if (isBusinessError) {
          shouldRemove = true; // Remove on business logic errors (already sent, etc.)
        } else {
          // Network/connection errors - don't remove user, allow retry
          console.error('Network error sending friend request:', error);
          // Don't return early - let finally block clear sending state
          return;
        }
        throw error;
      }
      
      // Success - definitely remove user
      shouldRemove = true;
    } catch (error: any) {
      if (!shouldRemove) {
        // Network error occurred, don't update UI but still clear sending state in finally
        return;
      }
      console.error('Error sending friend request:', error);
    } finally {
      // Always clear sending state, even on network errors
      setSendingFriendRequests(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      
      // Update UI only if we should remove (success or business logic error)
      // Do this in finally to ensure it happens even if early return occurs
      if (shouldRemove) {
        // Update both friend suggestions lists to remove the user we just sent a request to
        setFriendSuggestionsForRail(prev => prev.filter(f => f.user_id !== userId));
        // Also update recommendedFriends (uses connected_user_id field)
        setRecommendedFriends(prev => prev.filter(f => {
          const friendUserId = f.connected_user_id || (f as any).user_id;
          return friendUserId !== userId;
        }));
      }
    }
  };

  const loadRecommendedGroupChats = async () => {
    setLoadingRecommendedGroupChats(true);
    try {
      console.log('🔄 Loading recommended chats for user:', currentUserId);
      
      // Use the new get_recommended_chats RPC function
      // This uses location (for venues) and genre preferences (for artists)
      const { data: recommendedChats, error } = await supabase.rpc('get_recommended_chats', {
        p_user_id: currentUserId,
        p_limit: 20,
        p_offset: 0,
        p_radius_miles: 50
      });

      if (error) {
        console.error('❌ Error calling get_recommended_chats:', error);
        throw error;
      }

      console.log('📊 Raw recommended chats from RPC:', recommendedChats);

      // The RPC function should already filter out chats the user is already in
      // We also filter out any chats joined in this session using joinedGroupChats state
      const chatsWithFriends = (recommendedChats || [])
        .filter((chat: any) => !joinedGroupChats.has(chat.chat_id))
        .map((chat: any) => {
          // Clean member_count to ensure it's a proper integer
          let memberCount = 0;
          if (chat.member_count != null && chat.member_count !== undefined) {
            const rawValue = chat.member_count;
            if (typeof rawValue === 'number') {
              memberCount = Math.max(0, Math.floor(rawValue));
            } else {
              // Handle string case - remove all non-numeric and parse
              const cleaned = String(rawValue).replace(/[^0-9]/g, '');
              const parsed = parseInt(cleaned, 10);
              if (!isNaN(parsed) && parsed >= 0) {
                memberCount = parsed;
              }
            }
          }
          // Ensure it's definitely a number
          memberCount = Number(memberCount);
          if (isNaN(memberCount) || memberCount < 0) {
            memberCount = 0;
          }
          
          return {
            id: chat.chat_id,
            chat_name: chat.chat_name || chat.entity_name || 'Unnamed Group',
            member_count: memberCount,
            friends_in_chat_count: 0, // Not calculated in RPC, but kept for compatibility
            entity_type: chat.entity_type,
            entity_name: chat.entity_name,
            entity_image_url: chat.entity_image_url,
            relevance_score: chat.relevance_score,
            distance_miles: chat.distance_miles,
          };
        });

      console.log('✅ Loaded recommended chats:', chatsWithFriends.length);
      console.log('📊 Member counts:', chatsWithFriends.map(c => ({ id: c.id, name: c.chat_name, member_count: c.member_count, type: typeof c.member_count })));
      setRecommendedGroupChats(chatsWithFriends);
    } catch (error) {
      console.error('❌ Error loading recommended group chats:', error);
      setRecommendedGroupChats([]);
    } finally {
      setLoadingRecommendedGroupChats(false);
    }
  };

  const handleJoinGroupChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click from triggering
    
    if (joiningGroupChats.has(chatId) || joinedGroupChats.has(chatId)) {
      return; // Already joining or joined
    }
    
    setJoiningGroupChats(prev => new Set(prev).add(chatId));
    
    try {
      // Add user to chat by inserting into chat_participants table
      // The trigger will automatically sync the users array in the chats table
      const { error: insertError } = await supabase
        .from('chat_participants')
        .insert({
          chat_id: chatId,
          user_id: currentUserId,
          joined_at: new Date().toISOString(),
          notifications_enabled: true,
          is_admin: false
        });
      
      if (insertError) {
        // If it's a unique constraint violation, user is already a participant
        if (insertError.code === '23505') {
          // User is already in the chat - just update UI
          setJoinedGroupChats(prev => new Set(prev).add(chatId));
          setRecommendedGroupChats(prev => prev.filter(chat => chat.id !== chatId));
          return;
        }
        throw insertError;
      }
      
      // Update local state - mark as joined and remove from recommended list
      setJoinedGroupChats(prev => new Set(prev).add(chatId));
      setRecommendedGroupChats(prev => prev.filter(chat => chat.id !== chatId));
    } catch (error) {
      console.error('Error joining group chat:', error);
      // You could add a toast notification here
    } finally {
      setJoiningGroupChats(prev => {
        const next = new Set(prev);
        next.delete(chatId);
        return next;
      });
    }
  };

  const handleAddFriend = async (friendUserId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click from triggering
    setSendingFriendRequests(prev => new Set(prev).add(friendUserId));
    
    try {
      const { error } = await supabase.rpc('create_friend_request', {
        receiver_user_id: friendUserId,
      });

      if (error) {
        if (error.message?.includes('already sent') || error.message?.includes('already friends')) {
          // Request already sent or already friends
          setSentFriendRequests(prev => new Set(prev).add(friendUserId));
      } else {
          throw error;
        }
      } else {
        setSentFriendRequests(prev => new Set(prev).add(friendUserId));
      }
    } catch (error) {
      console.error('Error sending friend request:', error);
      // You could add a toast notification here if needed
    } finally {
      setSendingFriendRequests(prev => {
        const next = new Set(prev);
        next.delete(friendUserId);
        return next;
      });
    }
  };

  // Transform v3 feed item to UnifiedFeedItem format or special marker types
  const transformV3FeedItem = (item: FeedItem): UnifiedFeedItem | { type: 'friend_suggestion', payload: any } => {
    if (item.type === 'event') {
      const eventData = item.payload;
      return {
        id: item.id,
        type: 'event',
        title: eventData.title || 'Event',
        author: {
          id: currentUserId, // Events don't have authors, use current user as placeholder
          name: 'System',
        },
        event_data: {
          id: eventData.event_id,
          jambase_event_id: eventData.event_id,
          title: eventData.title || 'Event',
          artist_name: eventData.artist_name || 'Unknown Artist',
          artist_id: eventData.artist_id || '', // Use JamBase ID first
          venue_name: eventData.venue_name || 'Unknown Venue',
          venue_id: eventData.venue_id || '', // Use JamBase ID first
          event_date: eventData.event_date,
          doors_time: eventData.doors_time,
          description: eventData.description,
          genres: eventData.genres,
          venue_address: eventData.venue_address,
          venue_city: eventData.venue_city,
          venue_state: eventData.venue_state,
          venue_zip: eventData.venue_zip,
          latitude: eventData.latitude,
          longitude: eventData.longitude,
          ticket_urls: eventData.ticket_urls,
          ticket_available: eventData.ticket_available,
          price_range: eventData.price_range,
          is_promoted: eventData.is_promoted,
          promotion_tier: eventData.promotion_tier,
          friend_interest_count: eventData.friend_interest_count || 0,
          has_friends_going: eventData.has_friends_going || false,
        } as any,
        relevance_score: item.score / 100, // Convert 0-100 to 0-1
        created_at: item.created_at,
      };
    } else if (item.type === 'review') {
      const reviewData = item.payload;
      return {
        id: item.id,
        type: 'review',
        title: reviewData.event_title || 'Review',
        author: {
          id: reviewData.reviewer_id,
          name: reviewData.reviewer_name || 'User',
          avatar_url: reviewData.reviewer_avatar,
          verified: reviewData.reviewer_verified,
        },
        event_info: {
          event_name: reviewData.event_title,
          venue_name: reviewData.venue_name,
          event_date: reviewData.event_date,
          artist_name: reviewData.artist_name,
          artist_id: undefined, // event_info doesn't require this
        },
        rating: reviewData.rating,
        content: reviewData.review_text,
        photos: reviewData.photos || [],
        likes_count: reviewData.likes_count || 0,
        comments_count: reviewData.comments_count || 0,
        shares_count: reviewData.shares_count || 0,
        relevance_score: item.score / 100,
        created_at: reviewData.review_created_at || item.created_at,
        is_liked: false, // TODO: Check if user liked this
      };
    } else if (item.type === 'friend_suggestion') {
      // Return special marker for friend suggestions rail
      return {
        type: 'friend_suggestion',
        payload: item.payload,
      } as any;
    } else if (item.type === 'group_chat') {
      // For group chats, we need to determine if it's a rail or feed item
      // The SQL should return the first one as a rail item (we'll mark it)
      // For now, treat all group_chat items as potential feed items
      // Rails will be handled separately based on position
      return {
        id: item.id,
        type: 'group_chat',
        title: item.payload.chat_name || 'Group Chat',
        author: {
          id: currentUserId,
          name: 'System',
        },
        group_chat_data: {
          chat_id: item.payload.chat_id,
          chat_name: item.payload.chat_name,
          member_count: item.payload.member_count,
          friends_in_chat_count: item.payload.friends_in_chat_count,
          created_at: item.payload.created_at,
        },
        relevance_score: item.score / 100,
        created_at: item.created_at,
      } as any;
    }
    throw new Error(`Unsupported feed item type: ${item.type}`);
  };

  const insertEventRecommendations = async (
    items: UnifiedFeedItem[],
    startIndex: number
  ): Promise<UnifiedFeedItem[]> => {
    const result: UnifiedFeedItem[] = [];
    let recommendationIndex = 4 + Math.floor(Math.random() * 3); // 4-6 posts

    for (let i = 0; i < items.length; i++) {
      result.push(items[i]);

      // Insert recommendation every 4-6 posts
      if ((startIndex + i + 1) % recommendationIndex === 0) {
        try {
          const recommendations = await SimpleEventRecommendationService.getRecommendedEvents({
            userId: currentUserId,
            limit: 1,
          });

          if (recommendations.events && recommendations.events.length > 0) {
            const event = recommendations.events[0];
            result.push({
              id: `recommendation-${event.id}`,
              type: 'event',
              title: event.title || (event as any).artist_name_normalized || 'Event',
              author: {
                id: currentUserId,
                name: 'System',
              },
              event_data: {
                id: event.id,
                jambase_event_id: event.jambase_event_id,
                title: event.title || (event as any).artist_name_normalized || 'Event',
                artist_name: (event as any).artist_name_normalized || 'Unknown Artist',
                artist_id: event.artist_id || event.id || '',
                venue_name: (event as any).venue_name_normalized || 'Unknown Venue',
                venue_id: event.venue_id || '',
                event_date: event.event_date,
                doors_time: event.doors_time,
                description: event.description,
                genres: event.genres,
                venue_address: event.venue_address,
                venue_city: event.venue_city,
                venue_state: event.venue_state,
                venue_zip: event.venue_zip,
                latitude: event.latitude,
                longitude: event.longitude,
                ticket_urls: event.ticket_urls,
                ticket_available: event.ticket_available,
                price_range: event.price_range,
              },
              relevance_score: 0.8,
              created_at: new Date().toISOString(),
            });
          }

          // Reset recommendation index for next insertion
          recommendationIndex = 4 + Math.floor(Math.random() * 3);
        } catch (error) {
          console.error('Error inserting event recommendation:', error);
        }
      }
    }

    return result;
  };

  const loadFriendEventInterests = async () => {
    try {
      const friendIds = await UserVisibilityService.getFriendIds(currentUserId);
      if (friendIds.length === 0) return;

      // First, get relationships for friends' event interests
      const { data: relationships, error: relError } = await supabase
        .from('user_event_relationships')
        .select(`
          user_id,
          event_id,
          created_at
        `)
        .in('relationship_type', ['going', 'maybe'])
        .in('user_id', friendIds)
        .order('created_at', { ascending: false })
        .limit(10);

      if (relError) throw relError;
      if (!relationships || relationships.length === 0) {
        setFriendEventInterests([]);
        return;
      }

      // Get event IDs and user IDs
      const eventIds = relationships.map(r => r.event_id).filter(Boolean) as string[];
      const userIds = [...new Set(relationships.map(r => r.user_id))];

      // Fetch events and users in parallel
      const [eventsResult, usersResult] = await Promise.all([
        supabase
          .from('events_with_artist_venue')
          .select('id, title, artist_name_normalized, venue_name_normalized, event_date')
          .in('id', eventIds),
        supabase
          .from('users')
          .select('user_id, name, avatar_url')
          .in('user_id', userIds)
      ]);

      if (eventsResult.error) throw eventsResult.error;
      if (usersResult.error) throw usersResult.error;

      // Create maps for quick lookup
      const eventsMap = new Map((eventsResult.data || []).map(e => [e.id, e]));
      const usersMap = new Map((usersResult.data || []).map(u => [u.user_id, u]));

      // Combine data
      const interests: FriendEventInterest[] = relationships
        .map((rel: any) => {
          const event = eventsMap.get(rel.event_id);
          const user = usersMap.get(rel.user_id);
          
          if (!event) return null; // Skip if event not found

          const interest: FriendEventInterest = {
            id: `${rel.user_id}-${rel.event_id}`, // Composite key since user_event_relationships has composite PK
            friend_id: rel.user_id,
            friend_name: user?.name || 'Friend',
            friend_avatar: user?.avatar_url ?? undefined,
            event_id: event.id,
            event_title: event.title || 'Event',
            artist_name: (event as any).artist_name_normalized ?? undefined,
            venue_name: (event as any).venue_name_normalized ?? undefined,
            event_date: event.event_date ?? undefined,
            created_at: rel.created_at,
          };
          return interest;
        })
        .filter((item): item is FriendEventInterest => item !== null);

      setFriendEventInterests(interests);
    } catch (error) {
      console.error('Error loading friend event interests:', error);
      setFriendEventInterests([]);
    }
  };

  const handleEventClick = async (eventId: string) => {
    // Track event click from feed
    try {
      const eventUuid = getEventUuid({ id: eventId });
      trackInteraction.click(
        'event',
        eventId,
        { source: 'home_feed' },
        eventUuid || undefined
      );
    } catch (error) {
      console.error('Error tracking event click:', error);
    }

    try {
      // Query events table with JOINs to get artist and venue names via foreign keys
      const { data, error } = await supabase
        .from('events')
        .select('*, artists(name), venues(name)')
        .eq('id', eventId)
        .single();

      if (error) {
        console.error('Error fetching event details:', error);
        return;
      }

      if (data) {
        // Normalize the event data to include artist_name and venue_name from JOINed data
        // Properly handle null/undefined cases from JOIN operations (bug fix)
        const artistName = Array.isArray(data.artists) && data.artists.length > 0
          ? data.artists[0]?.name
          : (data.artists as any)?.name || data.artist_name || null;
        
        const venueName = Array.isArray(data.venues) && data.venues.length > 0
          ? data.venues[0]?.name
          : (data.venues as any)?.name || data.venue_name || null;
        
        const normalizedEvent = {
          ...data,
          artist_name: artistName,
          venue_name: venueName,
        };
        
        setSelectedEvent(normalizedEvent);
        const interested = await UserEventService.isUserInterested(currentUserId, normalizedEvent.id);
        setSelectedEventInterested(interested);
        setEventDetailsOpen(true);
      }
    } catch (error) {
      console.error('Error fetching event details:', error);
    }
  };


  const getSocialProof = (event: PersonalizedEvent): string | null => {
    if (event.friends_interested_count && event.friends_interested_count > 0) {
      return `${event.friends_interested_count} friend${event.friends_interested_count !== 1 ? 's' : ''} going`;
    }
    if (event.interested_count && event.interested_count > 0) {
      return `${event.interested_count} people interested`;
    }
    return null;
  };

  const getRecommendationReason = (event: PersonalizedEvent): string => {
    // Simple heuristic - could be enhanced with actual relevance data
    if (event.friends_interested_count && event.friends_interested_count > 0) {
      return 'Because your friends are going';
    }
    if (event.relevance_score && event.relevance_score > 0.7) {
      return 'Because you rated similar shows highly';
    }
    return 'Based on your preferences';
  };

  const feedTypes = [
    { value: 'events', label: 'Events' },
    { value: 'reviews', label: 'Reviews' },
  ];
                      
                      return (
    <div 
      className="min-h-screen" style={{ backgroundColor: 'var(--neutral-50)' }}
    >
            {/* Mobile Header with dropdown aligned to left content edge */}
      {!hideHeader && (
        <MobileHeader menuOpen={menuOpen} onMenuClick={onMenuClick} badgeCount={unreadNotificationsCount + unreadFriendRequestsCount}>
          <div
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'flex-start',
              alignItems: 'center',
            }}
          >
            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="flex items-center gap-2"
                  style={{
                    backgroundColor: 'var(--neutral-50)',
                    borderColor: dropdownOpen ? 'var(--brand-pink-500)' : 'var(--neutral-200)',
                    borderWidth: '2px',
                    borderStyle: 'solid',
                    color: 'var(--neutral-900)',
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)',
                    transition: 'border-color 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--brand-pink-500)';
                  }}
                  onMouseLeave={(e) => {
                    if (!e.currentTarget.matches(':focus-visible') && !dropdownOpen) {
                      e.currentTarget.style.borderColor = 'var(--neutral-200)';
                    }
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--brand-pink-500)';
                    e.currentTarget.style.outline = '2px solid var(--brand-pink-500)';
                    e.currentTarget.style.outlineOffset = '2px';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.outline = 'none';
                    if (!dropdownOpen) {
                      e.currentTarget.style.borderColor = 'var(--neutral-200)';
                    }
                  }}
                  data-tour="feed-toggle"
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-meta-size, 16px)',
                      fontWeight: 'var(--typography-meta-weight, 500)',
                      lineHeight: 'var(--typography-meta-line-height, 1.5)',
                      color: 'var(--neutral-900)',
                    }}
                  >
                    {feedTypes.find((ft) => ft.value === selectedFeedType)?.label || 'Events'}
                  </span>
                  <ChevronDown className="h-4 w-4" style={{ color: 'var(--neutral-900)' }} />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                style={{
                  backgroundColor: 'var(--neutral-50)',
                  border: '2px solid var(--neutral-200)',
                  borderRadius: 'var(--radius-corner, 10px)',
                  boxShadow: '0 4px 4px 0 var(--shadow-color)',
                  padding: 'var(--spacing-inline, 6px)',
                  minWidth: '200px',
                }}
              >
                {feedTypes.map((feedType) => (
                  <DropdownMenuItem
                    key={feedType.value}
                    onClick={() => setSelectedFeedType(feedType.value)}
                    style={{
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-meta-size, 16px)',
                      fontWeight: 'var(--typography-meta-weight, 500)',
                      lineHeight: 'var(--typography-meta-line-height, 1.5)',
                      color: 'var(--neutral-900)',
                      padding: 'var(--spacing-small, 12px)',
                      borderRadius: 'var(--radius-corner, 10px)',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--brand-pink-050)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {feedType.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </MobileHeader>
      )}
      
      {/* JamBase Attribution - Top right corner, only for events feed */}
      {!hideHeader && selectedFeedType === 'events' && (
        <JamBaseHeaderAttribution />
      )}
      <main
        className="max-w-7xl mx-auto"
        style={{
          paddingLeft: 'var(--spacing-screen-margin-x, 20px)',
          paddingRight: 'var(--spacing-screen-margin-x, 20px)',
          paddingTop: hideHeader
            ? `calc(env(safe-area-inset-top, 0px) + var(--spacing-small, 12px))`
            : `calc(env(safe-area-inset-top, 0px) + 68px + var(--spacing-small, 12px))`,
          paddingBottom: 'var(--spacing-bottom-nav, 32px)',
          // Add extra padding when onboarding reminder banner is visible (approximately 60px banner height)
          marginTop: 'var(--onboarding-banner-height, 0px)',
        }}
      >
        {feedLocation && selectedFeedType !== 'events' && selectedFeedType !== 'reviews' && (
          <>
            {/* Radius selector - below box, right-aligned */}
            <div className="flex items-center justify-end gap-2" style={{ marginBottom: 'var(--spacing-small, 12px)', paddingRight: 'var(--spacing-screen-margin-x, 20px)' }}>
              <span style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-bold-weight, 700)', lineHeight: 'var(--typography-meta-line-height, 1.5)', color: 'var(--neutral-900)' }}>Radius:</span>
              <select
                value={feedLocation.radiusMiles}
                onChange={(e) => {
                  const newRadius = parseInt(e.target.value, 10);
                  setFeedLocation(prev => prev ? { ...prev, radiusMiles: newRadius } : null);
                  setFilters(prev => ({
                    ...prev,
                    radiusMiles: newRadius,
                  }));
                }}
                className="rounded px-2 py-1 focus:outline-none focus:ring-1" style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)', border: '1px solid var(--neutral-200)', backgroundColor: 'var(--neutral-50)', color: 'var(--neutral-900)' }}
              >
                {[1, 5, 10, 15, 20, 25, 30, 40, 50].map((radius) => (
                  <option key={radius} value={radius} style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>
                    {radius} mi
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        {/* Feed content based on selection */}
        {selectedFeedType === 'events' && (
          <UnifiedEventsFeed
            currentUserId={currentUserId}
            filters={filters}
            onEventClick={handleEventClick}
            onInterestToggle={async (eventId, interested) => {
              console.log('Interest toggled:', eventId, interested);
            }}
            onShareClick={async (event, e) => {
              e.stopPropagation();
              
              // Check if native share is available (iOS app)
              if (isNativeShareAvailable()) {
                // Use native SwiftUI share modal
                triggerNativeEventShare({
                  eventId: event.event_id,
                  title: event.title,
                  artistName: event.artist_name,
                  venueName: event.venue_name,
                  venueCity: event.venue_city,
                  eventDate: event.event_date,
                  imageUrl: event.image_url || event.poster_image_url,
                  posterImageUrl: event.poster_image_url,
                });
              } else {
                // Fallback to web modal
                setSelectedEventForShare({
                  id: event.event_id,
                  title: event.title,
                  artist_name: event.artist_name,
                  venue_name: event.venue_name,
                  venue_city: event.venue_city,
                  event_date: event.event_date,
                  image_url: event.image_url || event.poster_image_url,
                  poster_image_url: event.poster_image_url,
                });
                setShareModalOpen(true);
              }
            }}
          />
        )}
        {selectedFeedType === 'recommended' && (
              <PreferencesV4FeedSection
                userId={currentUserId}
                onEventClick={handleEventClick}
                filters={filters}
          />
        )}
        {selectedFeedType === 'trending' && (
          <div className="space-y-4">
              {loadingTrending && trendingEvents.length === 0 ? (
                <SynthLoadingInline text="Loading trending events..." size="md" />
              ) : (
                <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {trendingEvents.map((event) => {
                      return (
                      <CompactEventCard
                        key={event.event_id}
                        event={{
                          id: event.event_id,
                          title: event.title,
                          artist_name: event.artist_name,
                          venue_name: event.venue_name,
                          event_date: event.event_date,
                          venue_city: event.venue_city || undefined,
                          image_url: replaceJambasePlaceholder(event.event_media_url) || undefined,
                        }}
                        onClick={() => handleEventClick(event.event_id)}
                      />
                      );
                    })}
                  </div>
                  {trendingHasMore && (
                    <div className="flex justify-center pt-4">
                      <Button
                        variant="outline"
                      onClick={() => {
                        // Calculate next page and update ref BEFORE setState (React best practice)
                        const nextPage = trendingPageRef.current + 1;
                        trendingPageRef.current = nextPage;
                        setTrendingPage(nextPage);
                        // Use ref to get latest function reference (checked for null to prevent errors)
                        if (loadTrendingEventsRef.current) {
                          loadTrendingEventsRef.current(false);
                        }
                      }}
                        disabled={loadingTrending}
                      >
                        {loadingTrending ? (
                          <>
                          <SynthLoader variant="spinner" size="sm" />
                            Loading...
                          </>
                        ) : (
                        'Load More'
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
              </div>
        )}
        {selectedFeedType === 'friends' && (
          <div className="space-y-4">
            {loadingNetwork && firstDegreeEvents.length === 0 && secondDegreeEvents.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <SynthLoadingInline />
              </div>
              ) : (
                <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {[...firstDegreeEvents, ...secondDegreeEvents].map((event) => (
                      <CompactEventCard
                      key={event.event_id}
                        event={{
                          id: event.event_id,
                          title: event.title,
                        artist_name: event.artist_name,
                        venue_name: event.venue_name,
                          event_date: event.event_date,
                        venue_city: event.venue_city || undefined,
                        }}
                        onClick={() => handleEventClick(event.event_id)}
                      />
                  ))}
                  </div>
                  {friendsHasMore && (
                    <div className="flex justify-center pt-4">
                      <Button
                        variant="outline"
                      onClick={() => {
                        // Calculate next page and update ref BEFORE setState (React best practice)
                        const nextPage = friendsPageRef.current + 1;
                        friendsPageRef.current = nextPage;
                        setFriendsPage(nextPage);
                        // Use ref to get latest function reference (checked for null to prevent errors)
                        if (loadNetworkEventsRef.current) {
                          loadNetworkEventsRef.current(false);
                        }
                      }}
                        disabled={loadingNetwork}
                      >
                        {loadingNetwork ? (
                          <>
                          <SynthLoader variant="spinner" size="sm" />
                            Loading...
                          </>
                        ) : (
                        'Load More'
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
          </div>
        )}
        {selectedFeedType === 'group-chats' && (
          <div className="flex items-center justify-center py-24">
            <div className="text-center space-y-2">
              <MessageCircle className="w-12 h-12 mx-auto" style={{ color: 'var(--neutral-600)' }} />
              <h3 className="font-semibold" style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--typography-body-size, 20px)', fontWeight: 'var(--typography-body-weight, 500)', lineHeight: 'var(--typography-body-line-height, 1.5)' }}>Coming Soon</h3>
              <p className="text-muted-foreground" style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>
                Group chats are still in development
              </p>
            </div>
          </div>
        )}
        
        {/* Old group chat code - commented out */}
        {false && selectedFeedType === 'group-chats-old' && (
          <div className="space-y-4">
            {loadingRecommendedGroupChats ? (
              <div className="flex items-center justify-center py-12">
                <SynthLoadingInline />
              </div>
            ) : recommendedGroupChats.length === 0 ? (
              <div className="text-center py-12" style={{ color: 'var(--neutral-600)' }}>
                <p>No recommended chats at this time.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {(() => {
                  const firstThreeChats = recommendedGroupChats.slice(0, 3);
                  const remainingChats = recommendedGroupChats.slice(3);
                  
                  return (
                    <>
                      {/* First 3 group chats */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {firstThreeChats.map((chat) => {
                  const imageUrl = replaceJambasePlaceholder(chat.entity_image_url) || '';
                  const hasImage = imageUrl && imageUrl.trim() !== '';
                  const isJoining = joiningGroupChats.has(chat.id);
                  const isJoined = joinedGroupChats.has(chat.id);
                  
                  // Format member count - SIMPLIFIED APPROACH
                  // Since data shows member_count is always a number (0), format directly
                  const count = chat.member_count ?? 0;
                  const countNum = typeof count === 'number' ? Math.floor(Math.max(0, count)) : 0;
                  
                  // Create the text string directly - ensure it's a clean string
                  // IMPORTANT: This is the ONLY place we format the text
                  let memberCountText: string;
                  if (countNum === 0) {
                    memberCountText = '0 members';
                  } else if (countNum === 1) {
                    memberCountText = '1 member';
                  } else {
                    memberCountText = String(countNum) + ' members';
                  }
                  
                  // Final safety: remove any "members0" pattern
                  memberCountText = memberCountText.replace(/members0/g, 'members');
                  
                  // Debug log to see what we're creating
                  console.log('🔍 Member count debug:', { 
                    chatId: chat.id, 
                    chatName: chat.chat_name,
                    rawCount: chat.member_count, 
                    countNum, 
                    memberCountText,
                    memberCountTextLength: memberCountText.length,
                    memberCountTextChars: memberCountText.split('').map(c => `${c} (${c.charCodeAt(0)})`).join(', ')
                  });
                  
                  return (
                    <div
                      key={chat.id}
                      className="relative flex flex-col items-center gap-2 p-4 cursor-pointer hover:shadow-md transition-all" 
                      style={{ borderRadius: '10px', backgroundColor: 'var(--neutral-50)', border: '2px solid var(--neutral-200)' }}
                      onClick={() => {
                        if (isJoined) {
                          // Only navigate if already joined
                          onNavigateToChat?.(chat.id);
                        }
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && isJoined) {
                          e.preventDefault();
                          onNavigateToChat?.(chat.id);
                        }
                      }}
                      tabIndex={isJoined ? 0 : -1}
                      role={isJoined ? "button" : undefined}
                      aria-label={isJoined ? `Open chat: ${chat.chat_name || chat.entity_name}` : undefined}
                    >
                      {!isJoined && (
                        <Button
                          size="sm"
                          variant="default"
                          className="absolute top-2 right-2 z-10 h-7 w-7 p-0 rounded-full" 
                          style={{ backgroundColor: 'var(--brand-pink-500)', color: 'var(--neutral-50)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--brand-pink-600)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--brand-pink-500)'; }}
                          onClick={(e) => handleJoinGroupChat(chat.id, e)}
                          disabled={isJoining}
                        >
                          {isJoining ? (
                            <SynthLoader variant="spinner" size="sm" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      {hasImage ? (
                        <img
                          src={imageUrl}
                          alt={chat.entity_name || chat.chat_name}
                          className="w-full aspect-square object-cover" style={{ borderRadius: '10px' }}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = getFallbackEventImage(chat.id);
                            target.onerror = null;
                          }}
                        />
                      ) : (
                        <div className="w-full aspect-square flex flex-col items-center justify-center p-2" style={{ borderRadius: '10px', backgroundColor: 'var(--neutral-100)' }}>
                          {/* TODO: Replace gradient with approved gradient token or neutral background */}
                          <MessageSquare className="w-8 h-8 mb-1" style={{ color: 'var(--brand-pink-500)' }} />
                          <p className="text-[10px] font-semibold text-center line-clamp-2" style={{ color: 'var(--brand-pink-500)' }}>
                            {chat.chat_name}
                          </p>
                        </div>
                      )}
                      <div className="w-full text-center">
                        <p className="font-semibold line-clamp-1 mb-1" style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>{chat.chat_name}</p>
                        <p style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)', color: 'var(--neutral-600)' }}>
                          {/* Render ONLY memberCountText - create single string to avoid multiple children */}
                          {(() => {
                            const baseText = String(memberCountText || '0 members');
                            const friendsText = chat.friends_in_chat_count && chat.friends_in_chat_count > 0
                              ? ` • ${chat.friends_in_chat_count} friend${chat.friends_in_chat_count !== 1 ? 's' : ''}`
                              : '';
                            return baseText + friendsText;
                          })()}
                        </p>
                      </div>
                    </div>
                  );
                        })}
                      </div>
                      
                      {/* Friend Suggestions Rail - Insert after first 3 chats */}
                      {friendSuggestionsForRail.length > 0 && (
                        <FriendSuggestionsRail
                          suggestions={friendSuggestionsForRail}
                          onUserClick={(userId) => onNavigateToProfile?.(userId)}
                          onAddFriend={handleSendFriendRequestForRail}
                        />
                      )}
                      
                      {/* Remaining group chats */}
                      {remainingChats.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {remainingChats.map((chat) => {
                            const imageUrl = replaceJambasePlaceholder(chat.entity_image_url) || '';
                            const hasImage = imageUrl && imageUrl.trim() !== '';
                            const isJoining = joiningGroupChats.has(chat.id);
                            const isJoined = joinedGroupChats.has(chat.id);
                            
                            const count = chat.member_count ?? 0;
                            const countNum = typeof count === 'number' ? Math.floor(Math.max(0, count)) : 0;
                            
                            let memberCountText: string;
                            if (countNum === 0) {
                              memberCountText = '0 members';
                            } else if (countNum === 1) {
                              memberCountText = '1 member';
                            } else {
                              memberCountText = String(countNum) + ' members';
                            }
                            
                            memberCountText = memberCountText.replace(/members0/g, 'members');
                            
                            return (
                              <div
                                key={chat.id}
                                className="relative flex flex-col items-center gap-2 p-4 cursor-pointer hover:shadow-md transition-all" style={{ borderRadius: '10px', backgroundColor: 'var(--neutral-50)', border: '2px solid var(--neutral-200)' }}
                                onClick={() => {
                                  if (isJoined) {
                                    onNavigateToChat?.(chat.id);
                                  }
                                }}
                              >
                                {!isJoined && (
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="absolute top-2 right-2 z-10 h-7 w-7 p-0 rounded-full" 
                          style={{ backgroundColor: 'var(--brand-pink-500)', color: 'var(--neutral-50)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--brand-pink-600)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--brand-pink-500)'; }}
                                    onClick={(e) => handleJoinGroupChat(chat.id, e)}
                                    disabled={isJoining}
                                  >
                                    {isJoining ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Plus className="h-4 w-4" />
                                    )}
                                  </Button>
                                )}
                                {hasImage ? (
                                  <img
                                    src={imageUrl}
                                    alt={chat.entity_name || chat.chat_name}
                                    className="w-full aspect-square object-cover" style={{ borderRadius: '10px' }}
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.src = getFallbackEventImage(chat.id);
                                      target.onerror = null;
                                    }}
                                  />
                                ) : (
                                  <div className="w-full aspect-square flex flex-col items-center justify-center p-2 bg-gradient-to-br from-synth-pink/20 to-synth-pink/40" style={{ borderRadius: '10px' }}>
                                    <MessageSquare className="w-8 h-8 text-synth-pink mb-1" />
                                    <p className="text-[10px] font-semibold text-synth-pink text-center line-clamp-2">
                                      {chat.chat_name}
                                    </p>
                                  </div>
                                )}
                                <div className="w-full text-center">
                                  <p className="text-sm font-semibold line-clamp-1 mb-1">{chat.chat_name}</p>
                                  <p className="text-xs" style={{ color: 'var(--neutral-600)' }}>
                                    {(() => {
                                      const baseText = String(memberCountText || '0 members');
                                      const friendsText = chat.friends_in_chat_count && chat.friends_in_chat_count > 0
                                        ? ` • ${chat.friends_in_chat_count} friend${chat.friends_in_chat_count !== 1 ? 's' : ''}`
                                        : '';
                                      return baseText + friendsText;
                                    })()}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}
        {selectedFeedType === 'reviews' && (
          <div className="space-y-4">
          {loadingReviews ? (
            <div className="flex items-center justify-center py-12">
              <SynthLoadingInline />
            </div>
          ) : reviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center" style={{ gap: 'var(--spacing-inline, 6px)', paddingTop: 'var(--spacing-grouped, 24px)', paddingBottom: 'var(--spacing-grouped, 24px)' }}>
              {/* Large icon (60px), dark grey - using MessageSquare for reviews */}
              <Icon name="squareComment" size={60} alt="" color="var(--neutral-600)" />
              {/* Heading - Body typography, off black */}
              <p style={{ 
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-body-size, 20px)',
                fontWeight: 'var(--typography-body-weight, 500)',
                lineHeight: 'var(--typography-body-line-height, 1.5)',
                color: 'var(--neutral-900)',
                margin: 0,
                textAlign: 'center'
              }}>No reviews yet</p>
              {/* Description - Meta typography, dark grey */}
              <p style={{ 
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)',
                color: 'var(--neutral-600)',
                margin: 0,
                textAlign: 'center'
              }}>Be the first to review an event!</p>
                  </div>
                ) : (
              <div className="space-y-3">
              {reviews.map((review) => (
                <SwiftUIReviewCard
                  key={review.id}
                  review={{
                    id: review.id,
                    user_id: review.author.id,
                    event_id: (review.event_info as any)?.event_id || '',
                    artist_id: review.artist_id,
                    rating: review.rating,
                    review_text: review.content,
                    is_public: true,
                    created_at: review.created_at,
                    updated_at: review.created_at,
                    likes_count: 0,
                    comments_count: 0,
                    shares_count: 0,
                    is_liked_by_user: false,
                    reaction_emoji: '',
                    photos: review.photos || [],
                    videos: [],
                    mood_tags: [],
                    genre_tags: [],
                    context_tags: [],
                    artist_name: review.event_info?.artist_name,
                    venue_name: review.event_info?.venue_name,
                    Event_date: review.event_info?.event_date,
                  } as ReviewWithEngagement}
                  mode="compact"
                  currentUserId={currentUserId}
                  artistImageUrl={review.artist_image_url}
                  userProfile={{
                    name: review.author.name,
                    avatar_url: review.author.avatar_url || undefined,
                  }}
                  onOpenDetail={() => {
                    // Convert NetworkReview to UnifiedFeedItem format for the modal
                    const unifiedReview: UnifiedFeedItem = {
                      id: review.id,
                      type: 'review',
                      title: review.event_info?.artist_name || 'Review',
                      author: review.author,
                      created_at: review.created_at,
                      content: review.content,
                      rating: review.rating,
                      photos: review.photos,
                      event_info: review.event_info,
                      relevance_score: 0,
                    };
                    setSelectedReview(unifiedReview);
                    setReviewDetailOpen(true);
                  }}
                />
              ))}
            </div>
          )}
          </div>
        )}

      {/* Event Details Modal */}
      {eventDetailsOpen && selectedEvent && (
        <EventDetailsModal
          isOpen={eventDetailsOpen}
          onClose={() => {
            setEventDetailsOpen(false);
            setSelectedEvent(null);
          }}
          event={selectedEvent}
          currentUserId={currentUserId}
          isInterested={selectedEventInterested}
          onInterestToggle={async (eventId, interested) => {
            // Tracking is handled in UserEventService.setEventInterest
            try {
              await UserEventService.setEventInterest(currentUserId, eventId, interested);
              setSelectedEventInterested(interested);
            } catch (error) {
              console.error('Error toggling interest:', error);
            }
          }}
          onReview={() => {
            console.log('Review event:', selectedEvent.id);
          }}
          onNavigateToProfile={onNavigateToProfile}
          onNavigateToChat={onNavigateToChat}
        />
      )}

      {/* Review Detail Modal */}
      {reviewDetailOpen && selectedReview && (
        <Dialog open={reviewDetailOpen} onOpenChange={setReviewDetailOpen}>
          <DialogContent
            className="fixed inset-0 z-[100] max-w-none w-full h-full m-0 p-0 overflow-hidden rounded-none"
            style={{
              left: 0,
              top: 0,
              transform: 'none',
              width: '100vw',
              height: '100vh',
              maxWidth: '100vw',
              maxHeight: '100vh',
              borderRadius: 0,
              border: 'none',
              boxShadow: 'none',
              backgroundColor: 'var(--neutral-50)',
            }}
          >
            <DialogTitle className="sr-only">Review Details</DialogTitle>
            <DialogDescription className="sr-only">
              Detailed view of {selectedReview.author.name}'s review
            </DialogDescription>
            <ReviewDetailView
              reviewId={selectedReview.review_id || selectedReview.id}
              currentUserId={currentUserId}
              onBack={() => setReviewDetailOpen(false)}
              onEdit={() => {
                // TODO: Implement edit functionality
              }}
              onDelete={() => {
                // TODO: Implement delete functionality
              }}
              onOpenArtist={(artistId, artistName) => {
                // Close the review detail dialog so we don't keep the review header,
                // then open the global artist detail card (which uses the standard header layout).
                setReviewDetailOpen(false);
                window.dispatchEvent(
                  new CustomEvent('open-artist-card', {
                    detail: { artistId, artistName },
                  })
                );
              }}
              onOpenVenue={(venueId, venueName) => {
                // Close the review detail dialog and open the global venue detail card.
                setReviewDetailOpen(false);
                window.dispatchEvent(
                  new CustomEvent('open-venue-card', {
                    detail: { venueId, venueName },
                  })
                );
              }}
              onOpenProfile={(userId) => {
                if (onNavigateToProfile) {
                  onNavigateToProfile(userId);
                } else {
                  // Fallback to navigate if callback not available
                  navigate(`/profile/${userId}`);
                }
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Event Share Modal (fallback for web) */}
      {shareModalOpen && selectedEventForShare && (
        <EventShareModal
          event={selectedEventForShare}
          currentUserId={currentUserId}
          isOpen={shareModalOpen}
          onClose={() => {
            setShareModalOpen(false);
            setSelectedEventForShare(null);
          }}
        />
      )}

      {/* Flag Content Modal */}
      {flaggedEvent && (
        <FlagContentModal
          isOpen={flagModalOpen}
          onClose={() => {
            setFlagModalOpen(false);
            setFlaggedEvent(null);
          }}
          contentType="event"
          contentId={flaggedEvent.id}
          contentTitle={flaggedEvent.title}
        />
      )}

      {/* Artist Detail Modal */}
      {artistModalOpen && selectedArtistId && (
        <ArtistDetailModal
          isOpen={artistModalOpen}
          onClose={() => {
            setArtistModalOpen(false);
            setSelectedArtistId(null);
            setSelectedArtistName('');
          }}
          artistId={selectedArtistId}
          artistName={selectedArtistName}
          currentUserId={currentUserId}
        />
      )}

      {/* Venue Detail Modal */}
      {venueModalOpen && selectedVenueId && (
        <VenueDetailModal
          isOpen={venueModalOpen}
          onClose={() => {
            setVenueModalOpen(false);
            setSelectedVenueId(null);
            setSelectedVenueName('');
          }}
          venueId={selectedVenueId}
          venueName={selectedVenueName}
          currentUserId={currentUserId}
        />
      )}
    </main>
    </div>
  );
};
