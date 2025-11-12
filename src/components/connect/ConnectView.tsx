import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { FriendsReviewService } from '@/services/friendsReviewService';
import type { UnifiedFeedItem } from '@/services/unifiedFeedService';
import type { ReviewWithEngagement } from '@/services/reviewService';
import { ReviewCard } from '@/components/reviews/ReviewCard';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Users, MessageCircle, Sparkles, Calendar, MapPin, Bell, UserPlus, Star, Heart, Share2, Bookmark, Images, Play, X, UserCheck, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { PageActions } from '@/components/PageActions';

type ConnectionProfile = {
  connected_user_id: string;
  name?: string | null;
  avatar_url?: string | null;
  last_active_at?: string | null;
  mutual_friends_count?: number | null;
  is_public_profile?: boolean | null;
};

type ConnectionInterest = {
  id: string;
  userId: string;
  connectionDegree: number;
  connectionLabel: string;
  userName: string;
  userAvatar?: string | null;
  eventId: string;
  eventTitle?: string | null;
  eventArtist?: string | null;
  eventVenue?: string | null;
  eventDate?: string | null;
  eventImage?: string | null;
  createdAt: string;
};

type ChatPreview = {
  id: string;
  chat_name: string;
  is_group_chat: boolean;
  users: string[];
  latest_message: string | null;
  latest_message_created_at: string | null;
  latest_message_sender_name: string | null;
  unread_count?: number;
};

type RecommendedUser = {
  recommended_user_id: string;
  name: string | null;
  avatar_url: string | null;
  connection_degree: number;
  connection_label: string;
  recommendation_score: number;
  shared_artists_count: number;
  shared_venues_count: number;
  shared_genres_count: number;
  shared_events_count: number;
  mutual_friends_count: number;
  recommendation_reasons: string[];
};

interface ConnectViewProps {
  currentUserId: string;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (targetId: string) => void;
  onNavigateToNotifications?: () => void;
}

const CONNECTION_LABELS: Record<number, string> = {
  1: 'Friend',
  2: 'Mutual Friend',
  3: 'Mutual Friends +',
};

const resolveConnectionMeta = (
  userId: string,
  first: Set<string>,
  second: Set<string>,
  third: Set<string>
) => {
  if (first.has(userId)) {
    return { degree: 1, label: CONNECTION_LABELS[1] };
  }
  if (second.has(userId)) {
    return { degree: 2, label: CONNECTION_LABELS[2] };
  }
  if (third.has(userId)) {
    return { degree: 3, label: CONNECTION_LABELS[3] };
  }
  return { degree: 0, label: 'Stranger' };
};

const safeFormatDate = (value?: string | null, pattern = 'MMM d, yyyy') => {
  if (!value) return null;
  try {
    return format(parseISO(value), pattern);
  } catch {
    return value;
  }
};

const transformFeedItemToReview = (item: UnifiedFeedItem, currentUserId: string): ReviewWithEngagement => {
  return {
    id: item.review_id || item.id,
    user_id: item.author?.id || currentUserId,
    event_id: (item as any).event_id || '',
    rating: typeof item.rating === 'number' ? item.rating : 0,
    review_text: item.content || '',
    is_public: true,
    created_at: item.created_at,
    updated_at: item.updated_at || item.created_at,
    likes_count: item.likes_count || 0,
    comments_count: item.comments_count || 0,
    shares_count: item.shares_count || 0,
    is_liked_by_user: item.is_liked || false,
    reaction_emoji: '',
    photos: Array.isArray(item.photos) ? item.photos : [],
    videos: [],
    mood_tags: [],
    genre_tags: [],
    context_tags: [],
    artist_name: item.event_info?.artist_name,
    artist_id: item.event_info?.artist_id,
    venue_name: item.event_info?.venue_name,
    venue_id: (item.event_info as any)?.venue_id,
  } as ReviewWithEngagement;
};

