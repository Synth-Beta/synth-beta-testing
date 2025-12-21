import React, { useState, useEffect } from 'react';
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
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { Loader2, Users, Sparkles, TrendingUp, Search, UserPlus, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

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

  // Feed sections state
  const [recommendedEvents, setRecommendedEvents] = useState<PersonalizedEvent[]>([]);
  const [firstDegreeEvents, setFirstDegreeEvents] = useState<NetworkEvent[]>([]);
  const [secondDegreeEvents, setSecondDegreeEvents] = useState<NetworkEvent[]>([]);
  const [reviews, setReviews] = useState<UnifiedFeedItem[]>([]);
  const [eventLists, setEventLists] = useState<EventList[]>([]);
  const [trendingEvents, setTrendingEvents] = useState<TrendingEvent[]>([]);
  const [recommendedFriends, setRecommendedFriends] = useState<Array<{
    connected_user_id: string;
  name: string;
    avatar_url?: string;
    mutual_friends_count?: number;
    connection_degree: 2 | 3;
  }>>([]);
  const [sendingFriendRequests, setSendingFriendRequests] = useState<Set<string>>(new Set());
  const [sentFriendRequests, setSentFriendRequests] = useState<Set<string>>(new Set());

  // Loading states
  const [loadingRecommended, setLoadingRecommended] = useState(true);
  const [loadingNetwork, setLoadingNetwork] = useState(true);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [loadingRecommendedFriends, setLoadingRecommendedFriends] = useState(false);

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

  // Load user's active city
  useEffect(() => {
    loadUserCity();
  }, [currentUserId]);

  // Load all feed sections when filters change
  useEffect(() => {
    if (activeCity !== undefined) {
      loadAllFeedSections();
    }
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
        }
      } catch (error) {
      console.error('Error loading user city:', error);
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
    const dateRange = getDateRange();
    const filters = {
      selectedCities: activeCity ? [activeCity] : undefined,
      dateRange,
    };

    // Load all sections in parallel
    Promise.all([
      loadRecommendedEvents(filters),
      loadNetworkEvents(),
      loadReviews(),
      loadEventLists(),
      loadTrendingEvents(),
      loadRecommendedFriends(),
    ]);
  };

  const loadRecommendedEvents = async (filters: any) => {
    setLoadingRecommended(true);
    try {
      const events = await PersonalizedFeedService.getPersonalizedFeed(
        currentUserId,
        20,
        0,
        false,
        filters
      );
      setRecommendedEvents(events);
    } catch (error) {
      console.error('Error loading recommended events:', error);
      setRecommendedEvents([]);
    } finally {
      setLoadingRecommended(false);
    }
  };

  const loadNetworkEvents = async () => {
    setLoadingNetwork(true);
    try {
      const [firstDegree, secondDegree] = await Promise.all([
        HomeFeedService.getFirstDegreeNetworkEvents(currentUserId, 10),
        HomeFeedService.getSecondDegreeNetworkEvents(currentUserId, 8),
      ]);
      setFirstDegreeEvents(firstDegree);
      setSecondDegreeEvents(secondDegree);
    } catch (error) {
      console.error('Error loading network events:', error);
      setFirstDegreeEvents([]);
      setSecondDegreeEvents([]);
    } finally {
      setLoadingNetwork(false);
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

  const loadTrendingEvents = async () => {
    setLoadingTrending(true);
    try {
      const events = await HomeFeedService.getTrendingEvents(
        currentUserId,
        cityCoordinates?.lat,
        cityCoordinates?.lng,
        50,
        12
      );
      setTrendingEvents(events);
    } catch (error) {
      console.error('Error loading trending events:', error);
      setTrendingEvents([]);
    } finally {
      setLoadingTrending(false);
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
          artist_id: eventData.artist_id || eventData.artist_uuid || '',
          venue_name: eventData.venue_name || 'Unknown Venue',
          venue_id: eventData.venue_id || eventData.venue_uuid || '',
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
              title: event.title || event.artist_name || 'Event',
              author: {
                id: currentUserId,
                name: 'System',
              },
              event_data: {
                id: event.id,
                jambase_event_id: event.jambase_event_id,
                title: event.title || event.artist_name || 'Event',
                artist_name: event.artist_name || 'Unknown Artist',
                artist_id: event.artist_id || event.id || '',
                venue_name: event.venue_name || 'Unknown Venue',
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
          .from('events')
          .select('id, title, artist_name, venue_name, event_date')
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
            artist_name: event.artist_name ?? undefined,
            venue_name: event.venue_name ?? undefined,
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
        {/* Search Bar - Integrated Design with Pink Accent */}
        <div className="mb-2">
          <button
            onClick={() => onViewChange?.('search')}
            className="w-full flex items-center gap-2 px-3 py-2 bg-synth-pink/5 border border-synth-pink/30 rounded-lg hover:border-synth-pink/60 hover:bg-synth-pink/10 transition-all text-left"
          >
            <Search className="h-4 w-4 text-synth-pink" />
            <span className="text-gray-600 text-xs">Search events, artists, venues</span>
          </button>
        </div>

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

        {/* Collapsible Event Sections */}
        <Accordion type="multiple" className="w-full space-y-2">
          {/* 1. Recommended for You */}
          <AccordionItem value="recommended" className="border border-gray-200 rounded-xl px-3 py-2 bg-white">
            <AccordionTrigger className="hover:no-underline py-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-synth-pink" />
                <h2 className="text-base font-bold">Recommended</h2>
                {recommendedEvents.length > 0 && (
                  <span className="text-xs text-muted-foreground">({recommendedEvents.length})</span>
                )}
                            </div>
            </AccordionTrigger>
            <AccordionContent className="pt-2">
              {loadingRecommended ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                          </div>
              ) : recommendedEvents.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <p>No recommendations yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto pb-2 scrollbar-hide">
                  <div className="flex gap-3" style={{ width: 'max-content' }}>
                    {recommendedEvents.map((event) => (
                      <CompactEventCard
                        key={event.id}
                        event={{
                          id: event.id || '',
                          title: event.title || event.artist_name || 'Event',
                          artist_name: event.artist_name,
                          venue_name: event.venue_name,
                          event_date: event.event_date,
                          venue_city: event.venue_city || undefined,
                          image_url: event.images?.[0]?.url || undefined,
                          poster_image_url: event.poster_image_url || undefined,
                        }}
                        onClick={() => handleEventClick(event.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
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
              {loadingTrending ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : trendingEvents.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <p>No trending events right now.</p>
                </div>
              ) : (
                <div className="overflow-x-auto pb-2 scrollbar-hide">
                  <div className="flex gap-3" style={{ width: 'max-content' }}>
                    {trendingEvents.map((event) => (
                      <CompactEventCard
                        key={event.event_id}
                        event={{
                          id: event.event_id,
                          title: event.title,
                          artist_name: event.artist_name,
                          venue_name: event.venue_name,
                          event_date: event.event_date,
                          venue_city: event.venue_city,
                          image_url: event.images?.[0]?.url || undefined,
                          poster_image_url: event.images?.[0]?.url || undefined,
                        }}
                        onClick={() => handleEventClick(event.event_id)}
                      />
                    ))}
                  </div>
                </div>
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
              {loadingNetwork ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : firstDegreeEvents.length === 0 && secondDegreeEvents.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <p>No friends interested in events yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto pb-2 scrollbar-hide">
                  <div className="flex gap-3" style={{ width: 'max-content' }}>
                    {[...firstDegreeEvents, ...secondDegreeEvents].map((event) => (
                      <CompactEventCard
                        key={`${event.event_id}-${event.friend_id}`}
                        event={{
                          id: event.event_id,
                          title: event.title,
                          artist_name: event.artist_name,
                          venue_name: event.venue_name,
                          event_date: event.event_date,
                          venue_city: event.venue_city,
                          image_url: event.images?.[0]?.url || undefined,
                          poster_image_url: event.images?.[0]?.url || undefined,
                        }}
                        onClick={() => handleEventClick(event.event_id)}
                      />
                    ))}
                  </div>
                </div>
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
