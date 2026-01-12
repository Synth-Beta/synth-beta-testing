import React, { useState, useEffect, useRef } from 'react';
import { PersonalizedFeedService, type PersonalizedEvent, type FeedItem } from '@/services/personalizedFeedService';
import { HomeFeedService, type NetworkEvent, type EventList, type TrendingEvent, type NetworkReview } from '@/services/homeFeedService';
import { UnifiedFeedService, type UnifiedFeedItem } from '@/services/unifiedFeedService';
import { UserEventService } from '@/services/userEventService';
import { SimpleEventRecommendationService } from '@/services/simpleEventRecommendationService';
import { UserVisibilityService } from '@/services/userVisibilityService';
import { supabase } from '@/integrations/supabase/client';
import { HomeFeedHeader, type DateWindow } from './HomeFeedHeader';
import { NetworkEventsSection } from './NetworkEventsSection';
import { EventListsCarousel } from './EventListsCarousel';
import { CompactEventCard } from './CompactEventCard';
import { FigmaEventCard } from '@/components/cards/FigmaEventCard';
import { NetworkReviewCard } from './NetworkReviewCard';
import { BelliStyleReviewCard } from '@/components/reviews/BelliStyleReviewCard';
import { PreferencesV4FeedSection } from './PreferencesV4FeedSection';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { EventFilters, type FilterState } from '@/components/search/EventFilters';
import { Users, Sparkles, TrendingUp, UserPlus, UserCheck, MessageSquare, MessageCircle, ChevronRight, ChevronDown, MapPin, Plus, Loader2 } from 'lucide-react';
import { SynthLoadingInline, SynthLoader } from '@/components/ui/SynthLoader';
import { FriendSuggestionsRail } from '@/components/feed/FriendSuggestionsRail';
import { FriendsService } from '@/services/friendsService';
import { Button } from '@/components/ui/button';
import { FlagContentModal } from '@/components/moderation/FlagContentModal';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { LocationService } from '@/services/locationService';
import { getFallbackEventImage } from '@/utils/eventImageFallbacks';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';

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
  onNavigateToChat?: (userId: string) => void;
  onViewChange?: (view: 'feed' | 'search' | 'profile') => void;
}

