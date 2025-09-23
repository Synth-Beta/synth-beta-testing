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
import { ConcertRanking } from './ConcertRanking';
import { JamBaseService } from '@/services/jambaseService';
import { EventReviewModal } from './EventReviewModal';
import { ReviewService } from '@/services/reviewService';
import { ReviewCard } from './ReviewCard';
import { FriendProfileCard } from './FriendProfileCard';
import { SpotifyStats } from './SpotifyStats';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { JamBaseEventCard } from '@/components/events/JamBaseEventCard';

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
  const [interestedEvents, setInterestedEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [followersModalType, setFollowersModalType] = useState<'followers' | 'following' | 'friends'>('friends');
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

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('user_jambase_events')
          .select(`
            jambase_event:jambase_events(
              id,
              title,
              artist_name,
              venue_name,
              venue_city,
              venue_state,
              event_date,
              doors_time,
              description,
              genres,
              price_range,
              ticket_available,
              ticket_urls
            )
          `)
          .eq('user_id', currentUserId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        const events = (data || []).map((item: any) => item.jambase_event).filter(Boolean);
        setInterestedEvents(events);
      } catch (e) {
        setInterestedEvents([]);
      }
    })();
  }, [currentUserId]);

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

      // Try RPC to avoid RLS recursion issues
      let events: any[] = [];
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('get_user_interested_events' as any, {
          target_user_id: currentUserId
        });
        if (!rpcErr && Array.isArray(rpcData)) {
          events = rpcData.map((e: any) => ({
            id: e.id,
            title: e.title,
            artist_name: e.artist_name,
            venue_name: e.venue_name,
            venue_city: e.venue_city,
            venue_state: e.venue_state,
            event_date: e.event_date,
            doors_time: e.doors_time,
            created_at: e.created_at || e.event_date
          }));
        }
      } catch {}

      if (events.length === 0) {
        // Fallback to direct join (may be blocked by RLS in some setups)
        const { data, error } = await supabase
          .from('user_jambase_events')
          .select(`
            created_at,
            jambase_event:jambase_events(
              id,
              title,
              artist_name,
              venue_name,
              venue_city,
              venue_state,
              event_date,
              doors_time,
              description,
              genres,
              price_range,
              ticket_available,
              ticket_urls
            )
          `)
          .eq('user_id', currentUserId)
          .order('created_at', { ascending: false });

        if (error) throw error;

        events = (data || []).map((item: any) => ({
          id: item.jambase_event.id,
          title: item.jambase_event.title,
          artist_name: item.jambase_event.artist_name,
          venue_name: item.jambase_event.venue_name,
          venue_city: item.jambase_event.venue_city,
          venue_state: item.jambase_event.venue_state,
          event_date: item.jambase_event.event_date,
          doors_time: item.jambase_event.doors_time,
          created_at: item.created_at
        }));
      }

      setUserEvents(events || []);
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
    <div className="min-h-screen p-4 pb-20">
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
                  <span className="font-semibold">{reviews.length}</span>
                  <p className="text-sm text-muted-foreground">reviews</p>
                </div>
                <button 
                  className="text-center hover:opacity-70 transition-opacity"
                  onClick={() => {
                    setFollowersModalType('friends');
                    setShowFollowersModal(true);
                  }}
                >
                  <span className="font-semibold">{friends.length}</span>
                  <p className="text-sm text-muted-foreground">friends</p>
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
                  {profile.music_streaming_profile && (
                    <a
                      href={profile.music_streaming_profile.startsWith('http') ? profile.music_streaming_profile : `https://open.spotify.com/user/${profile.music_streaming_profile}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    className="flex items-center gap-2 text-green-600 hover:text-green-700 transition-colors text-sm"
                    >
                      <Music className="w-4 h-4" />
                    <span>
                        {profile.music_streaming_profile.startsWith('http') 
                        ? (profile.music_streaming_profile.includes('spotify.com') ? 'Spotify Profile' : 'Music Profile')
                          : profile.music_streaming_profile
                        }
                      </span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
              </div>
            </div>

        {/* Instagram-style Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6 sticky top-0 z-10 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 rounded-lg">
            <TabsTrigger value="posts" className="flex items-center gap-2">
              <Grid className="w-4 h-4" />
              Posts
            </TabsTrigger>
            <TabsTrigger value="interested" className="flex items-center gap-2">
              <Heart className="w-4 h-4" />
              Interested Events
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Streaming Stats
            </TabsTrigger>
          </TabsList>

          <TabsContent value="posts" className="mt-6">
            <PostsGrid 
              posts={[
                // Transform reviews into posts
                ...reviews.map((review) => ({
                  id: `review-${review.id}`,
                  type: 'review' as const,
                  title: review.event?.event_name || 'Concert Review',
                  subtitle: review.event?.location || 'Unknown Venue',
                  rating: typeof review.rating === 'string' ? parseInt(review.rating) : review.rating,
                  date: review.created_at,
                  likes: 0,
                  comments: 0,
                  badge: 'Review'
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
            <div className="fixed bottom-24 right-4 z-10">
              <Button 
                onClick={handleOpenReviewModal} 
                size="lg"
                className="rounded-full h-14 w-14 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
              >
                <Plus className="w-6 h-6" />
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="interested" className="mt-6">
            {interestedEvents.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <Heart className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <h3 className="text-lg font-semibold">No Interested Events Yet</h3>
                <p className="text-sm text-muted-foreground">Tap the heart on events to add them here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {interestedEvents.map((ev) => (
                  <div key={ev.id} className="cursor-pointer" onClick={() => { setSelectedEvent(ev); setDetailsOpen(true); }}>
                    <JamBaseEventCard
                      event={ev}
                      onInterestToggle={undefined}
                      onReview={undefined}
                      isInterested={true}
                      showInterestButton={false}
                    />
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          

          <TabsContent value="stats" className="mt-6">
            <SpotifyStats />
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

      {/* Friends Modal */}
      <FollowersModal
        isOpen={showFollowersModal}
        onClose={() => setShowFollowersModal(false)}
        type="friends"
        friends={friends}
        count={friends.length}
        onStartChat={(friendId) => {
          console.log('Start chat with friend:', friendId);
        }}
        onViewProfile={(friend) => {
          setSelectedFriend(friend);
          setShowProfileCard(true);
        }}
      />

      {/* Event Details Modal */}
      <EventDetailsModal
        event={selectedEvent}
        currentUserId={currentUserId}
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
      />
    </div>
  );
};