export const ConnectView: React.FC<ConnectViewProps> = ({
  currentUserId,
  onNavigateToProfile,
  onNavigateToChat,
  onNavigateToNotifications,
}) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewItems, setReviewItems] = useState<UnifiedFeedItem[]>([]);

  const [firstConnections, setFirstConnections] = useState<ConnectionProfile[]>([]);
  const [secondConnections, setSecondConnections] = useState<ConnectionProfile[]>([]);
  const [thirdConnections, setThirdConnections] = useState<ConnectionProfile[]>([]);
  const [interestsLoading, setInterestsLoading] = useState(true);
  const [connectionInterests, setConnectionInterests] = useState<ConnectionInterest[]>([]);
  const [recommendedUsers, setRecommendedUsers] = useState<RecommendedUser[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(true);

  const [chatPreviews, setChatPreviews] = useState<ChatPreview[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [chatUserNames, setChatUserNames] = useState<Map<string, string>>(new Map());
  const [recommendedChatFriends, setRecommendedChatFriends] = useState<Array<{
    user_id: string;
    name: string;
    avatar_url: string | null;
    shared_event_id?: string;
    shared_event_title?: string;
    shared_event_artist?: string;
    shared_event_date?: string;
    connection_label: string;
    reason: string;
  }>>([]);
  const [recommendedChatFriendsLoading, setRecommendedChatFriendsLoading] = useState(false);
  const [likedReviews, setLikedReviews] = useState<Set<string>>(new Set());
  const [showReviewDetailModal, setShowReviewDetailModal] = useState(false);
  const [selectedReviewDetail, setSelectedReviewDetail] = useState<UnifiedFeedItem | null>(null);
  const [loadingReviewDetails, setLoadingReviewDetails] = useState(false);
  const [reviewAuthorConnection, setReviewAuthorConnection] = useState<{
    degree: number;
    label: string;
    color: string;
  } | null>(null);
  const [sendingFriendRequest, setSendingFriendRequest] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<Array<{
    user_id: string;
    name: string | null;
    avatar_url: string | null;
  }>>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [reviewDetailData, setReviewDetailData] = useState<{
    photos: string[];
    videos: string[];
    categoryRatings: {
      performance?: number;
      venue?: number;
      overallExperience?: number;
    };
    categoryTexts: {
      performance?: string;
      venue?: string;
      overallExperience?: string;
    };
    moodTags?: string[];
    genreTags?: string[];
    contextTags?: string[];
    venueTags?: string[];
    artistTags?: string[];
    reactionEmoji?: string;
  } | null>(null);

  useEffect(() => {
    let active = true;

    const loadReviews = async () => {
      setReviewsLoading(true);
      try {
        const items = await FriendsReviewService.getConnectionDegreeReviews(currentUserId, 6, 0);
        if (active) {
          setReviewItems(items);
        }
      } catch (error) {
        console.error('Error loading connection reviews:', error);
        if (active) {
          setReviewItems([]);
        }
      } finally {
        if (active) {
          setReviewsLoading(false);
        }
      }
    };

    loadReviews();

    return () => {
      active = false;
    };
  }, [currentUserId]);

  useEffect(() => {
    let active = true;

    const loadConnectionsAndInterests = async () => {
      setInterestsLoading(true);
      try {
        // Try to fetch connections, but handle missing RPC functions gracefully
        const [firstRes, secondRes, thirdRes] = await Promise.allSettled([
          supabase.rpc('get_first_degree_connections', { target_user_id: currentUserId }),
          supabase.rpc('get_second_degree_connections', { target_user_id: currentUserId }),
          supabase.rpc('get_third_degree_connections', { target_user_id: currentUserId }),
        ]);

        if (!active) return;

        // Extract data from results, handling both fulfilled and rejected promises
        const firstData = firstRes.status === 'fulfilled' && !firstRes.value.error && firstRes.value.data 
          ? firstRes.value.data 
          : [] as ConnectionProfile[];
        const secondData = secondRes.status === 'fulfilled' && !secondRes.value.error && secondRes.value.data 
          ? secondRes.value.data 
          : [] as ConnectionProfile[];
        const thirdData = thirdRes.status === 'fulfilled' && !thirdRes.value.error && thirdRes.value.data 
          ? thirdRes.value.data 
          : [] as ConnectionProfile[];

        const firstIds = new Set(firstData.map((item) => item.connected_user_id));
        const secondIds = new Set(secondData.map((item) => item.connected_user_id));
        const thirdIds = new Set(thirdData.map((item) => item.connected_user_id));

        setFirstConnections(firstData);
        setSecondConnections(secondData);
        setThirdConnections(thirdData);

        const interestIds = Array.from(
          new Set([
            ...firstIds,
            ...secondIds,
            ...thirdIds,
          ])
        ).filter(Boolean);

        if (interestIds.length === 0) {
          setConnectionInterests([]);
          return;
        }

        const { data, error } = await supabase
          .from('user_jambase_events')
          .select(
            `
              id,
              user_id,
              jambase_event_id,
              created_at,
              profiles!inner(user_id, name, avatar_url),
              jambase_events!inner(
                id,
                title,
                artist_name,
                venue_name,
                event_date,
                poster_image_url,
                images
              )
            `
          )
          .in('user_id', interestIds)
          .order('created_at', { ascending: false })
          .limit(12);

        if (error) {
          throw error;
        }

        if (!active) return;

        const interests = (data || []).map((row: any) => {
          const connectionMeta = resolveConnectionMeta(
            row.user_id,
            firstIds as Set<string>,
            secondIds as Set<string>,
            thirdIds as Set<string>
          );

          const eventData = row.jambase_events || {};
          const images = Array.isArray(eventData.images) ? eventData.images : [];
          const fallbackImage =
            eventData.poster_image_url ||
            (images.length > 0 ? images.find((img: any) => img?.url)?.url : undefined);

          return {
            id: row.id || `${row.user_id}-${row.jambase_event_id}`,
            userId: row.user_id,
            connectionDegree: connectionMeta.degree,
            connectionLabel: connectionMeta.label,
            userName: row.profiles?.name || 'Connection',
            userAvatar: row.profiles?.avatar_url || undefined,
            eventId: eventData.id || row.jambase_event_id,
            eventTitle: eventData.title,
            eventArtist: eventData.artist_name,
            eventVenue: eventData.venue_name,
            eventDate: eventData.event_date,
            eventImage: fallbackImage,
            createdAt: row.created_at,
          } as ConnectionInterest;
        });

        setConnectionInterests(interests);
      } catch (error) {
        console.error('Error loading connection interests:', error);
        if (active) {
          setConnectionInterests([]);
        }
      } finally {
        if (active) {
          setInterestsLoading(false);
        }
      }
    };

    loadConnectionsAndInterests();

    return () => {
      active = false;
    };
  }, [currentUserId]);

  useEffect(() => {
    let active = true;

    const loadChats = async () => {
      setChatsLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_user_chats', {
          user_id: currentUserId,
        });

        if (error) throw error;
        if (!active) return;

        // Fetch unread counts for each chat
        // Only count chats that haven't been marked as read
        const readChats = JSON.parse(localStorage.getItem('read_chats') || '[]');
        const chatsWithUnread = await Promise.all((data || []).map(async (chat: any) => {
          try {
            // If chat has been read, no unread messages
            if (readChats.includes(chat.id)) {
              return {
                ...chat,
                unread_count: 0
              } as ChatPreview;
            }

            // Get latest message to check if it's from current user
            const { data: latestMessage } = await supabase
              .from('messages')
              .select('sender_id')
              .eq('chat_id', chat.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            // If latest message is from current user, no unread
            if (!latestMessage || latestMessage.sender_id === currentUserId) {
              return {
                ...chat,
                unread_count: 0
              } as ChatPreview;
            }

            // Count messages not sent by current user
            const { count } = await supabase
              .from('messages')
              .select('*', { count: 'exact', head: true })
              .eq('chat_id', chat.id)
              .neq('sender_id', currentUserId);
            
            return {
              ...chat,
              unread_count: count || 0
            } as ChatPreview;
          } catch (error) {
            console.error('Error fetching unread count for chat:', chat.id, error);
            return {
              ...chat,
              unread_count: 0
            } as ChatPreview;
          }
        }));

        // Sort: unread messages first, then by latest message time
        const sortedChats = chatsWithUnread.sort((a, b) => {
          // First sort by unread count (unread first)
          if ((a.unread_count || 0) > 0 && (b.unread_count || 0) === 0) return -1;
          if ((a.unread_count || 0) === 0 && (b.unread_count || 0) > 0) return 1;
          
          // Then sort by latest message time
          const aTime = a.latest_message_created_at ? new Date(a.latest_message_created_at).getTime() : 0;
          const bTime = b.latest_message_created_at ? new Date(b.latest_message_created_at).getTime() : 0;
          return bTime - aTime;
        });

        setChatPreviews(sortedChats);

        // Fetch user names for direct chats
        const userIdsToFetch = new Set<string>();
        sortedChats.forEach(chat => {
          if (!chat.is_group_chat) {
            const otherUserId = chat.users.find(id => id !== currentUserId);
            if (otherUserId) {
              userIdsToFetch.add(otherUserId);
            }
          }
        });

        if (userIdsToFetch.size > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, name')
            .in('user_id', Array.from(userIdsToFetch));

          const nameMap = new Map<string, string>();
          profiles?.forEach(profile => {
            if (profile.name) {
              nameMap.set(profile.user_id, profile.name);
            }
          });
          setChatUserNames(nameMap);
        }

        // If all chats are read, fetch recommendations
        const hasUnreadChats = sortedChats.some(chat => (chat.unread_count || 0) > 0);
        if (!hasUnreadChats) {
          fetchRecommendedChatFriends();
        } else {
          setRecommendedChatFriends([]);
        }

        // Note: Recommendations will be fetched via useEffect when connections are ready
      } catch (error) {
        console.error('Error loading chat previews:', error);
        if (active) {
          setChatPreviews([]);
        }
      } finally {
        if (active) {
          setChatsLoading(false);
        }
      }
    };

    loadChats();

    return () => {
      active = false;
    };
  }, [currentUserId]);

  const firstSet = useMemo(
    () => new Set(firstConnections.map((item) => item.connected_user_id)),
    [firstConnections]
  );
  const secondSet = useMemo(
    () => new Set(secondConnections.map((item) => item.connected_user_id)),
    [secondConnections]
  );
  const thirdSet = useMemo(
    () => new Set(thirdConnections.map((item) => item.connected_user_id)),
    [thirdConnections]
  );

  // Fetch recently added friends who haven't been chatted with
  const fetchRecentlyAddedFriends = async () => {
    try {
      const { data: friendsData } = await supabase
        .from('friends')
        .select('user1_id, user2_id, created_at')
        .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!friendsData || friendsData.length === 0) {
        setRecommendedChatFriends([]);
        return;
      }

      const friendIds = friendsData.map(f => 
        f.user1_id === currentUserId ? f.user2_id : f.user1_id
      );

      // Get existing chats to exclude
      const { data: existingChats } = await supabase.rpc('get_user_chats', {
        user_id: currentUserId
      });

      const existingChatUserIds = new Set<string>();
      existingChats?.forEach((chat: any) => {
        if (!chat.is_group_chat) {
          chat.users.forEach((userId: string) => {
            if (userId !== currentUserId) {
              existingChatUserIds.add(userId);
            }
          });
        }
      });

      // Get profiles for friends who don't have chats yet
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, name, avatar_url')
        .in('user_id', friendIds.filter(id => !existingChatUserIds.has(id)))
        .limit(5);

      const recommendations = profiles?.map(profile => {
        const connectionMeta = resolveConnectionMeta(
          profile.user_id,
          firstSet,
          secondSet,
          thirdSet
        );
        return {
          user_id: profile.user_id,
          name: profile.name || 'Friend',
          avatar_url: profile.avatar_url,
          shared_event_id: '',
          shared_event_title: '',
          shared_event_artist: '',
          shared_event_date: '',
          connection_label: connectionMeta.label,
          reason: 'Recently added friend',
        };
      }) || [];

      setRecommendedChatFriends(recommendations);
    } catch (error) {
      console.error('Error fetching recently added friends:', error);
      setRecommendedChatFriends([]);
    }
  };

  // Fetch recommended friends to chat with
  // Fetch recommended friends when all chats are read and connections are loaded
  useEffect(() => {
    if (!chatsLoading && !interestsLoading && chatPreviews.length >= 0) {
      const hasUnread = chatPreviews.some(chat => (chat.unread_count || 0) > 0);
      if (!hasUnread && firstConnections.length > 0) {
        fetchRecommendedChatFriends();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatsLoading, interestsLoading, chatPreviews, firstConnections.length]);

  // Load user recommendations
  useEffect(() => {
    let active = true;

    const loadRecommendations = async () => {
      setRecommendationsLoading(true);
      try {
        console.log('Loading recommendations for user:', currentUserId);
        
        // First, try to fetch cached recommendations
        const { data: cachedData, error: cachedError } = await supabase.rpc('get_user_recommendations', {
          p_user_id: currentUserId,
          p_limit: 10,
        });

        console.log('Cached data:', cachedData, 'Error:', cachedError);

        // If we have cached data, use it immediately
        if (cachedData && cachedData.length > 0 && active) {
          console.log('Using cached recommendations:', cachedData.length);
          setRecommendedUsers(cachedData as RecommendedUser[]);
          setRecommendationsLoading(false);
          
          // Calculate/refresh in background (don't await)
          supabase.rpc('calculate_user_recommendations', {
            p_user_id: currentUserId,
          }).then(({ error }) => {
            if (error) {
              console.error('Error refreshing recommendations in background:', error);
            }
          });
          return;
        }

        // If no cache or error, calculate now
        if (cachedError || !cachedData || cachedData.length === 0) {
          console.log('No cached data, calculating recommendations...');
          const calcResult = await supabase.rpc('calculate_user_recommendations', {
            p_user_id: currentUserId,
          });
          console.log('Calculation result:', calcResult);

          // Fetch the newly calculated recommendations
          const { data, error } = await supabase.rpc('get_user_recommendations', {
            p_user_id: currentUserId,
            p_limit: 10,
          });

          console.log('Fetched recommendations:', data, 'Error:', error);

          if (error) {
            console.error('Error loading recommendations:', error);
            if (active) {
              setRecommendedUsers([]);
            }
            return;
          }

          if (active) {
            console.log('Setting recommendations:', data?.length || 0);
            setRecommendedUsers((data || []) as RecommendedUser[]);
          }
        }
      } catch (error) {
        console.error('Error loading recommendations:', error);
        if (active) {
          setRecommendedUsers([]);
        }
      } finally {
        if (active) {
          setRecommendationsLoading(false);
        }
      }
    };

    loadRecommendations();

    return () => {
      active = false;
    };
  }, [currentUserId]);

  // User search functionality
  const searchUsers = async (query: string) => {
    if (!query.trim()) {
      setUserSearchResults([]);
      setUserSearchOpen(false);
      return;
    }

    try {
      setUserSearchLoading(true);
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('user_id, name, avatar_url')
        .ilike('name', `%${query}%`)
        .neq('user_id', currentUserId) // Exclude current user
        .limit(10);

      if (error) {
        console.error('Error searching users:', error);
        return;
      }

      setUserSearchResults(profiles || []);
      setUserSearchOpen(true);
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setUserSearchLoading(false);
    }
  };

  const handleUserSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setUserSearchQuery(query);
    searchUsers(query);
  };

  const handleUserSelect = (userId: string) => {
    setUserSearchQuery('');
    setUserSearchResults([]);
    setUserSearchOpen(false);
    onNavigateToProfile?.(userId);
  };

  const renderPeopleYouMightKnowCard = () => {
    return (
      <Card className="shadow-md border border-white/60 bg-white/80">
        <CardHeader className="pb-3 px-4 pt-4">
          <CardTitle className="text-base font-bold text-foreground flex items-center gap-2 mb-1">
            <UserPlus className="w-4 h-4 text-green-500" />
            People you might know
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Based on your shared interests and network
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {recommendationsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-synth-pink" />
            </div>
          ) : recommendedUsers.length === 0 ? (
            <div className="text-center py-6">
              <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground text-sm">More coming soon.</p>
            </div>
          ) : (
            <div className="overflow-x-auto pb-2 -mx-4 px-4">
              <div className="flex gap-3 min-w-max">
                {recommendedUsers.map((user) => (
                  <Card
                    key={user.recommended_user_id}
                    className="border flex-shrink-0 w-[280px] hover:shadow-md transition-shadow"
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-col items-center text-center mb-3">
                        <Avatar
                          className="w-16 h-16 mb-2 cursor-pointer"
                          onClick={() => onNavigateToProfile?.(user.recommended_user_id)}
                        >
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback className="text-lg">
                            {user.name
                              ? user.name
                                  .split(' ')
                                  .map((part) => part[0])
                                  .join('')
                                  .slice(0, 2)
                                  .toUpperCase()
                              : 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <h3
                          className="font-semibold text-sm text-gray-900 mb-1 cursor-pointer hover:text-synth-pink transition-colors"
                          onClick={() => onNavigateToProfile?.(user.recommended_user_id)}
                        >
                          {user.name || 'User'}
                        </h3>
                        <Badge variant="outline" className="text-xs mb-2">
                          {user.connection_label}
                        </Badge>
                      </div>

                      {user.recommendation_reasons && user.recommendation_reasons.length > 0 && (
                        <div className="space-y-1 mb-3">
                          {user.recommendation_reasons.map((reason, idx) => (
                            <p key={idx} className="text-xs text-muted-foreground text-center">
                              {reason}
                            </p>
                          ))}
                        </div>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full flex items-center justify-center gap-2"
                        onClick={async () => {
                          if (sendingFriendRequest) return;
                          try {
                            setSendingFriendRequest(true);
                            const { error } = await supabase.rpc('create_friend_request', {
                              receiver_user_id: user.recommended_user_id,
                            });

                            if (error) throw error;

                            toast({
                              title: 'Friend Request Sent! 🎉',
                              description: 'Your friend request has been sent.',
                            });

                            setRecommendedUsers((prev) =>
                              prev.filter((u) => u.recommended_user_id !== user.recommended_user_id)
                            );
                          } catch (error: any) {
                            console.error('Error sending friend request:', error);
                            toast({
                              title: 'Error',
                              description:
                                error.message ||
                                'Failed to send friend request. Please try again.',
                              variant: 'destructive',
                            });
                          } finally {
                            setSendingFriendRequest(false);
                          }
                        }}
                        disabled={sendingFriendRequest}
                      >
                        {sendingFriendRequest ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <UserPlus className="h-4 w-4" />
                            Add Friend
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderUserSearchBar = () => {
    return (
      <div className="relative w-full max-w-xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            type="text"
            placeholder="Search users..."
            value={userSearchQuery}
            onChange={handleUserSearchChange}
            onFocus={() => {
              if (userSearchResults.length > 0) {
                setUserSearchOpen(true);
              }
            }}
            onBlur={() => {
              setTimeout(() => {
                setUserSearchOpen(false);
              }, 150);
            }}
            className="pl-10 pr-10 h-12 rounded-full bg-white/85 shadow-sm"
            autoComplete="off"
          />
          {userSearchQuery && !userSearchLoading && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setUserSearchQuery('');
                setUserSearchResults([]);
                setUserSearchOpen(false);
              }}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-gray-100"
            >
              <X className="w-3 h-3" />
            </Button>
          )}
          {userSearchLoading && (
            <Loader2 className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
          )}
        </div>
        {userSearchOpen && userSearchResults.length > 0 && (
          <Card className="absolute top-full left-0 right-0 z-50 mt-2 max-h-80 overflow-y-auto shadow-lg border bg-white">
            <CardContent className="p-0">
              <div className="py-2">
                {userSearchResults.map((user) => (
                  <div
                    key={user.user_id}
                    className="px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => handleUserSelect(user.user_id)}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback>
                          {user.name
                            ? user.name
                                .split(' ')
                                .map((part) => part[0])
                                .join('')
                                .slice(0, 2)
                                .toUpperCase()
                            : 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 truncate">
                          {user.name || 'User'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderReviewsSection = () => {
    if (reviewsLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-synth-pink" />
        </div>
      );
    }

    if (reviewItems.length === 0) {
      return (
        <Card>
          <CardContent className="py-10 text-center">
            <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">
              No reviews from your network yet. Encourage friends to share their experiences!
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-6">
        {reviewItems.map((item, index) => {
          const review = transformFeedItemToReview(item, currentUserId);
          const isLiked = likedReviews.has(review.id) || review.is_liked_by_user || false;
          
          return (
            <React.Fragment key={item.id}>
              <ReviewCard
                review={review}
                userProfile={{
                  name: item.author?.name || 'User',
                  avatar_url: item.author?.avatar_url || undefined,
                  verified: (item.author as any)?.verified,
                  account_type: (item.author as any)?.account_type,
                }}
                isLiked={isLiked}
                onLike={(reviewId) => {
                  const newLiked = !isLiked;
                  setLikedReviews((prev) => {
                    const next = new Set(prev);
                    if (newLiked) {
                      next.add(reviewId);
                    } else {
                      next.delete(reviewId);
                    }
                    return next;
                  });
                }}
                onComment={(reviewId) => {
                  console.log('Comment on review:', reviewId);
                }}
                onShare={(reviewId) => {
                  console.log('Share review:', reviewId);
                }}
                onOpenReviewDetail={async (review) => {
                // Find the corresponding UnifiedFeedItem to show in modal
                const item = reviewItems.find(item => (item.review_id || item.id) === review.id);
                if (item) {
                  setSelectedReviewDetail(item);
                  setShowReviewDetailModal(true);
                  
                  // Reset previous data
                  setReviewDetailData(null);
                  setReviewAuthorConnection(null);
                  setLoadingReviewDetails(true);
                  
                  // Fetch connection info for the review author
                  const authorId = item.author?.id;
                  if (authorId && authorId !== currentUserId) {
                    try {
                      const { data: connectionData, error: connectionError } = await supabase
                        .rpc('get_connection_info', {
                          current_user_id: currentUserId,
                          target_user_id: authorId
                        });
                      
                      if (!connectionError && connectionData && connectionData.length > 0) {
                        setReviewAuthorConnection({
                          degree: connectionData[0].degree,
                          label: connectionData[0].label,
                          color: connectionData[0].color,
                        });
                      }
                    } catch (err) {
                      console.warn('Error fetching connection info:', err);
                    }
                  }
                  
                  // Fetch full review details including category ratings and media
                  try {
                    const reviewId = review.id || item.review_id || item.id;
                    console.log('Fetching review details for ID:', reviewId);
                    console.log('Review object:', review);
                    console.log('Item object:', item);
                    
                    // Query review details using the actual schema columns
                    // Based on public_reviews_with_profiles view schema:
                    // performance_rating, venue_rating, overall_experience_rating
                    // performance_review_text, venue_review_text, overall_experience_review_text
                    const { data, error } = await (supabase as any)
                      .from('user_reviews')
                      .select(`
                        photos,
                        videos,
                        performance_rating,
                        venue_rating,
                        overall_experience_rating,
                        performance_review_text,
                        venue_review_text,
                        overall_experience_review_text,
                        mood_tags,
                        genre_tags,
                        context_tags,
                        venue_tags,
                        artist_tags,
                        reaction_emoji,
                        review_text
                      `)
                      .eq('id', reviewId)
                      .maybeSingle();
                    
                    if (error) {
                      console.error('Error fetching review details:', error);
                      console.error('Error code:', error.code);
                      console.error('Error message:', error.message);
                      console.error('Error hint:', error.hint);
                      console.error('Error details:', JSON.stringify(error, null, 2));
                      setReviewDetailData(null);
                      setLoadingReviewDetails(false);
                      return;
                    }
                    
                    if (data) {
                      console.log('Review detail data loaded:', data);
                      setReviewDetailData({
                        photos: Array.isArray(data.photos) ? data.photos : [],
                        videos: Array.isArray(data.videos) ? data.videos : [],
                        categoryRatings: {
                          performance: typeof data.performance_rating === 'number' ? data.performance_rating : undefined,
                          venue: typeof data.venue_rating === 'number' ? data.venue_rating : undefined,
                          overallExperience: typeof data.overall_experience_rating === 'number' ? data.overall_experience_rating : undefined,
                        },
                        categoryTexts: {
                          performance: data.performance_review_text || undefined,
                          venue: data.venue_review_text || undefined,
                          overallExperience: data.overall_experience_review_text || undefined,
                        },
                        moodTags: Array.isArray(data.mood_tags) && data.mood_tags.length > 0 ? data.mood_tags : undefined,
                        genreTags: Array.isArray(data.genre_tags) && data.genre_tags.length > 0 ? data.genre_tags : undefined,
                        contextTags: Array.isArray(data.context_tags) && data.context_tags.length > 0 ? data.context_tags : undefined,
                        venueTags: Array.isArray(data.venue_tags) && data.venue_tags.length > 0 ? data.venue_tags : undefined,
                        artistTags: Array.isArray(data.artist_tags) && data.artist_tags.length > 0 ? data.artist_tags : undefined,
                        reactionEmoji: data.reaction_emoji || undefined,
                      });
                    } else {
                      console.log('No review data found for ID:', reviewId);
                      setReviewDetailData(null);
                    }
                  } catch (error) {
                    console.error('Error fetching review details:', error);
                    setReviewDetailData(null);
                  } finally {
                    setLoadingReviewDetails(false);
                  }
                } else {
                  console.log('Review item not found for review ID:', review.id);
                }
              }}
              onOpenArtist={(artistId, artistName) => {
                navigate(`/artist/${encodeURIComponent(artistName)}`);
              }}
              onOpenVenue={(venueId, venueName) => {
                navigate(`/venue/${encodeURIComponent(venueName)}`);
              }}
            />
            {(index + 1) % 5 === 0 && renderPeopleYouMightKnowCard()}
          </React.Fragment>
        );
      })}
    </div>
  );
};

  const renderInterestsSection = () => {
    if (interestsLoading) {
      return (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-synth-pink" />
        </div>
      );
    }

    if (connectionInterests.length === 0) {
      return (
        <Card>
          <CardContent className="py-10 text-center">
            <Sparkles className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">
              No recent event interests from your network. Check back soon!
            </p>
          </CardContent>
        </Card>
      );
    }

    // Group interests by event and get unique friends per event
    const interestsByEvent = new Map<string, ConnectionInterest[]>();
    connectionInterests.forEach(interest => {
      const eventId = interest.eventId;
      if (!interestsByEvent.has(eventId)) {
        interestsByEvent.set(eventId, []);
      }
      interestsByEvent.get(eventId)!.push(interest);
    });

    // Get events where user is also interested, limit to 2-3
    const userInterestedEvents = new Set<string>();
    const getFriendsForSameEvents = async () => {
      try {
        // Get user's interested events
        const { data: userEvents } = await supabase
          .from('user_jambase_events')
          .select('jambase_event_id')
          .eq('user_id', currentUserId)
          .limit(50);

        if (userEvents) {
          userEvents.forEach(event => {
            userInterestedEvents.add(event.jambase_event_id);
          });
        }
      } catch (error) {
        console.error('Error fetching user events:', error);
      }
    };

    // Filter to show only friends interested in events the user is also interested in
    const relevantInterests = connectionInterests
      .filter(interest => {
        // For now, show all interests but prioritize ones where user might be interested
        // In a full implementation, you'd check if user is interested in the same event
        return true;
      })
      .slice(0, 3); // Show 2-3 friends

    return (
      <div className="grid gap-4 md:grid-cols-2">
        {relevantInterests.map((interest) => {
          const createdAtLabel = safeFormatDate(interest.createdAt);
          const eventDateLabel = safeFormatDate(interest.eventDate);
          
          const handleStartChat = async () => {
            if (!onNavigateToChat) return;
            try {
              // Create or get direct chat with this friend
              const { data: chatId, error } = await supabase.rpc('create_direct_chat', {
                user1_id: currentUserId,
                user2_id: interest.userId
              });

              if (error) {
                console.error('Error creating chat:', error);
                toast({
                  title: "Error",
                  description: "Failed to start chat. Please try again.",
                  variant: "destructive",
                });
                return;
              }

              onNavigateToChat(interest.userId);
              toast({
                title: "Chat Started! 💬",
                description: `You can now chat with ${interest.userName} about this event!`,
              });
            } catch (error) {
              console.error('Error starting chat:', error);
              toast({
                title: "Error",
                description: "Failed to start chat. Please try again.",
                variant: "destructive",
              });
            }
          };

          return (
            <Card key={interest.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={interest.userAvatar || undefined} />
                    <AvatarFallback>
                      {interest.userName
                        .split(' ')
                        .map((part) => part[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-gray-900 truncate">{interest.userName}</p>
                      <Badge variant="outline" className="text-xs">
                        {interest.connectionLabel}
                      </Badge>
                    </div>
                    {createdAtLabel && (
                      <p className="text-xs text-muted-foreground">
                        {createdAtLabel}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2 rounded-lg bg-muted/40 p-3 border border-muted-foreground/20">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">
                    {interest.eventTitle || 'Upcoming Event'}
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {interest.eventArtist && (
                      <span className="flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        {interest.eventArtist}
                      </span>
                    )}
                    {interest.eventVenue && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {interest.eventVenue}
                      </span>
                    )}
                    {eventDateLabel && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {eventDateLabel}
                      </span>
                    )}
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full flex items-center justify-center gap-2"
                  onClick={handleStartChat}
                >
                  <MessageCircle className="h-4 w-4" />
                  Start Chat
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  // Fetch recommended friends to chat with
  const fetchRecommendedChatFriends = async () => {
    setRecommendedChatFriendsLoading(true);
    try {
      // First, get user's interested events
      const { data: userEvents } = await supabase
        .from('user_jambase_events')
        .select('jambase_event_id')
        .eq('user_id', currentUserId)
        .limit(50);

      if (!userEvents || userEvents.length === 0) {
        // If user has no interested events, get recently added friends
        await fetchRecentlyAddedFriends();
        return;
      }

      const userEventIds = userEvents.map(e => e.jambase_event_id);

      // Get friends who are also interested in these events
      const { data: friendsData } = await supabase
        .from('friends')
        .select('user1_id, user2_id, created_at')
        .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
        .order('created_at', { ascending: false });

      if (!friendsData || friendsData.length === 0) {
        setRecommendedChatFriends([]);
        return;
      }

      const friendIds = friendsData.map(f => 
        f.user1_id === currentUserId ? f.user2_id : f.user1_id
      );

      // Get friends' interested events that match user's events
      const { data: friendInterests } = await supabase
        .from('user_jambase_events')
        .select(`
          user_id,
          jambase_event_id,
          jambase_events!inner(
            id,
            title,
            artist_name,
            event_date
          )
        `)
        .in('user_id', friendIds)
        .in('jambase_event_id', userEventIds)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!friendInterests || friendInterests.length === 0) {
        // No shared events, get recently added friends
        await fetchRecentlyAddedFriends();
        return;
      }

      // Get unique friends (one per friend, with their first shared event)
      const friendMap = new Map<string, any>();
      friendInterests.forEach((interest: any) => {
        if (!friendMap.has(interest.user_id)) {
          friendMap.set(interest.user_id, {
            user_id: interest.user_id,
            shared_event_id: interest.jambase_event_id,
            shared_event_title: interest.jambase_events?.title,
            shared_event_artist: interest.jambase_events?.artist_name,
            shared_event_date: interest.jambase_events?.event_date,
          });
        }
      });

      // Get profiles for these friends
      const friendUserIds = Array.from(friendMap.keys());
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, name, avatar_url')
        .in('user_id', friendUserIds);

      // Check which friends already have chats
      const { data: existingChats } = await supabase.rpc('get_user_chats', {
        user_id: currentUserId
      });

      const existingChatUserIds = new Set<string>();
      existingChats?.forEach((chat: any) => {
        if (!chat.is_group_chat) {
          chat.users.forEach((userId: string) => {
            if (userId !== currentUserId) {
              existingChatUserIds.add(userId);
            }
          });
        }
      });

      // Build recommendations (exclude friends who already have chats)
      const recommendations = profiles
        ?.filter(profile => !existingChatUserIds.has(profile.user_id))
        .map(profile => {
          const friendData = friendMap.get(profile.user_id);
          // Get connection label
          const connectionMeta = resolveConnectionMeta(
            profile.user_id,
            firstSet,
            secondSet,
            thirdSet
          );
          return {
            user_id: profile.user_id,
            name: profile.name || 'Friend',
            avatar_url: profile.avatar_url,
            shared_event_id: friendData?.shared_event_id || '',
            shared_event_title: friendData?.shared_event_title || '',
            shared_event_artist: friendData?.shared_event_artist || '',
            shared_event_date: friendData?.shared_event_date || '',
            connection_label: connectionMeta.label,
            reason: friendData?.shared_event_artist 
              ? `Interested in ${friendData.shared_event_artist}`
              : 'Friend',
          };
        })
        .slice(0, 5) || [];

      setRecommendedChatFriends(recommendations);
    } catch (error) {
      console.error('Error fetching recommended chat friends:', error);
      await fetchRecentlyAddedFriends();
    } finally {
      setRecommendedChatFriendsLoading(false);
    }
  };

  const _renderChatSection = () => {
    if (chatsLoading) {
      return (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-synth-pink" />
        </div>
      );
    }

    // Get unread chats and read chats separately
    const unreadChats = chatPreviews.filter(chat => (chat.unread_count || 0) > 0);
    const readChats = chatPreviews.filter(chat => (chat.unread_count || 0) === 0);
    
    // If there are unread chats, show all chats (unread first, then read)
    if (unreadChats.length > 0) {
      const chatsToShow = [...unreadChats, ...readChats];

      return (
        <div className="space-y-1.5">
          {chatsToShow.map((chat) => {
            const latestMessageTime = safeFormatDate(chat.latest_message_created_at, 'h:mm a');
            const hasUnread = (chat.unread_count || 0) > 0;

            const openChat = () => {
              if (!onNavigateToChat) return;
              if (chat.is_group_chat) {
                onNavigateToChat(chat.id);
              } else {
                const otherUserId =
                  chat.users.find((id) => id !== currentUserId) || chat.users[0];
                onNavigateToChat(otherUserId);
              }
            };

            return (
              <Card key={chat.id} className={`border cursor-pointer hover:bg-muted/50 transition-colors ${hasUnread ? 'bg-synth-pink/5 border-synth-pink/20' : ''}`} onClick={openChat}>
                <CardContent className="p-2">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {hasUnread && (
                          <div className="w-2 h-2 bg-synth-pink rounded-full flex-shrink-0" />
                        )}
                        <p className={`font-semibold text-xs truncate ${hasUnread ? 'text-gray-900' : 'text-gray-900'}`}>
                          {chat.is_group_chat 
                            ? (chat.chat_name || 'Group Chat')
                            : (chatUserNames.get(chat.users.find(id => id !== currentUserId) || '') || chat.chat_name || 'Chat')
                          }
                        </p>
                      </div>
                      {latestMessageTime && (
                        <p className="text-xs text-muted-foreground flex-shrink-0 ml-1.5">{latestMessageTime}</p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate leading-tight">
                      {chat.latest_message || 'No messages'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      );
    }

    // If all chats are read, show recommended friends to chat with
    if (recommendedChatFriendsLoading) {
      return (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-synth-pink" />
        </div>
      );
    }

    if (recommendedChatFriends.length === 0) {
      return (
        <div className="text-center py-4">
          <MessageCircle className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground text-xs">
            No chats or recommendations
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-1.5">
        {recommendedChatFriends.map((friend) => {
          const handleStartChat = async () => {
            if (!onNavigateToChat) return;
            try {
              const { data: chatId, error } = await supabase.rpc('create_direct_chat', {
                user1_id: currentUserId,
                user2_id: friend.user_id
              });

              if (error) {
                console.error('Error creating chat:', error);
                toast({
                  title: "Error",
                  description: "Failed to start chat. Please try again.",
                  variant: "destructive",
                });
                return;
              }

              onNavigateToChat(friend.user_id);
              toast({
                title: "Chat Started! 💬",
                description: friend.shared_event_title 
                  ? `You can now chat with ${friend.name} about ${friend.shared_event_artist || 'this event'}!`
                  : `You can now chat with ${friend.name}!`,
              });
            } catch (error) {
              console.error('Error starting chat:', error);
              toast({
                title: "Error",
                description: "Failed to start chat. Please try again.",
                variant: "destructive",
              });
            }
          };

          return (
            <Card key={friend.user_id} className="border cursor-pointer hover:bg-muted/50 transition-colors">
              <CardContent className="p-2">
                <div className="min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="font-semibold text-xs text-gray-900 truncate flex-1">
                      {friend.name}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground truncate leading-tight mb-1">
                    {friend.reason || (friend.shared_event_artist ? `Interested in ${friend.shared_event_artist}` : 'Friend')}
                  </p>
                  {friend.shared_event_artist && (
                    <p className="text-xs text-green-700 truncate leading-tight mb-2">
                      {friend.shared_event_artist}
                    </p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-1 text-xs h-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartChat();
                    }}
                  >
                    <MessageCircle className="h-3 w-3 mr-1" />
                    Start Chat
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Connection discovery */}
        <section className="glass-card inner-glow rounded-3xl border border-white/60 bg-white/70 p-6 shadow-xl">
          <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              {renderUserSearchBar()}
              <PageActions
                currentUserId={currentUserId}
                onNavigateToNotifications={onNavigateToNotifications}
                onNavigateToChat={onNavigateToChat}
                className="flex-shrink-0"
              />
            </div>

            {connectionInterests.length > 0 && (
              <div className="mb-2">
                <div className="mb-4">
                  <h2 className="text-2xl font-bold text-foreground flex items-center gap-3 mb-2">
                    <Sparkles className="w-6 h-6 text-green-500" />
                    Friends Interested in Same Events
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    Start a conversation with friends going to the same events
                  </p>
                </div>
                {renderInterestsSection()}
              </div>
            )}

            <div className="max-h-[calc(100vh-250px)] overflow-y-auto pr-2">
              <div className="space-y-6">
                {renderReviewsSection()}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Review Detail Modal - Enhanced with all review information */}
      {showReviewDetailModal && selectedReviewDetail && (
        <Dialog 
          open={showReviewDetailModal} 
          onOpenChange={(open) => {
            setShowReviewDetailModal(open);
            if (!open) {
              setSelectedReviewDetail(null);
              setReviewDetailData(null);
              setReviewAuthorConnection(null);
              setLoadingReviewDetails(false);
            }
          }}
        >
          <DialogContent className="max-w-6xl w-[95vw] h-[95vh] max-h-[95vh] p-0 overflow-hidden flex flex-col" hideCloseButton>
            <DialogTitle className="sr-only">Review Details</DialogTitle>
            <DialogDescription className="sr-only">Review details for {selectedReviewDetail.event_info?.artist_name || 'artist'}</DialogDescription>
            
            {/* Header with connection info and add friend button */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={selectedReviewDetail.author?.avatar_url || undefined} />
                  <AvatarFallback className="bg-gradient-to-br from-pink-500 to-purple-600 text-white">
                    {selectedReviewDetail.author?.name?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{selectedReviewDetail.author?.name || 'User'}</span>
                    {reviewAuthorConnection && reviewAuthorConnection.degree > 0 && (
                      <Badge 
                        variant="secondary" 
                        className={`text-xs ${
                          reviewAuthorConnection.color === 'dark-green' ? 'bg-green-100 text-green-700 border-green-200' :
                          reviewAuthorConnection.color === 'light-green' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                          reviewAuthorConnection.color === 'yellow' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                          'bg-gray-100 text-gray-700 border-gray-200'
                        }`}
                      >
                        {reviewAuthorConnection.label}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(selectedReviewDetail.created_at).toLocaleDateString('en-US', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {reviewAuthorConnection && reviewAuthorConnection.degree > 1 && selectedReviewDetail.author?.id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                    onClick={async () => {
                      if (!selectedReviewDetail.author?.id || sendingFriendRequest) return;
                      try {
                        setSendingFriendRequest(true);
                        const { error } = await supabase.rpc('create_friend_request', {
                          receiver_user_id: selectedReviewDetail.author.id
                        });
                        
                        if (error) throw error;
                        
                        toast({
                          title: "Friend Request Sent! 🎉",
                          description: "Your friend request has been sent.",
                        });
                        
                        // Update connection to show pending status
                        setReviewAuthorConnection({
                          ...reviewAuthorConnection,
                          label: 'Request Sent',
                          color: 'blue'
                        });
                      } catch (error: any) {
                        console.error('Error sending friend request:', error);
                        toast({
                          title: "Error",
                          description: error.message || "Failed to send friend request. Please try again.",
                          variant: "destructive",
                        });
                      } finally {
                        setSendingFriendRequest(false);
                      }
                    }}
                    disabled={sendingFriendRequest}
                  >
                    {sendingFriendRequest ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4" />
                        Add Friend
                      </>
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setShowReviewDetailModal(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Left side - Hero Image */}
              <div className="flex-1 bg-black flex items-center justify-center min-h-0 relative">
                {(reviewDetailData?.photos && reviewDetailData.photos.length > 0) || (selectedReviewDetail.photos && selectedReviewDetail.photos.length > 0) ? (
                  <img 
                    src={reviewDetailData?.photos[0] || selectedReviewDetail.photos?.[0]} 
                    alt="Review photo"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <div className="text-center text-white">
                    <div className="text-6xl font-bold mb-4">
                      <span className="text-pink-500">S</span>ynth
                    </div>
                    <div className="w-32 h-0.5 bg-white mx-auto mb-4"></div>
                    <div className="text-sm opacity-80">Concert Review</div>
                  </div>
                )}
                {reviewDetailData?.reactionEmoji && (
                  <div className="absolute top-4 right-4 text-4xl bg-white/20 backdrop-blur-sm rounded-full w-16 h-16 flex items-center justify-center">
                    {reviewDetailData.reactionEmoji}
                  </div>
                )}
              </div>
              
              {/* Right side - Content */}
              <div className="flex-1 flex flex-col bg-white overflow-y-auto">
                {loadingReviewDetails ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Loading review details...</p>
                    </div>
                  </div>
                ) : (
                <div className="p-6 space-y-6">
                  {/* Event Info */}
                  <div>
                    <h2 className="text-2xl font-bold mb-2">
                      {selectedReviewDetail.event_info?.event_name || selectedReviewDetail.title || 'Concert Review'}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 mb-3">
                      {selectedReviewDetail.event_info?.artist_name && (
                        <Badge variant="secondary" className="cursor-pointer hover:bg-indigo-100">
                          {selectedReviewDetail.event_info.artist_name}
                        </Badge>
                      )}
                      {selectedReviewDetail.event_info?.event_date && (
                        <span>• {new Date(selectedReviewDetail.event_info.event_date).toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}</span>
                      )}
                    </div>
                    {selectedReviewDetail.event_info?.venue_name && (
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <MapPin className="w-4 h-4" />
                        <span>{selectedReviewDetail.event_info.venue_name}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Overall Rating */}
                  {selectedReviewDetail.rating && (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }, (_, i) => {
                          const starValue = i + 1;
                          const rating = selectedReviewDetail.rating || 0;
                          const isFull = starValue <= Math.floor(rating);
                          const isHalf = !isFull && starValue - 0.5 <= rating;
                          return (
                            <div key={i} className="relative w-6 h-6">
                              <Star className="w-6 h-6 text-gray-300" />
                              {(isHalf || isFull) && (
                                <div className={`absolute left-0 top-0 h-full overflow-hidden pointer-events-none ${isFull ? 'w-full' : 'w-1/2'}`}>
                                  <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <span className="text-lg font-semibold">{selectedReviewDetail.rating}/5</span>
                    </div>
                  )}

                  {/* Category Ratings */}
                  {reviewDetailData?.categoryRatings && Object.values(reviewDetailData.categoryRatings).some(r => typeof r === 'number') && (
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <h3 className="font-semibold mb-3 text-sm text-gray-700">Category Ratings</h3>
                      <div className="space-y-4">
                        {[
                          { key: 'performance', label: 'Performance', textKey: 'performance' },
                          { key: 'venue', label: 'Venue', textKey: 'venue' },
                          { key: 'overallExperience', label: 'Overall Experience', textKey: 'overallExperience' }
                        ].map(({ key, label, textKey }) => {
                          const value = (reviewDetailData.categoryRatings as any)[key];
                          const text = (reviewDetailData.categoryTexts as any)?.[textKey];
                          if (typeof value !== 'number' || isNaN(value)) return null;
                          return (
                            <div key={key} className="bg-white rounded-lg p-3 border border-gray-200">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-semibold text-gray-700">{label}</span>
                                <div className="flex items-center gap-1">
                                  {Array.from({ length: 5 }, (_, i) => {
                                    const starValue = i + 1;
                                    const isFull = starValue <= Math.floor(value);
                                    const isHalf = !isFull && starValue - 0.5 <= value;
                                    return (
                                      <div key={i} className="relative w-4 h-4">
                                        <Star className="w-4 h-4 text-gray-300" />
                                        {(isHalf || isFull) && (
                                          <div className={`absolute left-0 top-0 h-full overflow-hidden pointer-events-none ${isFull ? 'w-full' : 'w-1/2'}`}>
                                            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                  <span className="text-xs font-medium ml-1">{value.toFixed(1)}</span>
                                </div>
                              </div>
                              {text && (
                                <p className="text-sm text-gray-600 mt-2 leading-relaxed">{text}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  {(reviewDetailData?.moodTags?.length || reviewDetailData?.genreTags?.length || reviewDetailData?.contextTags?.length || reviewDetailData?.venueTags?.length || reviewDetailData?.artistTags?.length) && (
                    <div className="space-y-3">
                      {reviewDetailData.moodTags && reviewDetailData.moodTags.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Mood</h4>
                          <div className="flex flex-wrap gap-2">
                            {reviewDetailData.moodTags.map((tag, idx) => (
                              <Badge key={idx} variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {reviewDetailData.genreTags && reviewDetailData.genreTags.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Genre</h4>
                          <div className="flex flex-wrap gap-2">
                            {reviewDetailData.genreTags.map((tag, idx) => (
                              <Badge key={idx} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {reviewDetailData.contextTags && reviewDetailData.contextTags.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Context</h4>
                          <div className="flex flex-wrap gap-2">
                            {reviewDetailData.contextTags.map((tag, idx) => (
                              <Badge key={idx} variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {reviewDetailData.venueTags && reviewDetailData.venueTags.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Venue Tags</h4>
                          <div className="flex flex-wrap gap-2">
                            {reviewDetailData.venueTags.map((tag, idx) => (
                              <Badge key={idx} variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {reviewDetailData.artistTags && reviewDetailData.artistTags.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Artist Tags</h4>
                          <div className="flex flex-wrap gap-2">
                            {reviewDetailData.artistTags.map((tag, idx) => (
                              <Badge key={idx} variant="outline" className="bg-pink-50 text-pink-700 border-pink-200">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Review Text */}
                  {selectedReviewDetail.content && (
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <h3 className="font-semibold mb-2 text-gray-900">Review</h3>
                      <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {selectedReviewDetail.content}
                      </p>
                    </div>
                  )}

                  {/* Media Gallery */}
                  {((reviewDetailData?.photos && reviewDetailData.photos.length > 1) || (reviewDetailData?.videos && reviewDetailData.videos.length > 0) || 
                    (selectedReviewDetail.photos && selectedReviewDetail.photos.length > 1)) && (
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                        <Images className="w-4 h-4" />
                        <span>Media Gallery</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(reviewDetailData?.photos || selectedReviewDetail.photos || []).slice(1, 7).map((src, idx) => (
                          <div key={`p-${idx}`} className="aspect-square rounded-lg overflow-hidden bg-gray-200">
                            <img 
                              src={src} 
                              alt={`Review photo ${idx + 2}`} 
                              className="h-full w-full object-cover" 
                              loading="lazy" 
                            />
                          </div>
                        ))}
                        {(reviewDetailData?.videos || []).slice(0, 2).map((src, idx) => (
                          <div key={`v-${idx}`} className="aspect-square rounded-lg overflow-hidden bg-black relative">
                            <video src={src} className="h-full w-full object-cover" muted playsInline />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="bg-white/80 rounded-full p-2">
                                <Play className="w-4 h-4 text-black" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-6 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => {
                        const isLiked = likedReviews.has(selectedReviewDetail.id);
                        if (isLiked) {
                          setLikedReviews((prev) => {
                            const next = new Set(prev);
                            next.delete(selectedReviewDetail.id);
                            return next;
                          });
                        } else {
                          setLikedReviews((prev) => new Set([...prev, selectedReviewDetail.id]));
                        }
                      }}
                      className={`flex items-center gap-2 transition-colors ${
                        likedReviews.has(selectedReviewDetail.id) ? 'text-red-500' : 'text-gray-700 hover:text-red-500'
                      }`}
                    >
                      <Heart className={`w-5 h-5 ${likedReviews.has(selectedReviewDetail.id) ? 'fill-current' : ''}`} />
                      <span className="font-medium">{selectedReviewDetail.likes_count || 0}</span>
                    </button>
                    <button className="flex items-center gap-2 text-gray-700 hover:text-blue-500 transition-colors">
                      <MessageCircle className="w-5 h-5" />
                      <span className="font-medium">{selectedReviewDetail.comments_count || 0}</span>
                    </button>
                    <button className="flex items-center gap-2 text-gray-700 hover:text-green-500 transition-colors">
                      <Share2 className="w-5 h-5" />
                      <span className="font-medium">Share</span>
                    </button>
                  </div>
                </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

