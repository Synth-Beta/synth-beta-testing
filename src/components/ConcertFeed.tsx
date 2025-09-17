import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Music, 
  Heart, 
  MessageCircle, 
  Share2, 
  ThumbsUp, 
  ThumbsDown, 
  Minus,
  Star,
  TrendingUp,
  Users,
  Globe,
  Search,
  UserPlus,
  Bell,
  X
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { MatchesView } from '@/components/MatchesView';
import { ChatView } from '@/components/ChatView';

interface ConcertReview {
  id: string;
  user_id: string;
  event_id: string;
  rating: 'good' | 'okay' | 'bad';
  review_text: string | null;
  is_public: boolean;
  created_at: string;
  likes_count: number;
  is_liked: boolean;
  event: {
    event_name: string;
    location: string;
    event_date: string;
    event_time: string;
  };
  user: {
    name: string;
    avatar_url: string | null;
    username: string;
  };
}

interface ConcertFeedProps {
  currentUserId: string;
  onBack: () => void;
  onNavigateToChat?: () => void;
  onNavigateToNotifications?: () => void;
}

export const ConcertFeed = ({ currentUserId, onBack, onNavigateToChat, onNavigateToNotifications }: ConcertFeedProps) => {
  const [activeTab, setActiveTab] = useState('friends-recommended');
  const [reviews, setReviews] = useState<ConcertReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<any[]>([]);
  const [showChatModal, setShowChatModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showFriendsChatModal, setShowFriendsChatModal] = useState(false);
  const [showChatView, setShowChatView] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchFriends();
    fetchReviews();
    fetchNotifications();
  }, [currentUserId, activeTab]);

  const fetchNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching notifications:', error);
        return;
      }

      console.log('🔔 Fetched notifications:', data);
      setNotifications(data || []);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const fetchFriends = async () => {
    try {
      // Fetch actual friends from database
      const { data, error } = await supabase
        .from('friends')
        .select(`
          id,
          user1_id,
          user2_id,
          created_at,
          user1:profiles!friends_user1_id_fkey(id, name, avatar_url, bio),
          user2:profiles!friends_user2_id_fkey(id, name, avatar_url, bio)
        `)
        .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching friends:', error);
        return;
      }

      // Transform the data to get the other user's profile
      const friendsList = (data || []).map(friendship => {
        const isUser1 = friendship.user1_id === currentUserId;
        const otherUser = isUser1 ? friendship.user2 : friendship.user1;
        return {
          id: otherUser.id,
          name: otherUser.name,
          username: otherUser.name.toLowerCase().replace(/\s+/g, ''),
          avatar_url: otherUser.avatar_url,
          bio: otherUser.bio,
          friendship_id: friendship.id,
          created_at: friendship.created_at
        };
      });

      setFriends(friendsList);
    } catch (error) {
      console.error('Error fetching friends:', error);
    }
  };

  const fetchReviews = async () => {
    try {
      setLoading(true);
      
      if (activeTab === 'friends-recommended') {
        await fetchFriendsAndRecommendedReviews();
      } else if (activeTab === 'news') {
        await fetchConcertNews();
      } else if (activeTab === 'public') {
        await fetchPublicReviews();
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFriendsAndRecommendedReviews = async () => {
    try {
      // For now, fetch user's own reviews and show them as feed content
      // In a real implementation, this would fetch friends' reviews from the database
      const storedReviews = localStorage.getItem(`concert_reviews_${currentUserId}`);
      if (storedReviews) {
        const userReviews = JSON.parse(storedReviews);
        // Transform to match the expected interface
        const transformedReviews = userReviews.map((review: any) => ({
          ...review,
          user: {
            name: 'You',
            avatar_url: null,
            username: 'you'
          },
          likes_count: Math.floor(Math.random() * 10),
          is_liked: false
        }));
        setReviews(transformedReviews);
      } else {
        setReviews([]);
      }
    } catch (error) {
      console.error('Error fetching friends and recommended reviews:', error);
      setReviews([]);
    }
  };

  const fetchConcertNews = async () => {
    try {
      // Fetch concert news
      // For now, return empty array - will be implemented with real data
      setReviews([]);
    } catch (error) {
      console.error('Error fetching concert news:', error);
      setReviews([]);
    }
  };

  const fetchPublicReviews = async () => {
    try {
      // Fetch all public reviews from localStorage
      // In a real implementation, this would fetch from the database
      const storedReviews = localStorage.getItem(`concert_reviews_${currentUserId}`);
      if (storedReviews) {
        const userReviews = JSON.parse(storedReviews);
        // Only show public reviews
        const publicReviews = userReviews
          .filter((review: any) => review.is_public)
          .map((review: any) => ({
            ...review,
            user: {
              name: 'You',
              avatar_url: null,
              username: 'you'
            },
            likes_count: Math.floor(Math.random() * 20),
            is_liked: false
          }));
        setReviews(publicReviews);
      } else {
        setReviews([]);
      }
    } catch (error) {
      console.error('Error fetching public reviews:', error);
      setReviews([]);
    }
  };


  const handleLike = async (reviewId: string) => {
    try {
      // Toggle like status
      setReviews(prevReviews => 
        prevReviews.map(review => 
          review.id === reviewId 
            ? { 
                ...review, 
                is_liked: !review.is_liked,
                likes_count: review.is_liked ? review.likes_count - 1 : review.likes_count + 1
              }
            : review
        )
      );
      
      toast({
        title: "Like Updated",
        description: "Your like has been updated!",
      });
    } catch (error) {
      console.error('Error liking review:', error);
    }
  };

  const handleShare = async (review: ConcertReview) => {
    try {
      // For now, just copy to clipboard
      const shareText = `Check out this concert review: ${review.event.event_name} by ${review.user.name}`;
      await navigator.clipboard.writeText(shareText);
      
      toast({
        title: "Shared!",
        description: "Review link copied to clipboard",
      });
    } catch (error) {
      console.error('Error sharing review:', error);
    }
  };

  const searchUsers = async (query: string) => {
    console.log('🔍 searchUsers called with query:', query);
    if (!query.trim()) {
      console.log('🔍 Empty query, clearing results');
      setSearchResults([]);
      return;
    }

    try {
      console.log('🔍 Starting user search...');
      setSearchLoading(true);
      
      // Search for users by name (profiles table doesn't have email or username columns)
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('name', `%${query}%`)
        .limit(10);

      console.log('🔍 Search results:', profiles);
      console.log('🔍 Search error:', error);

      if (error) {
        console.error('Error searching users:', error);
        toast({
          title: "Search Error",
          description: "Failed to search users. Please try again.",
          variant: "destructive",
        });
        return;
      }

      setSearchResults(profiles || []);
      console.log('🔍 Set search results:', profiles || []);
    } catch (error) {
      console.error('Error searching users:', error);
      toast({
        title: "Search Error",
        description: "Failed to search users. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSearchLoading(false);
    }
  };

  const handleUserSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    console.log('🔍 User search query:', query);
    setUserSearchQuery(query);
    searchUsers(query);
  };

  const sendFriendRequest = async (userId: string) => {
    try {
      console.log('Sending friend request to:', userId);
      
      // Call the database function to create friend request
      const { data, error } = await supabase.rpc('create_friend_request', {
        receiver_user_id: userId
      });

      if (error) {
        console.error('Error creating friend request:', error);
        throw error;
      }

      // Get user details for email notification
      const { data: receiverData } = await supabase
        .from('profiles')
        .select('name, user_id')
        .eq('user_id', userId)
        .single();

      const { data: senderData } = await supabase
        .from('profiles')
        .select('name')
        .eq('user_id', currentUserId)
        .single();

      // Send email notification (in background, don't wait for it)
      if (receiverData?.name && senderData?.name) {
        // Import and use EmailService
        import('@/services/emailService').then(({ EmailService }) => {
          // For now, we'll use a placeholder email since we can't access user emails from client
          // In production, you'd set up a server-side function to handle this
          console.log('Email notification would be sent to user:', userId);
          console.log('Sender:', senderData.name, 'Receiver:', receiverData.name);
        });
      }

      // Remove the user from search results to show the request was sent
      setSearchResults(prev => prev.filter(user => user.id !== userId));
      setUserSearchQuery(''); // Clear search

      toast({
        title: "Friend Request Sent! 🎉",
        description: "Your friend request has been sent and they'll be notified.",
      });
    } catch (error: any) {
      console.error('Error sending friend request:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send friend request. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleAcceptFriendRequest = async (requestId: string) => {
    console.log('🤝 Accepting friend request:', requestId);
    console.log('🤝 Request ID type:', typeof requestId);
    console.log('🤝 Request ID value:', JSON.stringify(requestId));
    
    if (!requestId) {
      toast({
        title: "Error",
        description: "Invalid friend request. Please refresh and try again.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Convert string to UUID if needed
      const uuidRequestId = typeof requestId === 'string' ? requestId : String(requestId);
      console.log('🤝 Converted request ID:', uuidRequestId);

      const { error } = await supabase.rpc('accept_friend_request', {
        request_id: uuidRequestId
      });

      console.log('🤝 Accept friend request result:', error);

      if (error) {
        console.error('Error accepting friend request:', error);
        
        // Handle specific error cases
        if (error.message.includes('not found') || error.message.includes('already processed')) {
          toast({
            title: "Request Already Processed",
            description: "This friend request has already been handled. Refreshing notifications...",
            variant: "destructive",
          });
          // Refresh notifications to remove the processed request
          fetchNotifications();
          return;
        }
        
        throw error;
      }

      // Refresh notifications and friends
      fetchNotifications();
      fetchFriends();

      toast({
        title: "Friend Request Accepted! 🎉",
        description: "You're now friends!",
      });
    } catch (error: any) {
      console.error('Error accepting friend request:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to accept friend request. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeclineFriendRequest = async (requestId: string) => {
    console.log('❌ Declining friend request:', requestId);
    
    if (!requestId) {
      toast({
        title: "Error",
        description: "Invalid friend request. Please refresh and try again.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase.rpc('decline_friend_request', {
        request_id: requestId
      });

      console.log('❌ Decline friend request result:', error);

      if (error) {
        console.error('Error declining friend request:', error);
        
        // Handle specific error cases
        if (error.message.includes('not found') || error.message.includes('already processed')) {
          toast({
            title: "Request Already Processed",
            description: "This friend request has already been handled. Refreshing notifications...",
            variant: "destructive",
          });
          // Refresh notifications to remove the processed request
          fetchNotifications();
          return;
        }
        
        throw error;
      }

      // Refresh notifications
      fetchNotifications();

      toast({
        title: "Friend Request Declined",
        description: "The friend request has been declined.",
      });
    } catch (error: any) {
      console.error('Error declining friend request:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to decline friend request. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getRatingText = (rating: 'good' | 'okay' | 'bad') => {
    switch (rating) {
      case 'good': return 'Good';
      case 'okay': return 'Okay';
      case 'bad': return 'Bad';
      default: return 'Unknown';
    }
  };

  const getRatingColor = (rating: 'good' | 'okay' | 'bad') => {
    switch (rating) {
      case 'good': return 'bg-green-100 text-green-800 border-green-200';
      case 'okay': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'bad': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getRatingIcon = (rating: 'good' | 'okay' | 'bad') => {
    switch (rating) {
      case 'good': return <ThumbsUp className="w-4 h-4" />;
      case 'okay': return <Minus className="w-4 h-4" />;
      case 'bad': return <ThumbsDown className="w-4 h-4" />;
      default: return null;
    }
  };

  if (showChatView) {
    return <ChatView currentUserId={currentUserId} onBack={() => setShowChatView(false)} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p>Loading concert feed...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Concert Feed</h1>
            <p className="text-gray-600 mt-2">Discover concerts and reviews from friends and the community</p>
          </div>
          
          {/* Right side icons */}
          <div className="flex items-center gap-3">
            {/* Notifications button */}
            <Button
              variant="outline"
              size="sm"
              className="relative p-2"
              onClick={() => setShowNotificationsModal(true)}
            >
              <Bell className="w-5 h-5" />
              {/* Notification badge */}
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {notifications.length}
              </span>
            </Button>
            
            {/* Chat button */}
            <Button
              variant="outline"
              size="sm"
              className="p-2"
              onClick={() => setShowChatView(true)}
            >
              <MessageCircle className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="friends-recommended" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Feed
            </TabsTrigger>
            <TabsTrigger value="news" className="flex items-center gap-2">
              <Music className="w-4 h-4" />
              News
            </TabsTrigger>
            <TabsTrigger value="public" className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Public
            </TabsTrigger>
          </TabsList>

          <TabsContent value="friends-recommended" className="mt-6">
            <div className="space-y-6">
              {/* Friends Reviews Section */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Users className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-semibold text-gray-900">Friends' Reviews</h2>
                </div>
                <div className="space-y-3">
                  {reviews.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 rounded-lg">
                      <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No Friends' Reviews Yet</h3>
                      <p className="text-gray-600 text-sm">Your friends haven't shared any concert reviews yet.</p>
                    </div>
                  ) : (
                    reviews.map((review) => (
                      <Card key={review.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Avatar className="w-8 h-8">
                                <AvatarImage src={review.user.avatar_url || undefined} />
                                <AvatarFallback className="text-xs">
                                  {review.user.name.split(' ').map(n => n[0]).join('')}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <h3 className="font-semibold text-sm text-gray-900">{review.user.name}</h3>
                                <p className="text-xs text-gray-500">@{review.user.username}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">
                                <Users className="w-3 h-3 mr-1" />
                                Friend
                              </Badge>
                              <Badge className={`${getRatingColor(review.rating)} border text-xs`}>
                                {getRatingIcon(review.rating)}
                                <span className="ml-1">{getRatingText(review.rating)}</span>
                              </Badge>
                            </div>
                          </div>

                          <div className="mb-3">
                            <h4 className="text-lg font-semibold text-gray-900 mb-1">
                              {review.event.event_name}
                            </h4>
                            <p className="text-sm text-gray-600 mb-2">
                              {review.event.location} • {(() => {
                                try {
                                  return format(parseISO(review.event.event_date), 'MMM d, yyyy');
                                } catch {
                                  return review.event.event_date;
                                }
                              })()}
                            </p>
                            {review.review_text && (
                              <p className="text-sm text-gray-700 leading-relaxed line-clamp-2">
                                {review.review_text}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleLike(review.id)}
                                className={`flex items-center gap-1 text-xs ${review.is_liked ? 'text-red-500' : 'text-gray-500'}`}
                              >
                                <Heart className={`w-3 h-3 ${review.is_liked ? 'fill-current' : ''}`} />
                                {review.likes_count}
                              </Button>
                              <Button variant="ghost" size="sm" className="flex items-center gap-1 text-xs text-gray-500">
                                <MessageCircle className="w-3 h-3" />
                                Comment
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleShare(review)}
                                className="flex items-center gap-1 text-xs text-gray-500"
                              >
                                <Share2 className="w-3 h-3" />
                                Share
                              </Button>
                            </div>
                            <span className="text-xs text-gray-500">
                              {(() => {
                                try {
                                  return format(parseISO(review.created_at), 'MMM d');
                                } catch {
                                  return review.created_at;
                                }
                              })()}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </div>

              {/* Recommended Reviews Section */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-5 h-5 text-purple-600" />
                  <h2 className="text-lg font-semibold text-gray-900">Recommended for You</h2>
                </div>
                <div className="space-y-3">
                  <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <Star className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No Recommendations Yet</h3>
                    <p className="text-gray-600 text-sm">We're working on personalized recommendations for you!</p>
                  </div>
                </div>
              </div>

            </div>
          </TabsContent>

          <TabsContent value="news" className="mt-6">
            <div className="space-y-3">
              {reviews.length === 0 ? (
                <div className="text-center py-12">
                  <Music className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No Concert News Yet</h3>
                  <p className="text-gray-600">Stay tuned for the latest concert news and updates!</p>
                </div>
              ) : (
                reviews.map((review) => (
                  <Card key={review.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={review.user.avatar_url || undefined} />
                            <AvatarFallback className="text-xs">
                              {review.user.name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h3 className="font-semibold text-sm text-gray-900">{review.user.name}</h3>
                            <p className="text-xs text-gray-500">@{review.user.username}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">
                            <Music className="w-3 h-3 mr-1" />
                            News
                          </Badge>
                          <Badge className={`${getRatingColor(review.rating)} border text-xs`}>
                            {getRatingIcon(review.rating)}
                            <span className="ml-1">{getRatingText(review.rating)}</span>
                          </Badge>
                        </div>
                      </div>

                      <div className="mb-3">
                        <h4 className="text-lg font-semibold text-gray-900 mb-1">
                          {review.event.event_name}
                        </h4>
                        <p className="text-sm text-gray-600 mb-2">
                          {review.event.location} • {(() => {
                            try {
                              return format(parseISO(review.event.event_date), 'MMM d, yyyy');
                            } catch {
                              return review.event.event_date;
                            }
                          })()}
                        </p>
                        {review.review_text && (
                          <p className="text-sm text-gray-700 leading-relaxed line-clamp-2">
                            {review.review_text}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleLike(review.id)}
                            className={`flex items-center gap-1 text-xs ${review.is_liked ? 'text-red-500' : 'text-gray-500'}`}
                          >
                            <Heart className={`w-3 h-3 ${review.is_liked ? 'fill-current' : ''}`} />
                            {review.likes_count}
                          </Button>
                          <Button variant="ghost" size="sm" className="flex items-center gap-1 text-xs text-gray-500">
                            <MessageCircle className="w-3 h-3" />
                            Comment
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleShare(review)}
                            className="flex items-center gap-1 text-xs text-gray-500"
                          >
                            <Share2 className="w-3 h-3" />
                            Share
                          </Button>
                        </div>
                            <span className="text-xs text-gray-500">
                              {(() => {
                                try {
                                  return format(parseISO(review.created_at), 'MMM d');
                                } catch {
                                  return review.created_at;
                                }
                              })()}
                            </span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="public" className="mt-6">
            <div className="space-y-3">
              {reviews.length === 0 ? (
                <div className="text-center py-12">
                  <Globe className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No Public Reviews Yet</h3>
                  <p className="text-gray-600">No public reviews have been shared yet.</p>
                </div>
              ) : (
                reviews.map((review) => (
                  <Card key={review.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={review.user.avatar_url || undefined} />
                            <AvatarFallback className="text-xs">
                              {review.user.name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h3 className="font-semibold text-sm text-gray-900">{review.user.name}</h3>
                            <p className="text-xs text-gray-500">@{review.user.username}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">
                            <Globe className="w-3 h-3 mr-1" />
                            Public
                          </Badge>
                          <Badge className={`${getRatingColor(review.rating)} border text-xs`}>
                            {getRatingIcon(review.rating)}
                            <span className="ml-1">{getRatingText(review.rating)}</span>
                          </Badge>
                        </div>
                      </div>

                      <div className="mb-3">
                        <h4 className="text-lg font-semibold text-gray-900 mb-1">
                          {review.event.event_name}
                        </h4>
                        <p className="text-sm text-gray-600 mb-2">
                          {review.event.location} • {(() => {
                            try {
                              return format(parseISO(review.event.event_date), 'MMM d, yyyy');
                            } catch {
                              return review.event.event_date;
                            }
                          })()}
                        </p>
                        {review.review_text && (
                          <p className="text-sm text-gray-700 leading-relaxed line-clamp-2">
                            {review.review_text}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleLike(review.id)}
                            className={`flex items-center gap-1 text-xs ${review.is_liked ? 'text-red-500' : 'text-gray-500'}`}
                          >
                            <Heart className={`w-3 h-3 ${review.is_liked ? 'fill-current' : ''}`} />
                            {review.likes_count}
                          </Button>
                          <Button variant="ghost" size="sm" className="flex items-center gap-1 text-xs text-gray-500">
                            <MessageCircle className="w-3 h-3" />
                            Comment
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleShare(review)}
                            className="flex items-center gap-1 text-xs text-gray-500"
                          >
                            <Share2 className="w-3 h-3" />
                            Share
                          </Button>
                        </div>
                            <span className="text-xs text-gray-500">
                              {(() => {
                                try {
                                  return format(parseISO(review.created_at), 'MMM d');
                                } catch {
                                  return review.created_at;
                                }
                              })()}
                            </span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

        </Tabs>
      </div>

      {/* Chat Modal - Full Page */}
      {showChatModal && (
        <div className="fixed inset-0 bg-background z-50">
          {/* Header with back button */}
          <div className="sticky top-0 z-40 bg-background border-b border-border p-4">
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                onClick={() => setShowChatModal(false)}
                className="flex items-center gap-2"
              >
                ← Back to Feed
              </Button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Your Chats</h1>
                <p className="text-sm text-gray-600">All your conversations</p>
              </div>
            </div>
          </div>
          
          {/* Chat content - just conversations, no requests */}
          <div className="p-4">
            <div className="text-center py-12">
              <MessageCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Conversations Yet</h3>
              <p className="text-gray-600">Start chatting with your matches!</p>
            </div>
          </div>
        </div>
      )}

      {/* Notifications Modal - Full Page */}
      {showNotificationsModal && (
        <div className="fixed inset-0 bg-background z-50">
          {/* Header with back button */}
          <div className="sticky top-0 z-40 bg-background border-b border-border p-4">
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                onClick={() => setShowNotificationsModal(false)}
                className="flex items-center gap-2"
              >
                ← Back to Feed
              </Button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Notifications & Search</h1>
                <p className="text-sm text-gray-600">Find users and see your matches</p>
              </div>
            </div>
          </div>
          
          {/* Combined Search and Notifications - One Page */}
          <div className="p-4 space-y-6">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by email or username..."
                value={userSearchQuery}
                onChange={handleUserSearch}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
              />
            </div>

            {/* Search Results - Above Notifications */}
            {searchLoading ? (
              <div className="text-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
                <p className="text-gray-600 mt-2 text-sm">Searching...</p>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="space-y-3">
                {searchResults.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback>
                          {user.name ? user.name.split(' ').map(n => n[0]).join('') : 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold text-gray-900">{user.name || 'Unknown User'}</h3>
                        <p className="text-sm text-gray-600">@{user.username || user.email}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => sendFriendRequest(user.id)}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1 text-sm"
                    >
                      <UserPlus className="w-4 h-4 mr-1" />
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            ) : userSearchQuery ? (
              <div className="text-center py-6 bg-gray-50 rounded-lg">
                <Search className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <h3 className="font-semibold text-gray-900 mb-1">No Users Found</h3>
                <p className="text-sm text-gray-600">Try searching with a different email or username</p>
              </div>
            ) : null}

            {/* Notifications Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Bell className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">Notifications ({notifications.length})</h2>
              </div>
              
              {notifications.length > 0 ? (
                <div className="space-y-3">
                  {notifications.map((notification) => (
                    <div key={notification.id} className={`flex items-center gap-3 p-3 border rounded-lg ${notification.is_read ? 'bg-gray-50 border-gray-200' : 'bg-blue-50 border-blue-200'}`}>
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <Bell className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{notification.title}</h3>
                        <p className="text-sm text-gray-600">{notification.message}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {(() => {
                            try {
                              return format(parseISO(notification.created_at), 'MMM d, h:mm a');
                            } catch {
                              return notification.created_at;
                            }
                          })()}
                        </p>
                      </div>
                      {notification.type === 'friend_request' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              console.log('🤝 Accept button clicked for notification:', notification);
                              console.log('🤝 Notification data:', notification.data);
                              console.log('🤝 Request ID from data:', notification.data?.request_id);
                              handleAcceptFriendRequest(notification.data?.request_id);
                            }}
                            className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 text-sm"
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              console.log('❌ Decline button clicked for notification:', notification);
                              handleDeclineFriendRequest(notification.data?.request_id);
                            }}
                            className="px-3 py-1 text-sm"
                          >
                            Decline
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 bg-gray-50 rounded-lg">
                  <Bell className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <h3 className="font-semibold text-gray-900 mb-1">No Notifications</h3>
                  <p className="text-sm text-gray-600">You'll see matches and friend requests here</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Friends Chat Modal - Full Page */}
      {showFriendsChatModal && (
        <div className="fixed inset-0 bg-background z-50">
          {/* Header with back button */}
          <div className="sticky top-0 z-40 bg-background border-b border-border p-4">
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                onClick={() => setShowFriendsChatModal(false)}
                className="flex items-center gap-2"
              >
                ← Back to Feed
              </Button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Chat with Friends</h1>
                <p className="text-sm text-gray-600">Start conversations with your friends</p>
              </div>
            </div>
          </div>
          
          {/* Friends List */}
          <div className="p-4">
            {friends.length > 0 ? (
              <div className="space-y-3">
                {friends.map((friend) => (
                  <div key={friend.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={friend.avatar_url || undefined} />
                        <AvatarFallback className="text-lg">
                          {friend.name ? friend.name.split(' ').map(n => n[0]).join('') : 'F'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold text-gray-900 text-lg">{friend.name}</h3>
                        {friend.bio && (
                          <p className="text-sm text-gray-600 line-clamp-2">{friend.bio}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          Friends since {(() => {
                            try {
                              return format(parseISO(friend.created_at), 'MMM d, yyyy');
                            } catch {
                              return friend.created_at;
                            }
                          })()}
                        </p>
                      </div>
                    </div>
                      <Button
                        size="lg"
                        onClick={() => {
                          // Navigate to chat with this friend
                          console.log('Starting chat with:', friend.name);
                          setShowFriendsChatModal(false);
                          setShowChatView(true);
                        }}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2"
                      >
                        <MessageCircle className="w-5 h-5 mr-2" />
                        Start Chat
                      </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <MessageCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Friends Yet</h3>
                <p className="text-gray-600 mb-4">Add some friends to start chatting!</p>
                <Button
                  onClick={() => {
                    setShowFriendsChatModal(false);
                    setShowNotificationsModal(true);
                  }}
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Find Friends
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
