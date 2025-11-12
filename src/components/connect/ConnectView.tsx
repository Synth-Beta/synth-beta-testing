import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { FriendsReviewService } from '@/services/friendsReviewService';
import type { UnifiedFeedItem } from '@/services/unifiedFeedService';
import type { ReviewWithEngagement } from '@/services/reviewService';
import { ReviewCard } from '@/components/reviews/ReviewCard';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Users, MessageCircle, Sparkles, Calendar, MapPin, Bell, UserPlus, Star, Heart, Share2, Bookmark, Images, Play, X, UserCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';

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
};

interface ConnectViewProps {
  currentUserId: string;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (targetId: string) => void;
  onNavigateToNotifications?: () => void;
}

const CONNECTION_LABELS: Record<number, string> = {
  1: 'Friends',
  2: 'Friends of Friends',
  3: 'Extended Network',
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
  return { degree: 0, label: 'Community' };
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

  const [chatPreviews, setChatPreviews] = useState<ChatPreview[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
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
            firstIds,
            secondIds,
            thirdIds
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

        setChatPreviews((data || []) as ChatPreview[]);
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

  const recommendedConnections = useMemo(() => {
    const combined = [
      ...secondConnections.map((profile) => ({ ...profile, degree: 2 })),
      ...thirdConnections.map((profile) => ({ ...profile, degree: 3 })),
    ];

    return combined
      .sort(
        (a, b) =>
          (b.mutual_friends_count || 0) - (a.mutual_friends_count || 0)
      )
      .slice(0, 6);
  }, [secondConnections, thirdConnections]);

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
        {reviewItems.map((item) => {
          const review = transformFeedItemToReview(item, currentUserId);
          const isLiked = likedReviews.has(review.id) || review.is_liked_by_user || false;
          
          return (
            <ReviewCard
              key={item.id}
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
                // TODO: Call API to like/unlike review
              }}
              onComment={(reviewId) => {
                // TODO: Handle comment
                console.log('Comment on review:', reviewId);
              }}
              onShare={(reviewId) => {
                // TODO: Handle share
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

    return (
      <div className="grid gap-4 md:grid-cols-2">
        {connectionInterests.map((interest) => {
          const createdAtLabel = safeFormatDate(interest.createdAt);
          const eventDateLabel = safeFormatDate(interest.eventDate);
          return (
            <Card key={interest.id}>
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
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  const renderChatSection = () => {
    if (chatsLoading) {
      return (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-synth-pink" />
        </div>
      );
    }

    if (chatPreviews.length === 0) {
      return (
        <div className="text-center py-4">
          <MessageCircle className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground text-xs">
            No active chats
          </p>
        </div>
      );
    }

    const limitedChats = chatPreviews.slice(0, 2);

    return (
      <div className="space-y-1.5">
        {limitedChats.map((chat) => {
          const latestMessageTime = safeFormatDate(chat.latest_message_created_at, 'h:mm a');

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
            <Card key={chat.id} className="border cursor-pointer hover:bg-muted/50 transition-colors" onClick={openChat}>
              <CardContent className="p-2">
                <div className="min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="font-semibold text-xs text-gray-900 truncate">{chat.chat_name || 'Chat'}</p>
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
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
          {/* Left Column - Minimal sidebar for Chats and Recommended Users */}
          <div className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-3 pt-3">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5 text-purple-500" />
                  Chats
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-1.5">
                {renderChatSection()}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-3 pt-3">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-green-500" />
                  Suggested
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-1.5">
                {recommendedConnections.length === 0 ? (
                  <div className="text-center py-4">
                    <Users className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground" />
                    <p className="text-muted-foreground text-xs">
                      More coming soon.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {recommendedConnections.slice(0, 2).map((profile) => (
                      <Card key={profile.connected_user_id} className="border cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => onNavigateToProfile?.(profile.connected_user_id)}>
                        <CardContent className="p-2">
                          <div className="flex items-center gap-2">
                            <Avatar className="w-7 h-7">
                              <AvatarImage src={profile.avatar_url || undefined} />
                              <AvatarFallback className="text-xs">
                                {profile.name
                                  ? profile.name
                                      .split(' ')
                                      .map((part) => part[0])
                                      .join('')
                                      .slice(0, 2)
                                      .toUpperCase()
                                  : 'U'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-xs text-gray-900 truncate">
                                {profile.name || 'Connection'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {CONNECTION_LABELS[profile.degree as number] || 'Network'}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Prominent scrollable Network Reviews feed (Main Focus) */}
          <div>
            <div className="mb-4">
              <h2 className="text-3xl font-bold text-foreground flex items-center gap-3 mb-2">
                <Users className="w-7 h-7 text-indigo-500" />
                Network Reviews
              </h2>
              <p className="text-muted-foreground text-sm">
                See what your network is saying about concerts and events
              </p>
            </div>
            <div className="max-h-[calc(100vh-250px)] overflow-y-auto pr-2">
              <div className="space-y-6">
                {renderReviewsSection()}
              </div>
            </div>
          </div>
        </div>
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

