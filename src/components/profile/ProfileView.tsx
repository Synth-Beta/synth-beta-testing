import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit, Heart, MapPin, Calendar, Instagram, ExternalLink, Settings, Music, Plus, ThumbsUp, ThumbsDown, Minus, Star, Users, UserPlus, MessageCircle, User, Grid, BarChart3 } from 'lucide-react';
import { FollowersModal } from './FollowersModal';
import { PostsGrid } from './PostsGrid';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { ConcertRanking } from '../events/ConcertRanking';
import { JamBaseService } from '@/services/jambaseService';
import { EventReviewModal } from '../reviews/EventReviewModal';
import { ReviewService } from '@/services/reviewService';
import { ReviewCard } from '../reviews/ReviewCard';
import { FriendProfileCard } from './FriendProfileCard';
import { UnifiedStreamingStats, detectStreamingServiceType } from '../streaming/UnifiedStreamingStats';

interface ProfileViewProps {
  currentUserId: string;
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

export const ProfileView = ({ currentUserId, onBack, onEdit, onSettings, onSignOut }: ProfileViewProps) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userEvents, setUserEvents] = useState<UserEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConcertRankings, setShowConcertRankings] = useState(false);
  const [showAddReview, setShowAddReview] = useState(false);
  const [reviews, setReviews] = useState<ConcertReview[]>([]);
  const [reviewModalEvent, setReviewModalEvent] = useState<any>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('posts');
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [followersModalType, setFollowersModalType] = useState<'followers' | 'following'>('followers');
  const { toast } = useToast();
  const { user, sessionExpired } = useAuth();

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
    fetchProfile();
    fetchUserEvents();
    fetchReviews();
    fetchFriends();
  }, [currentUserId, sessionExpired, user]);

  useEffect(() => {
    // Check for hash in URL to determine active tab
    const hash = window.location.hash.substring(1);
    if (hash === 'spotify') {
      setActiveTab('spotify');
    }
  }, []);

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

      console.log('✅ Fetching profile for user:', currentUserId);
      
      // First try to get the profile
      console.log('ProfileView: Fetching profile for user:', currentUserId);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, name, avatar_url, bio, instagram_handle, music_streaming_profile, created_at, updated_at')
        .eq('user_id', currentUserId)
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

      const data = await JamBaseService.getUserEvents(currentUserId);
      
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

      console.log('🔍 ProfileView: Fetching reviews for user:', currentUserId);
      
      // Fetch user's reviews from the database
      const result = await ReviewService.getUserReviewHistory(currentUserId);
      
      console.log('🔍 ProfileView: Raw review data:', result);
      
      // Transform to match the expected interface for display
      const transformedReviews = result.reviews.map((item: any) => ({
        id: item.review.id,
        user_id: item.review.user_id,
        event_id: item.review.event_id,
        rating: item.review.rating,
        review_text: item.review.review_text,
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
        .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
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
    // Create a mock event for editing
    setReviewModalEvent({
      id: review.event_id,
      event_title: review.event?.event_name || 'Concert Review',
      venue_name: review.event?.location || 'Unknown Venue',
      event_date: review.event?.event_date || review.created_at,
      artist_name: 'Unknown Artist'
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading profile...</p>
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

  // Show concert rankings if requested
  if (showConcertRankings) {
    return (
      <ConcertRanking
        currentUserId={currentUserId}
        onBack={() => setShowConcertRankings(false)}
      />
    );
  }

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
              <div className="flex items-center gap-4 mb-4">
                <h2 className="text-xl font-semibold">{profile.name}</h2>
                <Button onClick={onEdit} variant="outline" size="sm">
                  Edit profile
                </Button>
                <Button onClick={onSettings} variant="ghost" size="sm">
                  <Settings className="w-4 h-4" />
                </Button>
              </div>
              
              {/* Stats Row */}
              <div className="flex gap-6 mb-4">
                <div className="text-center">
                  <span className="font-semibold">{userEvents.length + reviews.length}</span>
                  <p className="text-sm text-muted-foreground">posts</p>
                </div>
                <button 
                  className="text-center hover:opacity-70 transition-opacity"
                  onClick={() => {
                    setFollowersModalType('followers');
                    setShowFollowersModal(true);
                  }}
                >
                  <span className="font-semibold">{friends.length}</span>
                  <p className="text-sm text-muted-foreground">followers</p>
                </button>
                <button 
                  className="text-center hover:opacity-70 transition-opacity"
                  onClick={() => {
                    setFollowersModalType('following');
                    setShowFollowingModal(true);
                  }}
                >
                  <span className="font-semibold">{friends.length}</span>
                  <p className="text-sm text-muted-foreground">following</p>
                </button>
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
            <TabsTrigger value="friends" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Friends
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Streaming Stats
            </TabsTrigger>
          </TabsList>

          <TabsContent value="posts" className="mt-6 mb-40">
            <PostsGrid 
              posts={[
                // Transform reviews into posts
                ...reviews.map((review) => ({
                  id: `review-${review.id}`,
                  type: 'review' as const,
                  title: review.event?.event_name || 'Concert Review',
                  subtitle: review.event?.location || 'Unknown Venue',
                  rating: (() => {
                    if (typeof review.rating === 'string') {
                      switch (review.rating) {
                        case 'good': return 5;
                        case 'okay': return 3;
                        case 'bad': return 1;
                        default: return 0;
                      }
                    }
                    return review.rating || 0;
                  })(),
                  date: review.created_at,
                  likes: 0,
                  comments: 0,
                  badge: 'Review'
                })),
                // Transform events into posts
                ...userEvents.map((event) => ({
                  id: `event-${event.id}`,
                  type: 'event' as const,
                  title: event.title,
                  subtitle: event.artist_name,
                  date: event.event_date,
                  location: `${event.venue_name}, ${event.venue_city}`,
                  badge: 'Interested'
                }))
              ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())}
              onPostClick={(post) => {
                if (post.type === 'review') {
                  // Handle review click - could open review modal
                  const reviewId = post.id.replace('review-', '');
                  const review = reviews.find(r => r.id === reviewId);
                  if (review) {
                    handleEditReview(review);
                  }
                } else {
                  // Handle event click
                  console.log('Event clicked:', post);
                }
              }}
            />
            
            {/* Floating Add Button */}
            <div className="fixed bottom-20 right-4 z-10">
              <Button 
                onClick={handleOpenReviewModal} 
                size="lg"
                className="rounded-full h-14 w-14 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
              >
                <Plus className="w-6 h-6" />
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="friends" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  My Friends ({friends.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {friends.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                          
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => {
                                setSelectedFriend(friend);
                                setShowProfileCard(true);
                              }}
                            >
                              <User className="w-4 h-4 mr-1" />
                              Profile
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
                              onClick={() => {
                                console.log('Start chat with:', friend.name);
                                // TODO: Implement chat functionality
                              }}
                            >
                              <MessageCircle className="w-4 h-4 mr-1" />
                              Chat
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">No Friends Yet</h3>
                    <p className="text-gray-600 mb-4">Start connecting with other music lovers!</p>
                    <Button
                      onClick={() => {
                        // TODO: Navigate to find friends or show search
                        console.log('Find friends clicked');
                      }}
                      className="bg-blue-500 hover:bg-blue-600 text-white"
                    >
                      <UserPlus className="w-4 h-4 mr-2" />
                      Find Friends
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stats" className="mt-6">
            <UnifiedStreamingStats musicStreamingProfile={profile.music_streaming_profile} />
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

      {/* Followers/Following Modals */}
      <FollowersModal
        isOpen={showFollowersModal}
        onClose={() => setShowFollowersModal(false)}
        type="followers"
        friends={friends}
        count={friends.length}
        onStartChat={(friendId) => {
          console.log('Start chat with friend:', friendId);
          // TODO: Implement chat functionality
        }}
        onViewProfile={(friend) => {
          setSelectedFriend(friend);
          setShowProfileCard(true);
        }}
      />
      
      <FollowersModal
        isOpen={showFollowingModal}
        onClose={() => setShowFollowingModal(false)}
        type="following"
        friends={friends}
        count={friends.length}
        onStartChat={(friendId) => {
          console.log('Start chat with friend:', friendId);
          // TODO: Implement chat functionality
        }}
        onViewProfile={(friend) => {
          setSelectedFriend(friend);
          setShowProfileCard(true);
        }}
      />
    </div>
  );
};
