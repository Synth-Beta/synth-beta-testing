import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit, Heart, MapPin, Calendar, Instagram, ExternalLink, Settings, Music, Plus, ThumbsUp, ThumbsDown, Minus, Star, Grid, BarChart3 } from 'lucide-react';
import { FollowersModal } from './FollowersModal';
import { PostsGrid } from './PostsGrid';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { JamBaseService } from '@/services/jambaseService';
import { EventReviewModal } from '../reviews/EventReviewModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProfileReviewCard } from '../reviews/ProfileReviewCard';
import type { Artist } from '@/types/concertSearch';
import { ReviewService } from '@/services/reviewService';
import { ReviewCard } from '../reviews/ReviewCard';
import { UnifiedStreamingStats, detectStreamingServiceType } from '../streaming/UnifiedStreamingStats';
import { JamBaseEventCard } from '@/components/events/JamBaseEventCard';
import { EventDetailsModal } from '../events/EventDetailsModal';
import { MusicTasteCard } from './MusicTasteCard';
import { HolisticStatsCard } from './HolisticStatsCard';
import { SynthSLogo } from '@/components/SynthSLogo';
import { SkeletonProfileCard } from '@/components/skeleton/SkeletonProfileCard';
import { SkeletonCard } from '@/components/SkeletonCard';

interface ProfileViewProps {
  currentUserId: string;
  profileUserId?: string; // Optional: if provided, show this user's profile instead of current user
  onBack: () => void;
  onEdit: () => void;
  onSettings: () => void;
  onSignOut?: () => void;
}

interface UserProfile {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  instagram_handle: string | null;
  music_streaming_profile?: string | null; // Optional until migration is applied
  created_at: string;
  updated_at: string;
}

interface UserEvent {
  id: string;
  title: string;
  artist_name: string;
  venue_name: string;
  venue_city: string;
  venue_state: string;
  event_date: string;
  doors_time?: string;
  created_at: string;
}

interface ConcertReview {
  id: string;
  user_id: string;
  event_id: string;
  rating: 'good' | 'okay' | 'bad';
  review_text: string | null;
  is_public: boolean;
  created_at: string;
  event: {
    event_name: string;
    location: string;
    event_date: string;
    event_time: string;
  };
}

