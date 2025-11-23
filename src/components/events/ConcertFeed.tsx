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
  X,
  Plus,
  User
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { fetchUserNotifications } from '@/utils/notificationUtils';
import { format, parseISO } from 'date-fns';
import { MatchesView } from '@/components/MatchesView';
import { UnifiedChatView } from '@/components/UnifiedChatView';
import { ReviewService, PublicReviewWithProfile } from '@/services/reviewService';
import { EventReviewModal } from '@/components/EventReviewModal';
import { FriendProfileCard } from '@/components/FriendProfileCard';
import { Navigation } from '@/components/Navigation';
import { BelliStyleReviewCard } from '@/components/reviews/BelliStyleReviewCard';

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
  onViewChange?: (view: 'feed' | 'search' | 'profile') => void;
}

export const ConcertFeed = ({ currentUserId, onBack, onNavigateToChat, onNavigateToNotifications, onViewChange }: ConcertFeedProps) => {
  const [activeTab, setActiveTab] = useState('friends-recommended');
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<any[]>([]);
  const [showChatModal, setShowChatModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showFriendsChatModal, setShowFriendsChatModal] = useState(false);
  const [showChatView, setShowChatView] = useState(false);
  const [showUnifiedChat, setShowUnifiedChat] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const { toast } = useToast();
  const { sessionExpired } = useAuth();
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedReviewEvent, setSelectedReviewEvent] = useState<any>(null);
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<any>(null);

  useEffect(() => {
    // Don't fetch data if session is expired
    if (sessionExpired) {
      setLoading(false);
      return;
    }
    
    fetchFriends();
    fetchReviews();
    fetchNotifications();
  }, [currentUserId, activeTab, sessionExpired]);

  const fetchNotifications = async () => {
    try {
      // Check if session is expired before making any requests
      if (sessionExpired) {
        console.log('Session expired, skipping notifications fetch');
        return;
      }

      // Use the utility function to fetch and filter notifications
      const activeNotifications = await fetchUserNotifications(currentUserId, 20);
      setNotifications(activeNotifications);
    } catch (error) {
      console.warn('Warning: Error fetching notifications:', error);
      setNotifications([]);
    }
  };

  const fetchFriends = async () => {
    try {
      // Check if session is expired before making any requests
      if (sessionExpired) {
        console.log('Session expired, skipping friends fetch');
        return;
      }

      console.log('👥 Fetching friends for user:', currentUserId);
      
      // First, get the friendship records
      const { data: friendships, error: friendsError } = await supabase
        .from('friends')
        .select('id, user1_id, user2_id, created_at')
        .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
        .order('created_at', { ascending: false });

      console.log('👥 Friends query result:', { data: friendships, error: friendsError });

      if (friendsError) {
        console.warn('Warning: Could not fetch friends:', friendsError);
        setFriends([]);
        return;
      }

      if (!friendships || friendships.length === 0) {
        setFriends([]);
        return;
      }

      // Get all the user IDs we need to fetch
      const userIds = friendships.map(f => 
        f.user1_id === currentUserId ? f.user2_id : f.user1_id
      );

      // Fetch the profiles for those users
      const { data: profiles, error: profilesError } = await supabase
        .from('users')
        .select('id, user_id, name, avatar_url, bio')
        .in('user_id', userIds);

      if (profilesError) {
        console.warn('Warning: Could not fetch friend profiles:', profilesError);
        setFriends([]);
        return;
      }

      // Transform the data to get the other user's profile
      const friendsList = friendships.map(friendship => {
        const otherUserId = friendship.user1_id === currentUserId ? friendship.user2_id : friendship.user1_id;
        const profile = profiles?.find(p => p.user_id === otherUserId);
        
        return {
          id: profile?.id || otherUserId,
          user_id: otherUserId, // Add user_id for chat functionality
          name: profile?.name || 'Unknown User',
          username: (profile?.name || 'unknown').toLowerCase().replace(/\s+/g, ''),
          avatar_url: profile?.avatar_url || null,
          bio: profile?.bio || null,
          friendship_id: friendship.id,
          created_at: friendship.created_at
        };
      });

      console.log('👥 Processed friends list:', friendsList);
      setFriends(friendsList);
    } catch (error) {
      console.warn('Warning: Error fetching friends:', error);
      setFriends([]);
    }
  };

  const fetchReviews = async () => {
    try {
      // Check if session is expired before making any requests
      if (sessionExpired) {
        console.log('Session expired, skipping reviews fetch');
        setLoading(false);
        return;
      }

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
      console.log('🔍 ConcertFeed: Fetching reviews for user:', currentUserId);
      
      // Fetch user's own reviews from the database
      const result = await ReviewService.getUserReviewHistory(currentUserId);
      
      console.log('🔍 ConcertFeed: Raw review data:', result);
      
      // Transform to match the expected interface for display
      const transformedReviews = result.reviews.map((item: any) => ({
        id: item.review.id,
        rating: item.review.rating,
        review_text: item.review.review_text,
        created_at: item.review.created_at,
        is_public: item.review.is_public,
        event_title: item.event?.title || item.event?.event_name || 'Concert Review',
        venue_name: item.event?.venue_name || 'Unknown Venue',
        event_date: item.event?.event_date || item.review.created_at,
        artist_name: item.event?.artist_name || 'Unknown Artist',
        reviewer_name: 'You',
        reviewer_avatar: null,
        likes_count: item.review.likes_count || 0,
        comments_count: item.review.comments_count || 0,
        shares_count: item.review.shares_count || 0,
          is_liked: false
        }));
      
      console.log('🔍 ConcertFeed: Transformed reviews:', transformedReviews);
        setReviews(transformedReviews);
    } catch (error) {
      console.error('❌ ConcertFeed: Error fetching friends and recommended reviews:', error);
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
      // Fetch public reviews from the database using the new review service
      const result = await ReviewService.getPublicReviewsWithProfiles();
      setReviews(result.reviews);
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
        .from('users')
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
        .from('users')
        .select('name, user_id')
        .eq('user_id', userId)
        .single();

      const { data: senderData } = await supabase
        .from('users')
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

  const checkFriendRequestStatus = async (requestId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_relationships')
        .select('status')
        .eq('id', requestId)
        .eq('relationship_type', 'friend')
        .single();

      if (error) {
        console.log('🔍 Request not found:', error);
        return 'not_found';
      }

      return data?.status || 'unknown';
    } catch (error) {
      console.error('Error checking request status:', error);
      return 'error';
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

    // First check if the request is still valid
    const requestStatus = await checkFriendRequestStatus(requestId);
    console.log('🔍 Request status:', requestStatus);

    if (requestStatus === 'not_found' || requestStatus === 'accepted' || requestStatus === 'declined') {
      toast({
        title: "Request Already Processed",
        description: "This friend request has already been handled. Refreshing notifications...",
        variant: "destructive",
      });
      // Refresh notifications to remove the processed request
      fetchNotifications();
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

      // Remove the notification from UI immediately
      setNotifications(prev => prev.filter(n => (n.data as any)?.request_id !== requestId));
      
      // Refresh friends list
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
      console.log('🔍 Debug: Declining friend request with ID:', requestId);
      
      let actualRequestId = requestId;
      
      // If no request ID provided, try to find it from user_relationships table
      if (!actualRequestId) {
        console.log('🔍 Debug: No request ID provided, trying to find from user_relationships table');
        
        const { data: friendRequests, error: fetchError } = await supabase
          .from('user_relationships')
          .select('id')
          .eq('related_user_id', currentUserId)
          .eq('relationship_type', 'friend')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (fetchError) {
          console.error('Error fetching friend requests:', fetchError);
          throw new Error('Could not find friend request');
        }
        
        if (!friendRequests || friendRequests.length === 0) {
          throw new Error('No pending friend requests found');
        }
        
        actualRequestId = friendRequests[0].id;
        console.log('🔍 Debug: Found request ID from database:', actualRequestId);
      }
      
      const { error } = await supabase.rpc('decline_friend_request', {
        request_id: actualRequestId
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

      // Remove the notification from UI immediately
      setNotifications(prev => prev.filter(n => (n.data as any)?.request_id !== requestId));

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

  const getRatingText = (rating: number | 'good' | 'okay' | 'bad') => {
    if (typeof rating === 'number') {
      if (rating >= 4) return 'Good';
      if (rating >= 2) return 'Okay';
      return 'Bad';
    }
    switch (rating) {
      case 'good': return 'Good';
      case 'okay': return 'Okay';
      case 'bad': return 'Bad';
      default: return 'Unknown';
    }
  };

  const getRatingColor = (rating: number | 'good' | 'okay' | 'bad') => {
    if (typeof rating === 'number') {
      if (rating >= 4) return 'bg-green-100 text-green-800 border-green-200';
      if (rating >= 2) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      return 'bg-red-100 text-red-800 border-red-200';
    }
    switch (rating) {
      case 'good': return 'bg-green-100 text-green-800 border-green-200';
      case 'okay': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'bad': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getRatingIcon = (rating: number | 'good' | 'okay' | 'bad') => {
    if (typeof rating === 'number') {
      if (rating >= 4) return <ThumbsUp className="w-4 h-4" />;
      if (rating >= 2) return <Minus className="w-4 h-4" />;
      return <ThumbsDown className="w-4 h-4" />;
    }
    switch (rating) {
      case 'good': return <ThumbsUp className="w-4 h-4" />;
      case 'okay': return <Minus className="w-4 h-4" />;
      case 'bad': return <ThumbsDown className="w-4 h-4" />;
      default: return null;
    }
  };

  const handleAddReview = () => {
    // Create a mock event for the review modal
    const mockEvent = {
      id: 'new-review-' + Date.now(),
      title: 'New Concert Review',
      venue_name: '',
      event_date: new Date().toISOString().split('T')[0],
      description: 'Share your concert experience'
    };
    setSelectedReviewEvent(mockEvent as any);
    setShowReviewModal(true);
  };

  const handleReviewSubmitted = (review: any) => {
    // Refresh reviews after submission
    fetchReviews();
    setShowReviewModal(false);
    setSelectedReviewEvent(null);
  };

  const handleEditReview = (review: any) => {
    // Create a mock event for editing
    setSelectedReviewEvent({
      id: review.event_id || 'edit-review',
      event_title: review.event_title || 'Concert Review',
      venue_name: review.venue_name || 'Unknown Venue',
      event_date: review.event_date || review.created_at,
      artist_name: review.artist_name || 'Unknown Artist'
    });
    setShowReviewModal(true);
  };

  const handleDeleteReview = async (reviewId: string) => {
    try {
      await ReviewService.deleteEventReview(currentUserId, reviewId);
      fetchReviews(); // Refresh the list
      toast({
        title: "Review Deleted",
        description: "Your review has been deleted.",
      });
    } catch (error) {
      console.error('Error deleting review:', error);
      toast({
        title: "Error",
        description: "Failed to delete review. Please try again.",
        variant: "destructive",
      });
    }
  };

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => {
      const starValue = i + 1;
      const isFullStar = rating >= starValue;
      const isHalfStar = rating >= i + 0.5 && rating < starValue;
      
      return (
        <div key={i} className="relative">
          <Star
            className={`w-4 h-4 ${isFullStar ? 'text-yellow-400 fill-current' : 'text-gray-300'}`}
          />
          {isHalfStar && (
            <div className="absolute inset-0 overflow-hidden w-1/2">
              <Star className="w-4 h-4 text-yellow-400 fill-current" />
            </div>
          )}
        </div>
      );
    });
  };

  // Don't return early - render chat as overlay
  if (showChatView) {
    return <UnifiedChatView currentUserId={currentUserId} onBack={() => setShowChatView(false)} />;
  }

  // Session expiration is handled by MainApp, so we don't need to handle it here

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
              onClick={() => setShowUnifiedChat(true)}
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
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No Reviews Yet</h3>
                      <p className="text-gray-600 text-sm">Be the first to share a concert review!</p>
                      <Button
                        onClick={handleAddReview}
                        className="mt-4 bg-pink-500 hover:bg-pink-600 text-white"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Your First Review
                      </Button>
                    </div>
                  ) : (
                    reviews.map((review) => (
                      <BelliStyleReviewCard
                        key={review.id}
                        review={{
                          id: review.id,
                          user_id: review.reviewer_id || currentUserId,
                          event_id: review.event_id || '',
                          rating: review.rating,
                          review_text: review.review_text,
                          is_public: review.is_public,
                          created_at: review.created_at,
                          updated_at: review.created_at,
                          likes_count: review.likes_count || 0,
                          comments_count: review.comments_count || 0,
                          shares_count: review.shares_count || 0,
                          is_liked_by_user: false,
                          reaction_emoji: '',
                          photos: [],
                          videos: [],
                          mood_tags: [],
                          genre_tags: [],
                          context_tags: [],
                          artist_name: review.artist_name,
                          venue_name: review.venue_name
                        }}
                        currentUserId={currentUserId}
                        onEdit={handleEditReview}
                        onDelete={handleDeleteReview}
                        showEventInfo={true}
                        userProfile={{
                          name: review.reviewer_name || 'User',
                          avatar_url: review.reviewer_avatar,
                          verified: review.reviewer_verified,
                          account_type: review.reviewer_account_type
                        }}
                      />
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
                            <AvatarImage src={review.reviewer_avatar || undefined} />
                            <AvatarFallback className="text-xs">
                              {review.reviewer_name?.split(' ').map(n => n[0]).join('') || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h3 className="font-semibold text-sm text-gray-900">{review.reviewer_name || 'Anonymous'}</h3>
                            <p className="text-xs text-gray-500">Concert Review</p>
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
                          {review.event_title}
                        </h4>
                        <p className="text-sm text-gray-600 mb-2">
                          {review.venue_name} • {(() => {
                            try {
                              return format(parseISO(review.event_date), 'MMM d, yyyy');
                            } catch {
                              return review.event_date;
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
                            className={`flex items-center gap-1 text-xs ${(review as any).is_liked ? 'text-red-500' : 'text-gray-500'}`}
                          >
                            <Heart className={`w-3 h-3 ${(review as any).is_liked ? 'fill-current' : ''}`} />
                            {(review as any).likes_count}
                          </Button>
                          <Button variant="ghost" size="sm" className="flex items-center gap-1 text-xs text-gray-500">
                            <MessageCircle className="w-3 h-3" />
                            Comment
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleShare(review as any)}
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
                            <AvatarImage src={review.reviewer_avatar || undefined} />
                            <AvatarFallback className="text-xs">
                              {review.reviewer_name?.split(' ').map(n => n[0]).join('') || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h3 className="font-semibold text-sm text-gray-900">{review.reviewer_name || 'Anonymous'}</h3>
                            <p className="text-xs text-gray-500">Concert Review</p>
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
                          {review.event_title}
                        </h4>
                        <p className="text-sm text-gray-600 mb-2">
                          {review.venue_name} • {(() => {
                            try {
                              return format(parseISO(review.event_date), 'MMM d, yyyy');
                            } catch {
                              return review.event_date;
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
                            className={`flex items-center gap-1 text-xs ${(review as any).is_liked ? 'text-red-500' : 'text-gray-500'}`}
                          >
                            <Heart className={`w-3 h-3 ${(review as any).is_liked ? 'fill-current' : ''}`} />
                            {(review as any).likes_count}
                          </Button>
                          <Button variant="ghost" size="sm" className="flex items-center gap-1 text-xs text-gray-500">
                            <MessageCircle className="w-3 h-3" />
                            Comment
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleShare(review as any)}
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
          
          {/* Chat content - show friends and conversations */}
          <div className="p-4">
            {friends.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-semibold text-gray-900">Start a Conversation</h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {friends.map((friend) => (
                    <Card key={friend.id} className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <Avatar className="w-12 h-12">
                            <AvatarImage src={friend.avatar_url || undefined} />
                            <AvatarFallback>
                              {friend.name ? friend.name.split(' ').map(n => n[0]).join('') : 'F'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 truncate">{friend.name}</h3>
                            <p className="text-sm text-gray-600 truncate">@{friend.username}</p>
                          </div>
                        </div>
                        
                        {friend.bio && (
                          <p className="text-sm text-gray-700 mb-3 line-clamp-2">{friend.bio}</p>
                        )}
                        
                        <Button
                          className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                          onClick={() => {
                            console.log('Start chat with:', friend.name);
                            // TODO: Implement actual chat functionality
                            setShowChatModal(false);
                          }}
                        >
                          <MessageCircle className="w-4 h-4 mr-2" />
                          Start Chat
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
            <div className="text-center py-12">
              <MessageCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Friends Yet</h3>
                <p className="text-gray-600 mb-4">Add friends to start conversations!</p>
                <Button
                  onClick={() => {
                    setShowChatModal(false);
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
                id="user-search-input"
                name="userSearch"
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
                              console.log('🤝 Request ID from data:', (notification.data as any)?.request_id);
                              handleAcceptFriendRequest((notification.data as any)?.request_id);
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
                              console.log('🔍 Debug: Decline - Notification data:', notification.data);
                              console.log('🔍 Debug: Decline - Request ID from data:', (notification.data as any)?.request_id);
                              handleDeclineFriendRequest((notification.data as any)?.request_id);
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
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          // Start direct chat with this friend
                          console.log('Starting direct chat with:', friend.name);
                          try {
                            const { data: chatId, error } = await supabase.rpc('create_direct_chat', {
                              user1_id: currentUserId,
                              user2_id: friend.id
                            });

                            if (error) {
                              console.error('Error creating direct chat:', error);
                              toast({
                                title: "Error",
                                description: "Failed to create chat. Please try again.",
                                variant: "destructive",
                              });
                              return;
                            }

                            setShowFriendsChatModal(false);
                            setShowChatView(true);
                            
                            toast({
                              title: "Chat Created! 💬",
                              description: `You can now chat with ${friend.name}!`,
                            });
                          } catch (error) {
                            console.error('Error creating direct chat:', error);
                            toast({
                              title: "Error",
                              description: "Failed to create chat. Please try again.",
                              variant: "destructive",
                            });
                          }
                        }}
                        className="bg-blue-500 hover:bg-blue-600 text-white"
                      >
                        <MessageCircle className="w-4 h-4 mr-1" />
                        Chat
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          // Add to group selection
                          console.log('Adding to group selection:', friend.name);
                          setShowFriendsChatModal(false);
                          setShowChatView(true);
                          // TODO: Open group creation with this friend pre-selected
                        }}
                        className="border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        <Users className="w-4 h-4 mr-1" />
                        Group
                      </Button>
                    </div>
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

      {/* Full Page Chat */}
      {showUnifiedChat && (
        <UnifiedChatView 
          currentUserId={currentUserId} 
          onBack={() => setShowUnifiedChat(false)} 
        />
      )}

      {/* Bottom Navigation - Hide when chat is open */}
      {!showUnifiedChat && onViewChange && (
        <Navigation 
          currentView="feed" 
          onViewChange={onViewChange} 
        />
      )}

      {/* Review Modal */}
      <EventReviewModal
        event={selectedReviewEvent}
        userId={currentUserId}
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        onReviewSubmitted={handleReviewSubmitted}
      />

      {/* Friend Profile Card */}
      {selectedFriend && (
        <FriendProfileCard
          friend={selectedFriend}
          isOpen={showProfileCard}
          onClose={() => {
            setShowProfileCard(false);
            setSelectedFriend(null);
          }}
          onStartChat={(friendId) => {
            console.log('Start chat with friend:', friendId);
            // TODO: Implement chat functionality
          }}
        />
      )}
    </div>
  );
};