export const HomeFeed: React.FC<HomeFeedProps> = ({
  currentUserId,
  onNavigateToProfile,
  onNavigateToChat,
  onNavigateToNotifications,
  onViewChange,
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

  // Feed type selection
  const [selectedFeedType, setSelectedFeedType] = useState<string>('recommended');

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

  // Review detail modal
  const [selectedReview, setSelectedReview] = useState<UnifiedFeedItem | null>(null);
  const [reviewDetailOpen, setReviewDetailOpen] = useState(false);

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

  // Load user's active city and apply to filters
  useEffect(() => {
    loadUserCity();
    loadFeedLocation(); // Also load location for feed filtering
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

  // Load feed data when feed type changes
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
    }
  }, [selectedFeedType]);

  // Reload sections when filters change (but NOT for friends feed - no filters on friends feed)
  useEffect(() => {
    if (selectedFeedType === 'trending') {
    loadTrendingEvents(true);
    }
    // Friends feed does NOT reload on filter changes - it shows all events
  }, [filters.genres, filters.selectedCities, filters.dateRange]);

  // Load user location for feed filtering - ALWAYS use lat/long + radius, NEVER city names
  const loadFeedLocation = async () => {
    try {
      // Always get current location from geolocation first
      let currentLocation: { latitude: number; longitude: number } | null = null;
      let currentLocationName = 'Current Location';

      try {
        currentLocation = await LocationService.getCurrentLocation();
        const cityName = await LocationService.reverseGeocode(
          currentLocation.latitude,
          currentLocation.longitude
        );
        if (cityName) {
          currentLocationName = cityName;
        }
      } catch (geoError) {
        console.error('Error getting current location:', geoError);
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

  const loadNetworkEvents = async (reset: boolean = false) => {
    if (reset) {
      setFriendsPage(0);
    setLoadingNetwork(true);
    }
    try {
      const pageSize = 18;
      const [firstDegree, secondDegree] = await Promise.all([
        HomeFeedService.getFirstDegreeNetworkEvents(currentUserId, (friendsPage + 1) * 10),
        HomeFeedService.getSecondDegreeNetworkEvents(currentUserId, (friendsPage + 1) * 8),
      ]);
      
      // NO FILTERS - show all events that any friend is going to
      // Split into first and second degree
      if (reset) {
        setFirstDegreeEvents(firstDegree.slice(0, 10));
        setSecondDegreeEvents(secondDegree.slice(0, 8));
      } else {
        setFirstDegreeEvents(prev => [...prev, ...firstDegree.slice(friendsPage * 10, (friendsPage + 1) * 10)]);
        setSecondDegreeEvents(prev => [...prev, ...secondDegree.slice(friendsPage * 8, (friendsPage + 1) * 8)]);
      }
      
      const totalEvents = firstDegree.length + secondDegree.length;
      setFriendsHasMore(totalEvents > (friendsPage + 1) * pageSize);
    } catch (error) {
      console.error('Error loading network events:', error);
      if (reset) {
      setFirstDegreeEvents([]);
      setSecondDegreeEvents([]);
      }
    } finally {
      setLoadingNetwork(false);
    }
  };

  const loadMoreFriends = () => {
    if (!loadingNetwork && friendsHasMore) {
      setFriendsPage(prev => prev + 1);
      loadNetworkEvents(false);
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
    events: T[]
  ): T[] => {
    console.log('🔍 [FILTER] applyFiltersToEvents called:', { 
      eventCount: events.length, 
      filters: {
        selectedCities: filters.selectedCities,
        dateRange: filters.dateRange,
        genres: filters.genres
      }
    });
    
    const filtered = events.filter((event, index) => {
      // Date filter
      if (filters.dateRange.from || filters.dateRange.to) {
        if (!event.event_date) {
          console.log(`🔍 [FILTER] Event ${index} filtered out: no event_date`);
          return false;
        }
        const eventDate = new Date(event.event_date);
        if (filters.dateRange.from && eventDate < filters.dateRange.from) {
          console.log(`🔍 [FILTER] Event ${index} filtered out: before date range`, eventDate);
          return false;
        }
        if (filters.dateRange.to) {
          const toDate = new Date(filters.dateRange.to);
          toDate.setHours(23, 59, 59, 999);
          if (eventDate > toDate) {
            console.log(`🔍 [FILTER] Event ${index} filtered out: after date range`, eventDate);
            return false;
          }
        }
      }

      // City filter removed - location filtering is done by coordinates in the service layer

      // Genre filter (skip if genres not available on event)
      if (filters.genres && filters.genres.length > 0) {
        const eventGenres = (event.genres || []).map((g: string) => g.toLowerCase());
        if (eventGenres.length === 0) {
          console.log(`🔍 [FILTER] Event ${index} filtered out: no genres`);
          return false; // No genres on event, skip if genre filter active
        }
        const matches = filters.genres.some(genre => 
          eventGenres.some((eg: string) => eg.includes(genre.toLowerCase()) || genre.toLowerCase().includes(eg))
        );
        if (!matches) {
          console.log(`🔍 [FILTER] Event ${index} filtered out: genre mismatch`, { eventGenres, filterGenres: filters.genres });
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

  const loadTrendingEvents = async (reset: boolean = false) => {
    console.log('🔥 [TRENDING] loadTrendingEvents called', { reset, trendingPage, cityCoordinates });
    
    if (reset) {
      setTrendingPage(0);
      setLoadingTrending(true);
    }
    try {
      const pageSize = 12;
      console.log('🔥 [TRENDING] Calling getTrendingEvents with params:', {
        userId: currentUserId,
        cityLat: cityCoordinates?.lat,
        cityLng: cityCoordinates?.lng,
        radiusMiles: 50,
        limit: (trendingPage + 1) * pageSize,
        activeCity,
      });
      
      const events = await HomeFeedService.getTrendingEvents(
        currentUserId,
        cityCoordinates?.lat,
        cityCoordinates?.lng,
        50,
        (trendingPage + 1) * pageSize,
        activeCity || undefined
      );
      
      console.log('🔥 [TRENDING] getTrendingEvents returned:', { eventCount: events.length, events });
      
      // Apply filters
      const filteredEvents = applyFiltersToEvents(events);
      console.log('🔥 [TRENDING] After applying filters:', { filteredCount: filteredEvents.length });
      
      if (reset) {
        setTrendingEvents(filteredEvents.slice(0, pageSize));
        console.log('🔥 [TRENDING] Set trending events (reset):', filteredEvents.slice(0, pageSize).length);
      } else {
        setTrendingEvents(prev => {
          const newEvents = [...prev, ...filteredEvents.slice(trendingPage * pageSize, (trendingPage + 1) * pageSize)];
          console.log('🔥 [TRENDING] Set trending events (append):', { prevCount: prev.length, newCount: newEvents.length });
          return newEvents;
        });
      }
      
      setTrendingHasMore(filteredEvents.length > (trendingPage + 1) * pageSize);
      console.log('🔥 [TRENDING] Load complete:', { hasMore: filteredEvents.length > (trendingPage + 1) * pageSize });
    } catch (error) {
      console.error('❌ [TRENDING] Error loading trending events:', error);
      if (reset) setTrendingEvents([]);
    } finally {
      setLoadingTrending(false);
      console.log('🔥 [TRENDING] Loading state set to false');
    }
  };

  const loadMoreTrending = () => {
    if (!loadingTrending && trendingHasMore) {
      setTrendingPage(prev => prev + 1);
      loadTrendingEvents(false);
    }
  };

  const loadRecommendedFriends = async () => {
    setLoadingRecommendedFriends(true);
    try {
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

      // Combine and sort by mutual friends count (if available) or connection degree
      const allFriends = [...secondDegree, ...thirdDegree]
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
    try {
      const { error } = await supabase.rpc('create_friend_request', {
        receiver_user_id: userId
      });

      if (error) throw error;

      // Update the friend suggestions list to remove the user we just sent a request to
      setFriendSuggestionsForRail(prev => prev.filter(f => f.user_id !== userId));
    } catch (error: any) {
      console.error('Error sending friend request:', error);
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
    try {
      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (data) {
        setSelectedEvent(data);
        const interested = await UserEventService.isUserInterested(currentUserId, data.id);
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
    { value: 'recommended', label: 'Hand Picked Events' },
    { value: 'trending', label: 'Trending Events' },
    { value: 'friends', label: 'Friends Interested' },
    { value: 'group-chats', label: 'Recommended Group Chats' },
    { value: 'reviews', label: 'Reviews' },
  ];
                      
                      return (
    <div 
      className="min-h-screen bg-[#fcfcfc]"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'max(5rem, calc(5rem + env(safe-area-inset-bottom, 0px)))'
      }}
    >
      {/* Top bar with feed type dropdown and menu */}
      <div className="bg-[#fcfcfc] border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex-1 flex justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2 bg-white" data-tour="feed-toggle">
                  {feedTypes.find(ft => ft.value === selectedFeedType)?.label || 'Hand Picked Events'}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-white">
                {feedTypes.map((feedType) => (
                  <DropdownMenuItem
                    key={feedType.value}
                    onClick={() => setSelectedFeedType(feedType.value)}
                  >
                    {feedType.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-6">
        {/* Location Filter - compact info section above feeds */}
        {feedLocation && (
          <div className="mb-3 flex items-center justify-between gap-4 text-xs text-gray-600 bg-white rounded-md px-3 py-2 border border-gray-200">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-gray-700">Location:</span>
                <span className="truncate">
                  {feedLocation.locationName || 'Not set'}
                </span>
              </div>
              {feedLocation.specifiedLocationName && (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-gray-700">Specified:</span>
                  <span className="truncate">
                    {feedLocation.specifiedLocationName}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="font-medium text-gray-700">Radius:</span>
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
                className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400"
              >
                {[1, 5, 10, 15, 20, 25, 30, 40, 50].map((radius) => (
                  <option key={radius} value={radius}>
                    {radius} mi
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {/* Feed content based on selection */}
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
                          image_url: event.event_media_url || undefined,
                        }}
                        onClick={() => handleEventClick(event.event_id)}
                        onFlagClick={() => {
                          setFlaggedEvent({ id: event.event_id, title: event.title });
                          setFlagModalOpen(true);
                        }}
                      />
                      );
                    })}
                  </div>
                  {trendingHasMore && (
                    <div className="flex justify-center pt-4">
                      <Button
                        variant="outline"
                      onClick={() => {
                        setTrendingPage(prev => prev + 1);
                        loadTrendingEvents(false);
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
                        setFriendsPage(prev => prev + 1);
                        loadNetworkEvents(false);
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
              <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground" />
              <h3 className="text-lg font-semibold">Coming Soon</h3>
              <p className="text-sm text-muted-foreground">
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
              <div className="text-center py-12 text-muted-foreground">
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
                  const imageUrl = chat.entity_image_url || '';
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
                      className="relative flex flex-col items-center gap-2 p-4 bg-white border-2 border-gray-200 rounded-lg cursor-pointer hover:border-synth-pink/30 hover:shadow-md transition-all"
                      onClick={() => {
                        if (isJoined) {
                          // Only navigate if already joined
                          onNavigateToChat?.(chat.id);
                        }
                      }}
                    >
                      {!isJoined && (
                        <Button
                          size="sm"
                          variant="default"
                          className="absolute top-2 right-2 z-10 h-7 w-7 p-0 rounded-full bg-synth-pink hover:bg-synth-pink/90 text-white"
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
                          className="w-full aspect-square object-cover rounded-lg"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = getFallbackEventImage(chat.id);
                            target.onerror = null;
                          }}
                        />
                      ) : (
                        <div className="w-full aspect-square flex flex-col items-center justify-center p-2 bg-gradient-to-br from-synth-pink/20 to-synth-pink/40 rounded-lg">
                          <MessageSquare className="w-8 h-8 text-synth-pink mb-1" />
                          <p className="text-[10px] font-semibold text-synth-pink text-center line-clamp-2">
                            {chat.chat_name}
                          </p>
                        </div>
                      )}
                      <div className="w-full text-center">
                        <p className="text-sm font-semibold line-clamp-1 mb-1">{chat.chat_name}</p>
                        <p className="text-xs text-gray-600">
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
                            const imageUrl = chat.entity_image_url || '';
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
                                className="relative flex flex-col items-center gap-2 p-4 bg-white border-2 border-gray-200 rounded-lg cursor-pointer hover:border-synth-pink/30 hover:shadow-md transition-all"
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
                                    className="absolute top-2 right-2 z-10 h-7 w-7 p-0 rounded-full bg-synth-pink hover:bg-synth-pink/90 text-white"
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
                                    className="w-full aspect-square object-cover rounded-lg"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.src = getFallbackEventImage(chat.id);
                                      target.onerror = null;
                                    }}
                                  />
                                ) : (
                                  <div className="w-full aspect-square flex flex-col items-center justify-center p-2 bg-gradient-to-br from-synth-pink/20 to-synth-pink/40 rounded-lg">
                                    <MessageSquare className="w-8 h-8 text-synth-pink mb-1" />
                                    <p className="text-[10px] font-semibold text-synth-pink text-center line-clamp-2">
                                      {chat.chat_name}
                                    </p>
                                  </div>
                                )}
                                <div className="w-full text-center">
                                  <p className="text-sm font-semibold line-clamp-1 mb-1">{chat.chat_name}</p>
                                  <p className="text-xs text-gray-600">
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
            <div className="text-center py-12 text-muted-foreground">
              <p>No reviews yet. Be the first to review an event!</p>
                  </div>
                ) : (
              <div className="space-y-3">
              {reviews.map((review) => (
                <NetworkReviewCard
                  key={review.id}
                  review={{
                    id: review.id,
                    author: {
                      id: review.author.id,
                      name: review.author.name,
                      avatar_url: review.author.avatar_url,
                    },
                    created_at: review.created_at,
                    rating: review.rating,
                    content: review.content,
                    photos: review.photos,
                    event_info: review.event_info,
                  }}
                  onClick={() => {
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
      </div>

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
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogTitle className="sr-only">Review Details</DialogTitle>
            <DialogDescription className="sr-only">
              Detailed view of {selectedReview.author.name}'s review
            </DialogDescription>
            <BelliStyleReviewCard
              review={{
                id: selectedReview.review_id || selectedReview.id,
                user_id: selectedReview.author.id,
                event_id: (selectedReview.event_info as any)?.event_id || '',
                rating: selectedReview.rating || 0,
                review_text: selectedReview.content || '',
                is_public: selectedReview.is_public ?? true,
                created_at: selectedReview.created_at,
                updated_at: selectedReview.updated_at || selectedReview.created_at,
                likes_count: selectedReview.likes_count || 0,
                comments_count: selectedReview.comments_count || 0,
                shares_count: selectedReview.shares_count || 0,
                is_liked_by_user: selectedReview.is_liked || false,
                reaction_emoji: '',
                photos: selectedReview.photos || [],
                videos: [],
                mood_tags: [],
                genre_tags: [],
                context_tags: [],
                artist_name: selectedReview.event_info?.artist_name,
                artist_id: selectedReview.event_info?.artist_id,
                venue_name: selectedReview.event_info?.venue_name,
                venue_id: (selectedReview.event_info as any)?.venue_id,
                artist_performance_rating: (selectedReview as any).artist_performance_rating,
                production_rating: (selectedReview as any).production_rating,
                venue_rating: (selectedReview as any).venue_rating,
                location_rating: (selectedReview as any).location_rating,
                value_rating: (selectedReview as any).value_rating,
                artist_performance_feedback: (selectedReview as any).artist_performance_feedback,
                production_feedback: (selectedReview as any).production_feedback,
                venue_feedback: (selectedReview as any).venue_feedback,
                location_feedback: (selectedReview as any).location_feedback,
                value_feedback: (selectedReview as any).value_feedback,
              }}
              currentUserId={currentUserId}
              onLike={async () => {
                // TODO: Implement like functionality
              }}
              onComment={() => {
                // TODO: Implement comment functionality
              }}
              onShare={() => {
                // TODO: Implement share functionality
              }}
              userProfile={{
                name: selectedReview.author.name,
                avatar_url: selectedReview.author.avatar_url,
                verified: selectedReview.author.verified,
                account_type: selectedReview.author.account_type,
              }}
            />
          </DialogContent>
        </Dialog>
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
    </div>
  );
};