export const ProfileView = ({ currentUserId, profileUserId, onBack, onEdit, onSettings, onSignOut }: ProfileViewProps) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userEvents, setUserEvents] = useState<UserEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddReview, setShowAddReview] = useState(false);
  const [reviews, setReviews] = useState<ConcertReview[]>([]);
  const [reviewModalEvent, setReviewModalEvent] = useState<any>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('posts');
  const [rankingMode, setRankingMode] = useState(false);
  const [canViewInterested, setCanViewInterested] = useState<boolean>(true);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [viewReviewOpen, setViewReviewOpen] = useState(false); // Only declare once
  const [selectedReview, setSelectedReview] = useState<any>(null);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [followersModalType, setFollowersModalType] = useState<'followers' | 'following' | 'friends'>('friends');
  const [friendStatus, setFriendStatus] = useState<'none' | 'friends' | 'pending_sent' | 'pending_received'>('none');
  const { toast } = useToast();
  const { user, sessionExpired } = useAuth();

  // Determine which user's profile to show
  const targetUserId = profileUserId || currentUserId;
  const isViewingOwnProfile = !profileUserId || profileUserId === currentUserId;

  useEffect(() => {
    // Don't fetch data if session is expired
    if (sessionExpired) {
      setLoading(false);
      return;
    }
    
    // Don't fetch if user is not available yet
    if (!user) {
      console.log('🔍 ProfileView: User not available yet, waiting...');
      return;
    }
    
    console.log('🔍 ProfileView: User is available, fetching data...');
    setLoading(true);
    console.log('🔍 ProfileView: Loading state set to TRUE');
    
    // Ensure we wait for both minimum time AND data fetching
    const fetchData = async () => {
      try {
        console.log('🔍 ProfileView: About to fetch profile...');
        await fetchProfile();
        await fetchUserEvents();
        await fetchReviews();
        await fetchFriends();
        if (!isViewingOwnProfile) {
          await checkFriendStatus();
        }
        console.log('🔍 ProfileView: All data fetched successfully');
      } catch (error) {
        console.error('🔍 ProfileView: Error fetching data:', error);
      }
    };

    const minTime = new Promise(resolve => setTimeout(resolve, 800));
    
    Promise.all([fetchData(), minTime]).finally(() => {
      setLoading(false);
      console.log('🔍 ProfileView: Loading state set to FALSE');
    });
  }, [targetUserId, sessionExpired, user]);

  useEffect(() => {
    // Check for hash in URL to determine active tab
    const hash = window.location.hash.substring(1);
    if (hash === 'spotify') {
      setActiveTab('spotify');
    }
  }, []);

  useEffect(() => {
    // Show by default; optionally restrict later based on friends
    if (!user) { setCanViewInterested(true); return; }
    if (user.id === currentUserId) { setCanViewInterested(true); return; }
    (async () => {
      try {
        const { data } = await supabase
          .from('friends')
          .select('id')
          .or(`and(user1_id.eq.${user.id},user2_id.eq.${currentUserId}),and(user1_id.eq.${currentUserId},user2_id.eq.${user.id}))`)
          .limit(1);
        setCanViewInterested(Array.isArray(data) ? data.length > 0 : false);
      } catch {
        setCanViewInterested(true);
      }
    })();
  }, [user, currentUserId]);

  const fetchProfile = async () => {
    try {
      console.log('🔍 ProfileView: Starting profile fetch...');
      console.log('🔍 ProfileView: sessionExpired:', sessionExpired);
      console.log('🔍 ProfileView: user:', user);
      console.log('🔍 ProfileView: currentUserId:', currentUserId);
      
      // Check if session is expired before making any requests
      if (sessionExpired || !user) {
        console.log('❌ Session expired or no user, skipping profile fetch');
        setLoading(false);
        return;
      }

      console.log('✅ Fetching profile for user:', targetUserId);
      
      // First try to get the profile
      console.log('ProfileView: Fetching profile for user:', targetUserId);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, name, avatar_url, bio, instagram_handle, music_streaming_profile, created_at, updated_at')
        .eq('user_id', targetUserId)
        .single();
      
      console.log('ProfileView: Profile query result:', { data, error });

      if (error) {
        console.error('Profile query error:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error details:', error.details);
        
        // Handle session/authentication errors
        if (error.message?.includes('invalid') || error.message?.includes('API key') || error.message?.includes('JWT') || error.message?.includes('expired')) {
          console.error('Session error in ProfileView:', error);
          toast({
            title: "Session Expired",
            description: "Your session has expired. Please sign in again.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
        
        // If no profile exists, create a default one
        if (error.code === 'PGRST116' || error.message?.includes('No rows found')) {
          console.log('No profile found for user:', currentUserId);
          
          console.log('Creating default profile for user:', currentUserId);
          
          // Get user metadata from auth
          const { data: { user } } = await supabase.auth.getUser();
          const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'New User';
          
          console.log('Creating profile with name:', userName);
          
          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert({
              user_id: currentUserId,
              name: userName,
              bio: 'Music lover looking to connect at events!',
              instagram_handle: null,
              music_streaming_profile: null
            })
            .select()
            .single();
          
          console.log('Profile creation result:', { newProfile, insertError });
          
          if (insertError) {
            console.error('Error creating profile:', insertError);
            console.error('Insert error details:', insertError.details);
            console.error('Insert error hint:', insertError.hint);
            
            // If we can't create a profile, show a fallback
            setProfile({
              id: 'temp',
              user_id: currentUserId,
              name: userName,
              avatar_url: null,
              bio: 'Music lover looking to connect at events!',
              instagram_handle: null,
              music_streaming_profile: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          } else {
            console.log('Profile created successfully:', newProfile);
            setProfile(newProfile);
          }
        } else {
          throw error;
        }
      } else {
        console.log('Profile found:', data);
        setProfile(data);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      // Show a fallback profile instead of error
        setProfile({
          id: 'temp',
          user_id: currentUserId,
          name: 'New User',
          avatar_url: null,
          bio: null,
          instagram_handle: null,
          music_streaming_profile: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
    } finally {
      setLoading(false);
    }
  };

  const fetchUserEvents = async () => {
    try {
      // Check if session is expired before making any requests
      if (sessionExpired || !user) {
        console.log('Session expired or no user, skipping user events fetch');
        return;
      }

      const data = await JamBaseService.getUserEvents(targetUserId);
      
      const events = data?.map(item => ({
        id: item.jambase_event.id,
        title: item.jambase_event.title,
        artist_name: item.jambase_event.artist_name,
        venue_name: item.jambase_event.venue_name,
        venue_city: item.jambase_event.venue_city,
        venue_state: item.jambase_event.venue_state,
        event_date: item.jambase_event.event_date,
        doors_time: item.jambase_event.doors_time,
        created_at: item.created_at
      })) || [];

      setUserEvents(events);
    } catch (error) {
      console.error('Error fetching user events:', error);
      setUserEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchReviews = async () => {
    try {
      // Check if session is expired before making any requests
      if (sessionExpired || !user) {
        console.log('Session expired or no user, skipping reviews fetch');
        return;
      }

      console.log('🔍 ProfileView: Fetching reviews for user:', targetUserId);
      
      // Fetch user's reviews from the database
      const result = await ReviewService.getUserReviewHistory(targetUserId);
      
      console.log('🔍 ProfileView: Raw review data:', result);
      
      // Transform to match the expected interface for display (include rank_order and category ratings for display)
      // Filter reviews based on privacy: show all reviews for own profile, only public reviews for others
      const transformedReviews = result.reviews
        .filter((item: any) => isViewingOwnProfile || item.review.is_public)
        .map((item: any) => ({
          id: item.review.id,
          user_id: item.review.user_id,
          event_id: item.review.event_id,
          rating: item.review.rating,
          rank_order: (item.review as any).rank_order,
          performance_rating: (item.review as any).performance_rating,
          venue_rating: (item.review as any).venue_rating_new ?? (item.review as any).venue_rating,
          overall_experience_rating: (item.review as any).overall_experience_rating,
          review_text: item.review.review_text,
          photos: item.review.photos || [],
          videos: item.review.videos || [],
          is_public: item.review.is_public,
          created_at: item.review.created_at,
          event: {
            event_name: item.event?.title || item.event?.event_name || 'Concert Review',
            location: item.event?.venue_name || 'Unknown Venue',
            event_date: item.event?.event_date || item.review.created_at,
            event_time: item.event?.event_time || 'TBD'
          }
        }));
      
      console.log('🔍 ProfileView: Transformed reviews:', transformedReviews);
      setReviews(transformedReviews);
    } catch (error) {
      console.error('❌ ProfileView: Error fetching reviews:', error);
      setReviews([]);
    }
  };

  // Compute display rating (0.5 increments) preferring category ratings when present
  const getDisplayRating = (r: any) => {
    const parts: number[] = [];
    if (typeof r.performance_rating === 'number' && r.performance_rating > 0) parts.push(r.performance_rating);
    if (typeof r.venue_rating === 'number' && r.venue_rating > 0) parts.push(r.venue_rating);
    if (typeof r.overall_experience_rating === 'number' && r.overall_experience_rating > 0) parts.push(r.overall_experience_rating);
    if (parts.length > 0) {
      const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
      return Math.round(avg * 2) / 2;
    }
    if (typeof r.rating === 'number') return Math.round(r.rating * 2) / 2;
    if (r.rating === 'good') return 5;
    if (r.rating === 'okay') return 3;
    if (r.rating === 'bad') return 1;
    return 0;
  };

  const fetchFriends = async () => {
    try {
      // Check if session is expired before making any requests
      if (sessionExpired || !user) {
        console.log('Session expired or no user, skipping friends fetch');
        return;
      }

      // First, get the friendship records
      const { data: friendships, error: friendsError } = await supabase
        .from('friends')
        .select('id, user1_id, user2_id, created_at')
        .or(`user1_id.eq.${targetUserId},user2_id.eq.${targetUserId}`)
        .order('created_at', { ascending: false });

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
        .from('profiles')
        .select('id, name, avatar_url, bio, user_id, created_at')
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

      setFriends(friendsList);
    } catch (error) {
      console.warn('Warning: Error fetching friends:', error);
      setFriends([]);
    }
  };

  const checkFriendStatus = async () => {
    try {
      if (sessionExpired || !user || isViewingOwnProfile) {
        return;
      }

      // Check if users are already friends
      const { data: friendship, error: friendsError } = await supabase
        .from('friends')
        .select('id')
        .or(`and(user1_id.eq.${currentUserId},user2_id.eq.${targetUserId}),and(user1_id.eq.${targetUserId},user2_id.eq.${currentUserId})`)
        .limit(1);

      if (friendsError) {
        console.warn('Warning: Could not check friendship status:', friendsError);
        return;
      }

      if (friendship && friendship.length > 0) {
        setFriendStatus('friends');
        return;
      }

      // Check for pending friend requests
      const { data: sentRequest, error: sentError } = await supabase
        .from('friend_requests')
        .select('id')
        .eq('sender_id', currentUserId)
        .eq('receiver_id', targetUserId)
        .eq('status', 'pending')
        .limit(1);

      if (sentError) {
        console.warn('Warning: Could not check sent friend requests:', sentError);
        return;
      }

      if (sentRequest && sentRequest.length > 0) {
        setFriendStatus('pending_sent');
        return;
      }

      const { data: receivedRequest, error: receivedError } = await supabase
        .from('friend_requests')
        .select('id')
        .eq('sender_id', targetUserId)
        .eq('receiver_id', currentUserId)
        .eq('status', 'pending')
        .limit(1);

      if (receivedError) {
        console.warn('Warning: Could not check received friend requests:', receivedError);
        return;
      }

      if (receivedRequest && receivedRequest.length > 0) {
        setFriendStatus('pending_received');
        return;
      }

      setFriendStatus('none');
    } catch (error) {
      console.warn('Warning: Error checking friend status:', error);
      setFriendStatus('none');
    }
  };

  const sendFriendRequest = async () => {
    try {
      if (sessionExpired || !user || isViewingOwnProfile) {
        return;
      }

      console.log('Sending friend request to:', targetUserId);
      
      // Call the database function to create friend request
      const { data, error } = await supabase.rpc('create_friend_request', {
        receiver_user_id: targetUserId
      });

      if (error) {
        console.error('Error creating friend request:', error);
        throw error;
      }

      setFriendStatus('pending_sent');
      
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

  const handleOpenReviewModal = () => {
    // Create a mock event for the review modal
    setReviewModalEvent({
      id: 'new-review',
      event_title: '',
      venue_name: '',
      event_date: new Date().toISOString().split('T')[0],
      artist_name: ''
    });
    setShowAddReview(true);
  };

  const handleReviewSubmitted = (review: any) => {
    // Refresh reviews after submission
    fetchReviews();
    setShowAddReview(false);
    setReviewModalEvent(null);
    
    toast({
      title: "Review Added",
      description: "Your concert review has been added!",
    });
  };

  const handleEditReview = (review: any) => {
    // Open edit with prefilled data for non-destructive updates
    setReviewModalEvent({
      id: review.event_id,
      title: review.event?.event_name || 'Concert Review',
      venue_name: review.event?.venue_name || review.event?.location || 'Unknown Venue',
      event_date: review.event?.event_date || review.created_at,
      artist_name: review.event?.artist_name || 'Unknown Artist',
      existing_review_id: review.id,
      // pass through existing ratings/texts where the form can read them from context if needed
      existing_review: {
        rating: review.rating,
        review_text: review.review_text,
        performance_rating: review.performance_rating,
        venue_rating: review.venue_rating,
        overall_experience_rating: review.overall_experience_rating,
        performance_review_text: review.performance_review_text,
        venue_review_text: review.venue_review_text,
        overall_experience_review_text: review.overall_experience_review_text,
        reaction_emoji: review.reaction_emoji,
        is_public: review.is_public,
        review_type: review.review_type,
        event_date: review.event?.event_date || review.created_at,
        artist_name: review.event?.artist_name,
        venue_name: review.event?.venue_name,
        venue_id: review.venue_id
      }
    });
    setShowAddReview(true);
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

  // Session expiration is handled by MainApp, so we don't need to handle it here

  if (loading) {
    return (
      <div className="min-h-screen synth-gradient-card p-4 pb-20">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header skeleton */}
          <div className="flex items-center gap-4 mb-6">
            <SynthSLogo size="md" className="animate-breathe" />
            <div className="h-8 bg-gradient-to-r from-pink-100 to-white rounded animate-pulse w-24"></div>
          </div>

          {/* Profile skeleton */}
          <SkeletonProfileCard />

          {/* Reviews grid skeleton */}
          <div className="space-y-4">
            <div className="h-6 bg-gradient-to-r from-pink-100 to-white rounded animate-pulse w-32"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    console.log('❌ ProfileView: No profile data available');
    console.log('❌ ProfileView: Loading state:', loading);
    console.log('❌ ProfileView: Current user ID:', currentUserId);
    console.log('❌ ProfileView: User from auth:', user);
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-4">Profile not found</h2>
          <p className="text-muted-foreground mb-4">Unable to load profile data. Please try again.</p>
          <div className="text-xs text-muted-foreground mb-4">
            Debug: User ID: {currentUserId}, Loading: {loading.toString()}
          </div>
          <Button onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
      </div>
    );
  }

  console.log('✅ ProfileView: Rendering profile for:', profile.name);


  // setViewReviewOpen is defined by useState earlier

  return (
    <div className="min-h-screen p-4 pb-48">
      <div className="max-w-2xl mx-auto">

        {/* Instagram-style Profile Header */}
        <div className="mb-6">
          {/* Profile Info Row */}
          <div className="flex items-start gap-6 mb-6">
            {/* Profile Picture */}
            <Avatar className="w-20 h-20 md:w-24 md:h-24">
                <AvatarImage src={profile.avatar_url || undefined} />
                <AvatarFallback className="text-2xl">
                  {profile.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              
            {/* Profile Stats and Actions */}
            <div className="flex-1">
              {/* Compact counts row above name */}
              <div className="flex items-center gap-6 mb-2">
              <div className="text-center">
                <span className="font-semibold">{reviews.length}</span>
                <p className="text-sm text-muted-foreground">reviews</p>
              </div>
              <button
                className="text-center hover:opacity-70 transition-opacity"
                onClick={() => { setFollowersModalType('friends'); setShowFollowersModal(true); }}
              >
                <span className="font-semibold">{friends.length}</span>
                <p className="text-sm text-muted-foreground">friends</p>
              </button>
              </div>
              
              <div className="flex items-center gap-4 mb-3">
                <h2 className="text-xl font-semibold">{profile.name}</h2>
                {isViewingOwnProfile ? (
                  <>
                    <Button onClick={onEdit} variant="outline" size="sm">Edit profile</Button>
                    <Button onClick={onSettings} variant="ghost" size="sm"><Settings className="w-4 h-4" /></Button>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    {friendStatus === 'none' && (
                      <Button onClick={sendFriendRequest} variant="default" size="sm">
                        <Plus className="w-4 h-4 mr-1" />
                        Add Friend
                      </Button>
                    )}
                    {friendStatus === 'pending_sent' && (
                      <Button disabled variant="outline" size="sm">
                        Friend Request Sent
                      </Button>
                    )}
                    {friendStatus === 'pending_received' && (
                      <Button disabled variant="outline" size="sm">
                        Respond to Request
                      </Button>
                    )}
                    {friendStatus === 'friends' && (
                      <Button disabled variant="outline" size="sm">
                        Friends
                      </Button>
                    )}
                  </div>
                )}
            </div>
            </div>
          </div>
          
          {/* Bio and Links */}
          <div className="mb-4">
              {profile.bio && (
              <p className="text-sm mb-3">{profile.bio}</p>
              )}

              {/* Social Media Links */}
              {(profile.instagram_handle || profile.music_streaming_profile) && (
              <div className="flex flex-col gap-1">
                  {profile.instagram_handle && (
                    <a
                      href={`https://instagram.com/${profile.instagram_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    className="flex items-center gap-2 text-pink-600 hover:text-pink-700 transition-colors text-sm"
                    >
                      <Instagram className="w-4 h-4" />
                    <span>@{profile.instagram_handle}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                {profile.music_streaming_profile && (() => {
                  const serviceType = detectStreamingServiceType(profile.music_streaming_profile);
                  const isSpotify = serviceType === 'spotify';
                  const isAppleMusic = serviceType === 'apple-music';
                  
                  let href = profile.music_streaming_profile;
                  let displayText = profile.music_streaming_profile;
                  let colorClass = 'text-blue-600 hover:text-blue-700';
                  
                  if (isSpotify) {
                    href = profile.music_streaming_profile.startsWith('http') 
                      ? profile.music_streaming_profile 
                      : `https://open.spotify.com/user/${profile.music_streaming_profile}`;
                    displayText = 'Spotify Profile';
                    colorClass = 'text-green-600 hover:text-green-700';
                  } else if (isAppleMusic) {
                    href = profile.music_streaming_profile.startsWith('http') 
                      ? profile.music_streaming_profile 
                      : profile.music_streaming_profile;
                    displayText = 'Apple Music Profile';
                    colorClass = 'text-red-500 hover:text-red-600';
                  } else if (profile.music_streaming_profile.startsWith('http')) {
                    displayText = 'Music Profile';
                  }
                  
                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-2 transition-colors text-sm ${colorClass}`}
                    >
                      <Music className="w-4 h-4" />
                      <span>{displayText}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  );
                })()}
                </div>
              )}
              </div>
            </div>

        {/* Instagram-style Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="posts" className="flex items-center gap-2">
              <Grid className="w-4 h-4" />
              Posts
            </TabsTrigger>
            {canViewInterested && (
              <TabsTrigger value="interested" className="flex items-center gap-2">
                <Heart className="w-4 h-4" />
                Interested Events
              </TabsTrigger>
            )}
            <TabsTrigger value="stats" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Streaming Stats
            </TabsTrigger>
          </TabsList>

          <TabsContent value="posts" className="mt-6 mb-40">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-muted-foreground">{isViewingOwnProfile ? 'Your Reviews' : 'Reviews'}</h3>
              {isViewingOwnProfile && (
                <Button variant={rankingMode ? 'default' : 'outline'} size="sm" onClick={() => setRankingMode(v => !v)}>
                  {rankingMode ? 'Done' : 'Ranking mode'}
                </Button>
              )}
            </div>

            {!rankingMode && (
            <PostsGrid 
              posts={[
                // Transform reviews into posts
                ...reviews.map((review) => ({
                  id: `review-${review.id}`,
                  type: 'review' as const,
                  image: Array.isArray((review as any)?.photos) && (review as any).photos.length > 0 ? (review as any).photos[0] : undefined,
                  images: Array.isArray((review as any)?.photos) ? (review as any).photos : [],
                  title: review.event?.event_name || 'Concert Review',
                  subtitle: `Posted by: ${profile?.name || 'User'}`,
                  rating: (() => {
                    // Prefer category average if present to preserve .5 increments
                    const parts: number[] = [];
                    const pr = (review as any).performance_rating;
                    const vr = (review as any).venue_rating;
                    const or = (review as any).overall_experience_rating;
                    if (typeof pr === 'number' && pr > 0) parts.push(pr);
                    if (typeof vr === 'number' && vr > 0) parts.push(vr);
                    if (typeof or === 'number' && or > 0) parts.push(or);
                    if (parts.length > 0) {
                      const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
                      return Math.round(avg * 2) / 2;
                    }
                    if (typeof review.rating === 'string') {
                      switch (review.rating) {
                        case 'good': return 5;
                        case 'okay': return 3;
                        case 'bad': return 1;
                        default: return 0;
                      }
                    }
                    return Math.round((review.rating || 0) * 2) / 2;
                  })(),
                  date: review.created_at,
                  likes: 0,
                  comments: 0,
                  badge: 'Review'
                }))
              ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())}
              onPostClick={(post) => {
                if (post.type === 'review') {
                  const reviewId = post.id.replace('review-', '');
                  const review = reviews.find(r => r.id === reviewId);
                  if (review) {
                    // Open view modal first (same cool card as feed)
                    setSelectedReview(review as any);
                    try { console.log('🔎 Opening review modal for', review.id); } catch {}
                    setViewReviewOpen(true);
                  }
                }
              }}
            />)}

            {rankingMode && isViewingOwnProfile && (
              <div className="space-y-6">
                {[5,4.5,4,3.5,3,2.5,2,1.5,1].map(ratingGroup => {
                  const group = reviews.filter(r => getDisplayRating(r) === ratingGroup);
                  if (group.length === 0) return null as any;
                  return (
                    <div key={ratingGroup}>
                      <div className="text-xs font-semibold text-muted-foreground mb-2">{ratingGroup}★</div>
                      <ul className="divide-y rounded-lg border bg-white">
                        {group
                          .sort((a, b) => {
                            const ao = (a as any).rank_order ?? 9999;
                            const bo = (b as any).rank_order ?? 9999;
                            if (ao !== bo) return ao - bo;
                            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                          })
                          .map((item, idx) => (
                          <li
                            key={item.id}
                            className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50"
                            onClick={() => { setSelectedReview(item as any); setViewReviewOpen(true); }}
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-6 w-6 rounded-full bg-gray-100 text-xs flex items-center justify-center border">{idx + 1}</div>
                              <div>
                                <div className="text-sm font-medium">{item.event.event_name}</div>
                                <div className="text-xs text-muted-foreground">{new Date(item.event.event_date).toLocaleDateString()}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {idx > 0 && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const arr = group.slice().sort((a,b)=>((a as any).rank_order||9999)-((b as any).rank_order||9999));
                                  const i = arr.findIndex(x => x.id === item.id);
                                  if (i > 0) {
                                    const [moved] = arr.splice(i,1);
                                    arr.splice(i-1,0,moved);
                                    (async () => {
                                      await ReviewService.setRankOrderForRatingGroup(currentUserId, ratingGroup, arr.map(x => x.id));
                                      fetchReviews();
                                    })();
                                  }
                                }}
                              >↑</Button>)}
                              {idx < group.length - 1 && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const arr = group.slice().sort((a,b)=>((a as any).rank_order||9999)-((b as any).rank_order||9999));
                                  const i = arr.findIndex(x => x.id === item.id);
                                  if (i !== -1 && i < arr.length - 1) {
                                    const [moved] = arr.splice(i,1);
                                    arr.splice(i+1,0,moved);
                                    (async () => {
                                      await ReviewService.setRankOrderForRatingGroup(currentUserId, ratingGroup, arr.map(x => x.id));
                                      fetchReviews();
                                    })();
                                  }
                                }}
                              >↓</Button>)}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
            
            {/* Floating Add Button - only show for own profile */}
            {!rankingMode && isViewingOwnProfile && (
            <div className="fixed bottom-20 right-4 z-10">
              <Button 
                onClick={handleOpenReviewModal} 
                size="lg"
                className="rounded-full h-14 w-14 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
              >
                <Plus className="w-6 h-6" />
              </Button>
            </div>)}
          </TabsContent>

            {canViewInterested && (
            <TabsContent value="interested" className="mt-6">
              {userEvents.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <Heart className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold">No Interested Events Yet</h3>
                  <p className="text-sm text-muted-foreground">Tap the heart on events to add them here.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1 md:gap-2">
                  {userEvents
                    .sort((a,b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
                    .slice(0, 9)
                    .map((ev) => (
                      <div
                        key={ev.id}
                        className="aspect-square cursor-pointer rounded-md overflow-hidden border bg-white hover:shadow-md transition-shadow"
                        onClick={() => { setSelectedEvent(ev as any); setDetailsOpen(true); }}
                      >
                        <div className="h-full flex flex-col">
                          <div className="h-2/3 w-full bg-gray-100">
                            <img
                              src={
                                (ev as any).artist_image_url ||
                                (ev as any).artist_image ||
                                (ev as any).image_url ||
                                (ev as any).image ||
                                '/placeholder.svg'
                              }
                              alt={ev.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <div className="p-2 flex-1 flex flex-col justify-between">
                            <div>
                              <h4 className="font-semibold text-xs truncate">{ev.title}</h4>
                              <p className="text-xs text-muted-foreground truncate">{ev.venue_name}</p>
                            </div>
                            <div className="text-[10px] text-muted-foreground flex items-center justify-between">
                              <span>{new Date(ev.event_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                              <span className="truncate">{[ev.venue_city, ev.venue_state].filter(Boolean).join(', ')}</span>
                            </div>
                          </div>

            {/* Music Taste Card (public, compact) */}
            <div className="mt-4">
              <MusicTasteCard userId={currentUserId} />
            </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </TabsContent>
          )}

          

          <TabsContent value="stats" className="mt-6">
            <UnifiedStreamingStats 
              musicStreamingProfile={profile.music_streaming_profile} 
              isViewingOtherProfile={!isViewingOwnProfile}
            />
          </TabsContent>

        </Tabs>
      </div>

      {/* Review Modal */}
      <EventReviewModal
        event={reviewModalEvent}
        userId={currentUserId}
        isOpen={showAddReview}
        onClose={() => {
          setShowAddReview(false);
          setReviewModalEvent(null);
        }}
        onReviewSubmitted={handleReviewSubmitted}
      />

      {/* Review View Dialog - same card as feed, opens from profile grid */}
      {viewReviewOpen && selectedReview && (
        <Dialog open={viewReviewOpen} onOpenChange={setViewReviewOpen}>
          <DialogContent className="max-w-2xl w-[95vw] h-[85dvh] max-h-[85dvh] md:max-h-[80vh] p-0 overflow-hidden flex flex-col" aria-describedby={undefined}>
            <DialogHeader className="px-4 py-3 border-b border-gray-200 bg-white sticky top-0 z-10">
              <DialogTitle>Review</DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
              <ProfileReviewCard
                title={selectedReview.event?.event_name || 'Concert Review'}
                rating={selectedReview.rating}
                reviewText={selectedReview.review_text}
                event={{
                  event_name: selectedReview.event?.event_name,
                  event_date: selectedReview.event?.event_date,
                  artist_name: selectedReview.event?.artist_name,
                  artist_id: null,
                  venue_name: selectedReview.event?.venue_name,
                  venue_id: selectedReview.event?.venue_id
                }}
                reviewId={selectedReview.id}
                currentUserId={currentUserId}
                initialIsLiked={Boolean(selectedReview.is_liked)}
                initialLikesCount={selectedReview.likes_count || 0}
                initialCommentsCount={selectedReview.comments_count || 0}
                onOpenArtist={(_id, _name) => {}}
                onOpenVenue={(_id, _name) => {}}
              />
              <div className="flex justify-end gap-2 pb-2">
                <Button variant="outline" onClick={() => setViewReviewOpen(false)}>Close</Button>
                {isViewingOwnProfile && selectedReview?.user_id === currentUserId && (
                  <Button onClick={() => { setViewReviewOpen(false); handleEditReview(selectedReview); }}>Edit</Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}


      {/* Friends Modal */}
      <FollowersModal
        isOpen={Boolean(showFollowersModal)}
        onClose={() => setShowFollowersModal(false)}
        type="friends"
        friends={Array.isArray(friends) ? friends : []}
        count={Array.isArray(friends) ? friends.length : 0}
        onStartChat={(friendId: string) => {
          // TODO: Implement chat functionality
          console.log('Start chat with friend:', friendId);
        }}
        onViewProfile={(friend) => {
          // Navigate to friend's profile using the same pattern as MainApp
          const event = new CustomEvent('open-user-profile', {
            detail: { userId: friend.user_id }
          });
          window.dispatchEvent(event);
          // Close the modal after navigation
          setShowFollowersModal(false);
        }}
      />

      {/* Event Details Modal - mount only when needed to avoid React static flag warning */}
      {detailsOpen && selectedEvent && (
      <EventDetailsModal
        event={selectedEvent}
        currentUserId={currentUserId}
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
      />
      )}
    </div>
  );
};
