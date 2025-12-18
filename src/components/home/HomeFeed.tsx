import React, { useState, useEffect, useRef } from 'react';
import { UnifiedFeedService, UnifiedFeedItem } from '@/services/unifiedFeedService';
import { PersonalizedFeedService, FeedItem, UnifiedFeedResponse } from '@/services/personalizedFeedService';
import { FriendsService } from '@/services/friendsService';
import { UserVisibilityService } from '@/services/userVisibilityService';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageActions } from '@/components/PageActions';
import { UserPlus, Users, MessageCircle, Calendar, Music, Loader2, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { UserEventService } from '@/services/userEventService';
import { SimpleEventRecommendationService } from '@/services/simpleEventRecommendationService';
import { FigmaEventCard } from '@/components/cards/FigmaEventCard';
import { FigmaReviewCard } from '@/components/cards/FigmaReviewCard';
import { GroupChatCard } from '@/components/cards/GroupChatCard';
import { FriendSuggestionsRail, FriendSuggestion } from '@/components/feed/FriendSuggestionsRail';
import { GroupChatsRail, GroupChatSuggestion } from '@/components/feed/GroupChatsRail';

interface HomeFeedProps {
  currentUserId: string;
  onNavigateToNotifications?: () => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
  onViewChange?: (view: 'feed' | 'search' | 'profile') => void;
}

interface SuggestedUser {
  user_id: string;
  name: string;
  username?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  mutual_friends?: number;
  common_artists?: string[];
}

interface FriendEventInterest {
  id: string;
  friend_id: string;
  friend_name: string;
  friend_avatar?: string | null;
  event_id: string;
  event_title: string;
  artist_name?: string;
  venue_name?: string;
  event_date?: string;
  created_at: string;
}

export const HomeFeed: React.FC<HomeFeedProps> = ({
  currentUserId,
  onNavigateToNotifications,
  onNavigateToProfile,
  onNavigateToChat,
  onViewChange,
}) => {
  const [feedItems, setFeedItems] = useState<(UnifiedFeedItem | { type: 'friend_suggestion', payload: any })[]>([]);
  const [dismissedFriendRail, setDismissedFriendRail] = useState(false);
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const [friendEventInterests, setFriendEventInterests] = useState<FriendEventInterest[]>([]);
  const [hasFriends, setHasFriends] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [selectedEventInterested, setSelectedEventInterested] = useState<boolean>(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Check if user has friends
  useEffect(() => {
    const checkFriends = async () => {
      try {
        const friendIds = await UserVisibilityService.getFriendIds(currentUserId);
        setHasFriends(friendIds.length > 0);
        
        // If no friends, load suggested users
        if (friendIds.length === 0) {
          await loadSuggestedUsers();
        }
      } catch (error) {
        console.error('Error checking friends:', error);
        setHasFriends(false);
      }
    };
    
    checkFriends();
  }, [currentUserId]);

  // Load initial feed
  useEffect(() => {
    if (hasFriends !== null) {
      loadFeed();
      loadFriendEventInterests();
    }
  }, [currentUserId, hasFriends]);

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore) {
          loadMoreFeed();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [loadingMore, hasFriends]);

  const loadSuggestedUsers = async () => {
    try {
      // Get users with similar music taste or mutual connections
      const { data: userProfile } = await supabase
        .from('users')
        .select('user_id, name, avatar_url, bio, username')
        .eq('user_id', currentUserId)
        .single();

      // Get users who are not already friends
      const friendIds = await UserVisibilityService.getFriendIds(currentUserId);
      const excludeIds = [currentUserId, ...friendIds];

      // Get suggested users (users with public profiles and profile pictures)
      let query = supabase
        .from('users')
        .select('user_id, name, username, avatar_url, bio')
        .not('avatar_url', 'is', null)
        .eq('is_public', true)
        .limit(20);

      // Filter out current user and friends using multiple .neq() calls
      excludeIds.forEach(id => {
        query = query.neq('user_id', id);
      });

      const { data: suggested, error } = await query;

      if (error) throw error;

      // Calculate mutual friends for each suggested user
      const suggestedWithMutuals = await Promise.all(
        (suggested || []).map(async (user) => {
          const mutualCount = await getMutualFriendsCount(currentUserId, user.user_id);
          return {
            ...user,
            mutual_friends: mutualCount,
          };
        })
      );

      setSuggestedUsers(suggestedWithMutuals.sort((a, b) => (b.mutual_friends || 0) - (a.mutual_friends || 0)));
    } catch (error) {
      console.error('Error loading suggested users:', error);
    }
  };

  const getMutualFriendsCount = async (userId1: string, userId2: string): Promise<number> => {
    try {
      const friends1 = await UserVisibilityService.getFriendIds(userId1);
      const friends2 = await UserVisibilityService.getFriendIds(userId2);
      const mutual = friends1.filter(id => friends2.includes(id));
      return mutual.length;
    } catch {
      return 0;
    }
  };

  const loadFeed = async () => {
    setLoading(true);
    try {
      // Use v3 unified feed
      const feedResponse = await PersonalizedFeedService.getPersonalizedFeedV3(
        currentUserId,
        20,
        0
      );

      // Transform v3 feed items - keep all types, separate rails from scrollable items
      const transformedItems = feedResponse.items.map(item => transformV3FeedItem(item));
      
      // Note: Recommendations are already included in v3 feed as events, 
      // so we don't need to insert additional recommendations - all items are already in one continuous feed
      // Filter out duplicates by ID to prevent React key warnings
      setFeedItems(transformedItems);
      setOffset(20);
    } catch (error) {
      console.error('Error loading feed:', error);
      // Fallback to old feed if v3 fails
      try {
        const items = await UnifiedFeedService.getFeedItems({
          userId: currentUserId,
          feedType: hasFriends ? 'friends' : 'public_only',
          limit: 20,
          offset: 0,
        });
        setFeedItems(items);
      } catch (fallbackError) {
        console.error('Error loading fallback feed:', fallbackError);
        setFeedItems([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadMoreFeed = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      // Use v3 unified feed
      const feedResponse = await PersonalizedFeedService.getPersonalizedFeedV3(
        currentUserId,
        20,
        offset
      );

      if (feedResponse.items.length > 0) {
        // Transform v3 feed items - keep all types
        const transformedItems = feedResponse.items.map(item => transformV3FeedItem(item));
        
        // Filter out duplicates by ID before appending
        setFeedItems(prev => {
          const existingIds = new Set(
            prev.map(item => 'id' in item ? item.id : (item as any).payload?.users ? 'friend_suggestion_rail' : 'unknown')
          );
          const newItems = transformedItems.filter(item => {
            if ('id' in item) {
              return !existingIds.has(item.id);
            } else if ((item as any).type === 'friend_suggestion') {
              return !existingIds.has('friend_suggestion_rail');
            }
            return true;
          });
          return [...prev, ...newItems];
        });
        setOffset(prev => prev + 20);
      }
    } catch (error) {
      console.error('Error loading more feed:', error);
    } finally {
      setLoadingMore(false);
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
        .from('relationships')
        .select(`
          id,
          user_id,
          related_entity_id,
          created_at
        `)
        .eq('related_entity_type', 'event')
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
      const eventIds = relationships.map(r => r.related_entity_id).filter(Boolean) as string[];
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
          const event = eventsMap.get(rel.related_entity_id);
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

  const handleEventClick = async (event: any) => {
    try {
      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('id', event.id || event.event_id)
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

  const renderFeedItem = (item: UnifiedFeedItem, index: number) => {
    if (item.type === 'group_chat' && item.group_chat_data) {
      return (
        <GroupChatCard
          key={`group-chat-${item.id}-${index}`}
          chat={{
            chat_id: item.group_chat_data?.chat_id || '',
            chat_name: item.group_chat_data?.chat_name || 'Group Chat',
            member_count: item.group_chat_data?.member_count,
            friends_in_chat_count: item.group_chat_data?.friends_in_chat_count,
            created_at: item.group_chat_data?.created_at || item.created_at,
          }}
          onChatClick={(chatId) => {
            // TODO: Navigate to chat
            console.log('Open chat:', chatId);
          }}
          onJoinChat={async (chatId) => {
            // TODO: Implement join chat
            console.log('Join chat:', chatId);
          }}
        />
      );
    }

    if (item.type === 'review') {
      return (
        <div key={`review-${item.id}-${index}`} className="mb-4" style={{ minHeight: '300px' }}>
          <FigmaReviewCard
            review={{
              id: item.id,
              user_id: item.author.id || '',
              user_name: item.author.name || 'User',
              user_avatar: item.author.avatar_url,
              created_at: item.created_at || new Date().toISOString(),
              artist_name: item.event_info?.artist_name,
              venue_name: item.event_info?.venue_name,
              rating: item.rating || 0,
              review_text: item.content || '',
              likes_count: item.likes_count || 0,
              comments_count: item.comments_count || 0,
            }}
            isLiked={item.is_liked || false}
            onLike={() => {
              // TODO: Implement like functionality
            }}
            onComment={() => {
              // TODO: Implement comment functionality
            }}
            onShare={() => {
              // TODO: Implement share functionality
            }}
            onOpenArtist={(artistName) => {
              // TODO: Navigate to artist profile
            }}
            onOpenVenue={(venueName) => {
              // TODO: Navigate to venue profile
            }}
            onClick={() => {
              // TODO: Open review detail
            }}
          />
        </div>
      );
    }

    if (item.type === 'event') {
      const event = item.event_data;
      const isInterested = (event as any)?.is_interested || false;
      const commentsCount = (event as any)?.comments_count || 0;
      const hasFriendsGoing = event?.has_friends_going || false;
      const friendInterestCount = event?.friend_interest_count || 0;
      
      return (
        <div key={`event-${item.id}-${index}`} className="mb-4" style={{ minHeight: '224px' }}>
          {hasFriendsGoing && friendInterestCount >= 2 && (
            <div className="mb-2 px-4 py-2 bg-synth-pink/10 border border-synth-pink/20 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-synth-pink font-medium">
                <Users className="h-4 w-4" />
                <span>{friendInterestCount} friend{friendInterestCount !== 1 ? 's' : ''} {friendInterestCount > 1 ? 'are' : 'is'} going</span>
              </div>
            </div>
          )}
          <FigmaEventCard
            event={{
              id: event?.id || item.id,
              title: event?.title || event?.artist_name || 'Event',
              artist_name: event?.artist_name,
              venue_name: event?.venue_name,
              venue_city: event?.venue_city,
              event_date: event?.event_date,
              price_range: event?.price_range,
            }}
            isInterested={isInterested}
            commentsCount={commentsCount}
            onInterestToggle={async () => {
              if (event?.id) {
                try {
                  const interested = await UserEventService.isUserInterested(currentUserId, event.id);
                  await UserEventService.setEventInterest(currentUserId, event.id, !interested);
                  // Refresh feed or update state
                } catch (error) {
                  console.error('Error toggling interest:', error);
                }
              }
            }}
            onComment={() => {
              // TODO: Open comments
            }}
            onShare={() => {
              // TODO: Open share modal
            }}
            onClick={() => handleEventClick(event)}
          />
        </div>
      );
    }

    return null;
  };

  // Separate rails from scrollable feed items (must be before return statement)
  const { friendRail, groupChatRail, scrollableItems } = React.useMemo(() => {
    let friendRailItem: { type: 'friend_suggestion', payload: any } | null = null;
    let groupChatRailItem: UnifiedFeedItem | null = null;
    const scrollable: UnifiedFeedItem[] = [];
    const seenIds = new Set<string>();
    let groupChatCount = 0;

    for (const item of feedItems) {
      // Generate a unique identifier for this item to prevent duplicates
      const itemId = 'id' in item && item.id ? item.id : `${(item as any).type}-${JSON.stringify((item as any).payload)}`;
      
      // Skip duplicates
      if (seenIds.has(itemId)) {
        continue;
      }
      seenIds.add(itemId);

      if ('type' in item && (item as any).type === 'friend_suggestion') {
        friendRailItem = item as any;
      } else if ('type' in item && (item as UnifiedFeedItem).type === 'group_chat') {
        groupChatCount++;
        // First group_chat is the rail
        if (groupChatCount === 1 && !groupChatRailItem) {
          groupChatRailItem = item as UnifiedFeedItem;
        } else {
          scrollable.push(item as UnifiedFeedItem);
        }
      } else {
        scrollable.push(item as UnifiedFeedItem);
      }
    }

    return {
      friendRail: friendRailItem,
      groupChatRail: groupChatRailItem,
      scrollableItems: scrollable,
    };
  }, [feedItems]);

  return (
    <div className="min-h-screen bg-[#fcfcfc]">
      <div className="w-full max-w-full sm:max-w-2xl lg:max-w-5xl mx-auto px-0 sm:px-4 pt-8 sm:pt-10 pb-24 sm:pb-28">
        <Card className="border-none bg-gradient-to-br from-rose-50 via-white to-amber-50 shadow-sm w-full rounded-none sm:rounded-lg">
          <CardContent className="p-0">
            <div className="bg-white/85 rounded-none sm:rounded-3xl border-0 sm:border border-white/60 shadow-inner p-2 sm:p-4 md:p-6">
              {/* Buffer space after header */}
              <div className="h-12 sm:h-16"></div>

              {/* Suggested Users (shown when no friends) */}
              {!hasFriends && suggestedUsers.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-lg font-semibold mb-3">Suggested Users</h2>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {suggestedUsers.map((user) => (
                      <div
                        key={user.user_id}
                        className="flex-shrink-0 w-24 text-center cursor-pointer"
                        onClick={() => onNavigateToProfile?.(user.user_id)}
                      >
                        <Avatar className="w-20 h-20 mx-auto mb-2">
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback>{user.name[0]}</AvatarFallback>
                        </Avatar>
                        <p className="text-xs font-medium truncate">{user.name}</p>
                        {user.mutual_friends && user.mutual_friends > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {user.mutual_friends} mutual
                          </p>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            // TODO: Implement follow functionality
                          }}
                        >
                          <UserPlus className="w-3 h-3 mr-1" />
                          Follow
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Friend Event Interests */}
              {hasFriends && friendEventInterests.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-lg font-semibold mb-3">Friends' Events</h2>
                  <div className="space-y-2">
                    {friendEventInterests.slice(0, 5).map((interest) => (
                      <Card
                        key={interest.id}
                        className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => handleEventClick({ id: interest.event_id })}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="w-10 h-10">
                              <AvatarImage src={interest.friend_avatar || undefined} />
                              <AvatarFallback>{interest.friend_name[0]}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {interest.friend_name} is interested
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {interest.event_title}
                              </p>
                            </div>
                            <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Friend Suggestions Rail */}
              {friendRail && !dismissedFriendRail && (
                <FriendSuggestionsRail
                  suggestions={(friendRail.payload?.users || []) as FriendSuggestion[]}
                  onUserClick={(userId) => onNavigateToProfile?.(userId)}
                  onDismiss={() => setDismissedFriendRail(true)}
                  onAddFriend={async (userId) => {
                    try {
                      const { data, error } = await supabase.rpc('create_friend_request', {
                        receiver_user_id: userId
                      });
                      
                      if (error) {
                        console.error('Error sending friend request:', error);
                        throw error;
                      }
                      
                      console.log('Friend request sent successfully:', data);
                    } catch (error: any) {
                      console.error('Error sending friend request:', error);
                      // Error is already logged, the component will handle the state update
                      throw error;
                    }
                  }}
                />
              )}

              {/* Group Chats Rail */}
              {groupChatRail && groupChatRail.type === 'group_chat' && groupChatRail.group_chat_data && (
                <GroupChatsRail
                  chats={[{
                    chat_id: groupChatRail.group_chat_data.chat_id,
                    chat_name: groupChatRail.group_chat_data.chat_name,
                    member_count: groupChatRail.group_chat_data.member_count,
                    friends_in_chat_count: groupChatRail.group_chat_data.friends_in_chat_count,
                    created_at: groupChatRail.group_chat_data.created_at,
                  }] as GroupChatSuggestion[]}
                  onChatClick={(chatId) => {
                    // TODO: Navigate to chat
                    console.log('Open chat:', chatId);
                  }}
                  onJoinChat={async (chatId) => {
                    // TODO: Implement join chat
                    console.log('Join chat:', chatId);
                  }}
                />
              )}

              {/* Main Feed */}
              <div className="space-y-4">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : scrollableItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No posts yet. Start following people to see their reviews!</p>
                  </div>
                ) : (
                  scrollableItems.map((item, index) => renderFeedItem(item, index))
                )}

                {/* Loading more indicator */}
                {loadingMore && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                )}

                {/* Load more trigger */}
                <div ref={loadMoreRef} className="h-10" />
              </div>
            </div>
          </CardContent>
        </Card>
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
    </div>
  );
};

