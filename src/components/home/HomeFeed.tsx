import React, { useState, useEffect, useRef } from 'react';
import { PersonalizedFeedService, type PersonalizedEvent, type FeedItem } from '@/services/personalizedFeedService';
import { HomeFeedService, type NetworkEvent, type EventList, type TrendingEvent } from '@/services/homeFeedService';
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
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { EventFilters, type FilterState } from '@/components/search/EventFilters';
import { Loader2, Users, Sparkles, TrendingUp, UserPlus, UserCheck, MessageSquare, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { LocationService } from '@/services/locationService';
import { getFallbackEventImage } from '@/utils/eventImageFallbacks';

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
  const [reviews, setReviews] = useState<UnifiedFeedItem[]>([]);
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
  }, [currentUserId]);

  // Automatically apply location to filters (from profile or geolocation)
  useEffect(() => {
    const applyLocationFilter = async () => {
      // First, try to use the user's saved city from profile
      if (activeCity) {
        console.log('📍 Using saved city from profile:', activeCity);
        
        setFilters(prev => {
          // Don't overwrite if user already selected cities
          if (prev.selectedCities && prev.selectedCities.length > 0) {
            console.log('📍 User already has cities selected, not overwriting:', prev.selectedCities);
            locationAutoAppliedRef.current = true;
            return prev;
          }
          
          locationAutoAppliedRef.current = true;
          return {
            ...prev,
            selectedCities: [activeCity],
          };
        });
        
        console.log('✅ Location filter applied from profile:', activeCity);
        return;
      }

      // If no saved city and not already applied, try geolocation
      if (locationAutoAppliedRef.current) {
        return;
      }

      try {
        console.log('📍 No saved city, getting current location via geolocation...');
        const currentLocation = await LocationService.getCurrentLocation();
        console.log('📍 Got location coordinates:', currentLocation);
        
        // Reverse geocode to get city name
        const cityName = await LocationService.reverseGeocode(
          currentLocation.latitude,
          currentLocation.longitude
        );
        
        console.log('📍 Reverse geocode result:', cityName);
        
        if (cityName) {
          console.log('📍 Applying location filter from geolocation:', cityName);
          locationAutoAppliedRef.current = true;
          
          // Use functional update to check current state and update
          setFilters(prev => {
            // Don't overwrite if user already selected cities
            if (prev.selectedCities && prev.selectedCities.length > 0) {
              console.log('📍 User already has cities selected, not overwriting:', prev.selectedCities);
              return prev;
            }
            
            return {
              ...prev,
              selectedCities: [cityName],
            };
          });
          
          console.log('✅ Location filter applied successfully from geolocation:', cityName);
        } else {
          console.log('📍 No city name found from reverse geocoding');
          locationAutoAppliedRef.current = true;
        }
      } catch (error) {
        console.error('📍 Error getting current location:', error);
        // Mark as applied even on error to prevent retrying
        locationAutoAppliedRef.current = true;
      }
    };

    applyLocationFilter();
  }, [activeCity]); // Re-run when activeCity changes (loaded from profile)

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

  // Reload sections when filters change
  useEffect(() => {
    loadTrendingEvents(true);
    loadNetworkEvents(true);
  }, [filters.genres, filters.selectedCities, filters.dateRange]);

  // Load all feed sections when user/city/date changes
  useEffect(() => {
    loadAllFeedSections();
  }, [currentUserId, activeCity, dateWindow, cityCoordinates]);

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
      
      // Combine and apply filters
      const allEvents = [...firstDegree, ...secondDegree];
      const filteredEvents = applyFiltersToEvents(allEvents);
      
      // Split back into first and second degree
      const firstDegreeFiltered = filteredEvents.filter(e => firstDegree.some(fd => fd.event_id === e.event_id));
      const secondDegreeFiltered = filteredEvents.filter(e => secondDegree.some(sd => sd.event_id === e.event_id));
      
      if (reset) {
        setFirstDegreeEvents(firstDegreeFiltered.slice(0, 10));
        setSecondDegreeEvents(secondDegreeFiltered.slice(0, 8));
      } else {
        setFirstDegreeEvents(prev => [...prev, ...firstDegreeFiltered.slice(friendsPage * 10, (friendsPage + 1) * 10)]);
        setSecondDegreeEvents(prev => [...prev, ...secondDegreeFiltered.slice(friendsPage * 8, (friendsPage + 1) * 8)]);
      }
      
      setFriendsHasMore(filteredEvents.length > (friendsPage + 1) * pageSize);
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
      const feedItems = await UnifiedFeedService.getFeedItems({
        userId: currentUserId,
        feedType: 'friends_plus_one',
        limit: 20,
        offset: 0,
      });
      // Filter to only reviews
      const reviewItems = feedItems.filter((item) => item.type === 'review');
      setReviews(reviewItems);
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
    return events.filter(event => {
      // Date filter
      if (filters.dateRange.from || filters.dateRange.to) {
        if (!event.event_date) return false;
        const eventDate = new Date(event.event_date);
        if (filters.dateRange.from && eventDate < filters.dateRange.from) return false;
        if (filters.dateRange.to) {
          const toDate = new Date(filters.dateRange.to);
          toDate.setHours(23, 59, 59, 999);
          if (eventDate > toDate) return false;
        }
      }

      // City filter
      if (filters.selectedCities && filters.selectedCities.length > 0) {
        const eventCity = event.venue_city?.toLowerCase().trim();
        const matches = filters.selectedCities.some(city => 
          eventCity?.includes(city.toLowerCase().trim())
        );
        if (!matches) return false;
      }

      // Genre filter (skip if genres not available on event)
      if (filters.genres && filters.genres.length > 0) {
        const eventGenres = (event.genres || []).map((g: string) => g.toLowerCase());
        if (eventGenres.length === 0) return false; // No genres on event, skip if genre filter active
        const matches = filters.genres.some(genre => 
          eventGenres.some((eg: string) => eg.includes(genre.toLowerCase()) || genre.toLowerCase().includes(eg))
        );
        if (!matches) return false;
      }

      return true;
    });
  };

  const loadTrendingEvents = async (reset: boolean = false) => {
    if (reset) {
      setTrendingPage(0);
      setLoadingTrending(true);
    }
    try {
      const pageSize = 12;
      const events = await HomeFeedService.getTrendingEvents(
        currentUserId,
        cityCoordinates?.lat,
        cityCoordinates?.lng,
        50,
        (trendingPage + 1) * pageSize
      );
      
      // Apply filters
      const filteredEvents = applyFiltersToEvents(events);
      
      if (reset) {
        setTrendingEvents(filteredEvents.slice(0, pageSize));
      } else {
        setTrendingEvents(prev => [...prev, ...filteredEvents.slice(trendingPage * pageSize, (trendingPage + 1) * pageSize)]);
      }
      
      setTrendingHasMore(filteredEvents.length > (trendingPage + 1) * pageSize);
    } catch (error) {
      console.error('Error loading trending events:', error);
      if (reset) setTrendingEvents([]);
    } finally {
      setLoadingTrending(false);
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

      // Transform the RPC response to match the expected format
      const chatsWithFriends = (recommendedChats || []).map((chat: any) => ({
        id: chat.chat_id,
        chat_name: chat.chat_name || chat.entity_name || 'Unnamed Group',
        member_count: chat.member_count || 0,
        friends_in_chat_count: 0, // Not calculated in RPC, but kept for compatibility
        entity_type: chat.entity_type,
        entity_name: chat.entity_name,
        entity_image_url: chat.entity_image_url,
        relevance_score: chat.relevance_score,
        distance_miles: chat.distance_miles,
      }));

      console.log('✅ Loaded recommended chats:', chatsWithFriends.length, chatsWithFriends);
      setRecommendedGroupChats(chatsWithFriends);
    } catch (error) {
      console.error('❌ Error loading recommended group chats:', error);
      setRecommendedGroupChats([]);
    } finally {
      setLoadingRecommendedGroupChats(false);
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
          id,
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
            id: rel.id,
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

  return (
    <div className="min-h-screen bg-[#fcfcfc] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-6 space-y-2">
        {/* Recommended Friends Accordion - Open by default */}
        <Accordion type="single" collapsible defaultValue="recommended-friends" className="w-full mb-2">
          <AccordionItem value="recommended-friends" className="border border-gray-200 rounded-xl px-3 py-2 bg-white">
            <AccordionTrigger className="hover:no-underline py-2">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-synth-pink" />
                <h2 className="text-base font-bold">Recommended Friends</h2>
                {recommendedFriends.length > 0 && (
                  <span className="text-xs text-muted-foreground">({recommendedFriends.length})</span>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-2">
              {loadingRecommendedFriends ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : recommendedFriends.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No recommended friends at this time.</p>
                </div>
              ) : (
                <div className="overflow-x-auto pb-2 scrollbar-hide">
                  <div className="flex gap-3" style={{ width: 'max-content' }}>
                    {recommendedFriends.map((friend) => {
                      const isSending = sendingFriendRequests.has(friend.connected_user_id);
                      const isSent = sentFriendRequests.has(friend.connected_user_id);
                      
                      return (
                        <div
                          key={friend.connected_user_id}
                          className="flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden cursor-pointer group relative bg-gray-100 hover:shadow-lg transition-all duration-200"
                          onClick={() => onNavigateToProfile?.(friend.connected_user_id)}
                        >
                          {/* Avatar fills entire card */}
                          <Avatar className="w-full h-full rounded-lg">
                            <AvatarImage src={friend.avatar_url || undefined} className="object-cover" />
                            <AvatarFallback className="bg-gradient-to-br from-synth-pink/20 to-synth-pink/40 text-synth-pink text-base font-semibold rounded-lg">
                              {friend.name ? friend.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U'}
                            </AvatarFallback>
                        </Avatar>
                          
                          {/* Overlay with info on hover */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                            <div className="absolute bottom-0 left-0 right-0 p-1.5 text-white">
                              <p className="text-[10px] font-semibold line-clamp-1 mb-0.5">{friend.name}</p>
                              {friend.mutual_friends_count && friend.mutual_friends_count > 0 && (
                                <p className="text-[9px] opacity-90">{friend.mutual_friends_count} mutual</p>
                              )}
                            </div>
                          </div>

                          {/* Bottom info bar (always visible) */}
                          <div className="absolute bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm p-1">
                            <p className="text-[10px] font-medium text-white line-clamp-1 truncate">
                              {friend.name}
                            </p>
                          </div>

                          {/* Add Friend Button - positioned absolutely */}
                          <div
                            className="absolute top-1 right-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddFriend(friend.connected_user_id, e);
                            }}
                          >
                        <Button
                          size="sm"
                              variant={isSent ? "outline" : "default"}
                              className={`h-5 w-5 p-0 ${
                                isSent 
                                  ? "bg-white/90 text-gray-600 border-gray-300" 
                                  : "bg-synth-pink hover:bg-synth-pink/90 text-white border-0"
                              }`}
                          onClick={(e) => {
                            e.stopPropagation();
                                handleAddFriend(friend.connected_user_id, e);
                              }}
                              disabled={isSending || isSent}
                            >
                              {isSending ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : isSent ? (
                                <UserCheck className="w-3 h-3" />
                              ) : (
                                <UserPlus className="w-3 h-3" />
                              )}
                        </Button>
                      </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Recommended Chats Accordion */}
        <Accordion type="single" collapsible className="w-full mb-2">
          <AccordionItem value="recommended-chats" className="border border-gray-200 rounded-xl px-3 py-2 bg-white">
            <AccordionTrigger className="hover:no-underline py-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-synth-pink" />
                <h2 className="text-base font-bold">Recommended Chats</h2>
                {recommendedGroupChats.length > 0 && (
                  <span className="text-xs text-muted-foreground">({recommendedGroupChats.length})</span>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-2">
              {loadingRecommendedGroupChats ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : recommendedGroupChats.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No recommended chats at this time.</p>
                </div>
              ) : (
                <div className="overflow-x-auto pb-2 scrollbar-hide">
                  <div className="flex gap-3" style={{ width: 'max-content' }}>
                    {recommendedGroupChats.map((chat) => {
                      const imageUrl = chat.entity_image_url || '';
                      const hasImage = imageUrl && imageUrl.trim() !== '';
                      
                      return (
                        <div
                          key={chat.id}
                          className="flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden cursor-pointer group relative bg-gradient-to-br from-synth-pink/20 to-synth-pink/40 hover:shadow-lg transition-all duration-200"
                          onClick={() => onNavigateToChat?.(chat.id)}
                        >
                          {/* Entity image or placeholder */}
                          {hasImage ? (
                            <img
                              src={imageUrl}
                              alt={chat.entity_name || chat.chat_name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                // Fallback to placeholder if image fails to load
                                const target = e.target as HTMLImageElement;
                                target.src = getFallbackEventImage(chat.id);
                                target.onerror = null; // Prevent infinite loop
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center p-2 bg-gradient-to-br from-synth-pink/20 to-synth-pink/40">
                              <MessageSquare className="w-8 h-8 text-synth-pink mb-1" />
                              <p className="text-[10px] font-semibold text-synth-pink text-center line-clamp-2">
                                {chat.chat_name}
                              </p>
                            </div>
                          )}
                          
                          {/* Overlay with info on hover */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                            <div className="absolute bottom-0 left-0 right-0 p-1.5 text-white">
                              <p className="text-[10px] font-semibold line-clamp-1 mb-0.5">{chat.chat_name}</p>
                              <p className="text-[9px] opacity-90">
                                {chat.member_count} member{chat.member_count !== 1 ? 's' : ''}
                                {chat.friends_in_chat_count && chat.friends_in_chat_count > 0 && (
                                  <> • {chat.friends_in_chat_count} friend{chat.friends_in_chat_count !== 1 ? 's' : ''}</>
                                )}
                              </p>
                            </div>
                          </div>

                          {/* Bottom info bar (always visible) */}
                          <div className="absolute bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm p-1">
                            <p className="text-[10px] font-medium text-white line-clamp-1 truncate">
                              {chat.chat_name}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Collapsible Event Sections */}
        <Accordion type="multiple" className="w-full space-y-2">
          {/* 1. Your Events */}
          <AccordionItem value="recommended" className="border border-gray-200 rounded-xl px-3 py-2 bg-white">
            <AccordionTrigger className="hover:no-underline py-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-synth-pink" />
                <h2 className="text-base font-bold">Your Events</h2>
                            </div>
            </AccordionTrigger>
            <AccordionContent className="pt-2">
              <PreferencesV4FeedSection
                userId={currentUserId}
                onEventClick={handleEventClick}
                filters={filters}
                filterControls={
                  <EventFilters
                    filters={filters}
                    onFiltersChange={(newFilters) => {
                      setFilters(newFilters);
                    }}
                    availableGenres={availableGenres}
                    availableCities={availableCities}
                    className="flex-1"
                  />
                }
              />
            </AccordionContent>
          </AccordionItem>

          {/* 2. Trending */}
          <AccordionItem value="trending" className="border border-gray-200 rounded-xl px-3 py-2 bg-white">
            <AccordionTrigger className="hover:no-underline py-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-synth-pink" />
                <h2 className="text-base font-bold">Trending</h2>
                {trendingEvents.length > 0 && (
                  <span className="text-xs text-muted-foreground">({trendingEvents.length})</span>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-2">
              {loadingTrending && trendingEvents.length === 0 ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {trendingEvents.length > 0 ? (
                    <div className="overflow-x-auto pb-2 scrollbar-hide">
                      <div className="flex gap-3" style={{ width: 'max-content' }}>
                        {trendingEvents.map((event) => {
                          // Resolve image URL with priority:
                          // 1. poster_image_url (if available)
                          // 2. images JSONB (first image URL, prefer 16:9 or large images)
                          let imageUrl: string | undefined = undefined;
                          
                          if (event.images && Array.isArray(event.images) && event.images.length > 0) {
                            // Prefer 16:9 ratio or large images
                            const bestImage = event.images.find((img: any) => 
                              img?.url && (img?.ratio === '16_9' || (img?.width && img.width > 1000))
                            ) || event.images.find((img: any) => img?.url);
                            imageUrl = bestImage?.url;
                          }
                          
                          return (
                          <CompactEventCard
                            key={event.event_id}
                            event={{
                              id: event.event_id,
                              title: event.title,
                              artist_name: (event as any).artist_name_normalized,
                              venue_name: (event as any).venue_name_normalized,
                              event_date: event.event_date,
                              venue_city: event.venue_city,
                                image_url: imageUrl,
                                poster_image_url: imageUrl,
                            }}
                            onClick={() => handleEventClick(event.event_id)}
                          />
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground text-sm">
                      <p>No trending events right now.</p>
                    </div>
                  )}

                  {/* Filters on their own row - always visible */}
                  <div className={`pt-4 ${trendingEvents.length > 0 ? 'border-t' : ''}`}>
                    <EventFilters
                      filters={filters}
                      onFiltersChange={(newFilters) => {
                        setFilters(newFilters);
                      }}
                      availableGenres={availableGenres}
                      availableCities={availableCities}
                      className="w-full"
                    />
                  </div>

                  {/* Load More Button - on its own row, centered */}
                  {trendingHasMore && (
                    <div className="flex justify-center pt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadMoreTrending}
                        disabled={loadingTrending}
                        className="flex items-center gap-2"
                      >
                        {loadingTrending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            Load More
                            <ChevronRight className="w-4 h-4" />
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* 3. Friends Interested */}
          <AccordionItem value="friends" className="border border-gray-200 rounded-xl px-3 py-2 bg-white">
            <AccordionTrigger className="hover:no-underline py-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-synth-pink" />
                <h2 className="text-base font-bold">Friends Interested</h2>
                {(() => {
                  const totalInterested = [...firstDegreeEvents, ...secondDegreeEvents].reduce((sum, event) => {
                    return sum + (event.interested_count || 1);
                  }, 0);
                  return totalInterested > 0 ? (
                    <span className="text-xs text-muted-foreground">({totalInterested})</span>
                  ) : null;
                })()}
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-2">
              {loadingNetwork && firstDegreeEvents.length === 0 && secondDegreeEvents.length === 0 ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {firstDegreeEvents.length === 0 && secondDegreeEvents.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-sm">
                      <p>No friends interested in events yet.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto pb-2 scrollbar-hide">
                      <div className="flex gap-3" style={{ width: 'max-content' }}>
                        {[...firstDegreeEvents, ...secondDegreeEvents].map((event) => {
                          // Resolve image URL with priority:
                          // 1. poster_image_url (if available)
                          // 2. images JSONB (first image URL, prefer 16:9 or large images)
                          let imageUrl: string | undefined = undefined;
                          
                          if (event.images && Array.isArray(event.images) && event.images.length > 0) {
                            // Prefer 16:9 ratio or large images
                            const bestImage = event.images.find((img: any) => 
                              img?.url && (img?.ratio === '16_9' || (img?.width && img.width > 1000))
                            ) || event.images.find((img: any) => img?.url);
                            imageUrl = bestImage?.url;
                          }
                          
                          return (
                          <CompactEventCard
                            key={`${event.event_id}-${event.friend_id}`}
                            event={{
                              id: event.event_id,
                              title: event.title,
                              artist_name: (event as any).artist_name_normalized,
                              venue_name: (event as any).venue_name_normalized,
                              event_date: event.event_date,
                              venue_city: event.venue_city,
                                image_url: imageUrl,
                                poster_image_url: imageUrl,
                            }}
                            onClick={() => handleEventClick(event.event_id)}
                          />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Filters on their own row - always visible */}
                  <div className={`pt-4 ${(firstDegreeEvents.length > 0 || secondDegreeEvents.length > 0) ? 'border-t' : ''}`}>
                    <EventFilters
                      filters={filters}
                      onFiltersChange={(newFilters) => {
                        setFilters(newFilters);
                      }}
                      availableGenres={availableGenres}
                      availableCities={availableCities}
                      className="w-full"
                    />
                  </div>

                  {/* Load More Button - on its own row, centered */}
                  {friendsHasMore && (
                    <div className="flex justify-center pt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadMoreFriends}
                        disabled={loadingNetwork}
                        className="flex items-center gap-2"
                      >
                        {loadingNetwork ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            Load More
                            <ChevronRight className="w-4 h-4" />
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* 3. Reviews Feed */}
        <section className="mt-2">
          <h2 className="text-lg font-bold mb-2">Reviews Feed</h2>
          {loadingReviews ? (
            <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
          ) : reviews.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No reviews yet. Be the first to review an event!</p>
                  </div>
                ) : (
            <div className="space-y-2">
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
                    setSelectedReview(review);
                    setReviewDetailOpen(true);
                  }}
                />
              ))}
            </div>
              )}
        </section>

        {/* 4. Lists & Collections */}
        <section>
          {loadingLists ? (
            <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
          ) : (
            <EventListsCarousel lists={eventLists} onEventClick={handleEventClick} />
          )}
        </section>
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
    </div>
  );
};
