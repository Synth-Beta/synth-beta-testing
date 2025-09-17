import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit, Heart, MapPin, Calendar, Instagram, ExternalLink, Settings, Music, Plus, ThumbsUp, ThumbsDown, Minus, Star, Users, UserPlus, MessageCircle, User } from 'lucide-react';
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
    <div className="min-h-screen p-4 pb-20">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Your Profile</h1>
            <p className="text-muted-foreground">Manage your profile and view your activity</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={onSettings} variant="ghost" size="icon">
              <Settings className="w-4 h-4" />
            </Button>
            <Button onClick={() => setShowConcertRankings(true)} variant="outline">
              <Music className="w-4 h-4 mr-2" />
              My Concerts
            </Button>
            <Button onClick={onEdit} variant="outline">
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
            {onSignOut && (
              <Button onClick={onSignOut} variant="destructive">
                Sign Out
              </Button>
            )}
            <Button 
              onClick={() => {
                console.log('🔐 Force login triggered');
                // Force a page reload to trigger re-evaluation
                window.location.reload();
              }} 
              variant="outline"
              size="sm"
            >
              Refresh/Login
            </Button>
          </div>
        </div>

        {/* Profile Card */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="text-center">
              <Avatar className="w-24 h-24 mx-auto mb-4">
                <AvatarImage src={profile.avatar_url || undefined} />
                <AvatarFallback className="text-2xl">
                  {profile.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              
              <h2 className="text-2xl font-bold mb-2">{profile.name}</h2>
              
              {profile.bio && (
                <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                  {profile.bio}
                </p>
              )}

              {/* Social Media Links */}
              {(profile.instagram_handle || profile.music_streaming_profile) && (
                <div className="flex items-center justify-center gap-4 mb-4 flex-wrap">
                  {profile.instagram_handle && (
                    <a
                      href={`https://instagram.com/${profile.instagram_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-pink-600 hover:text-pink-700 transition-colors"
                    >
                      <Instagram className="w-4 h-4" />
                      <span className="text-sm">Instagram</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {profile.music_streaming_profile && (
                    <a
                      href={profile.music_streaming_profile.startsWith('http') ? profile.music_streaming_profile : `https://open.spotify.com/user/${profile.music_streaming_profile}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-green-600 hover:text-green-700 transition-colors"
                    >
                      <Music className="w-4 h-4" />
                      <span className="text-sm">
                        {profile.music_streaming_profile.startsWith('http') 
                          ? (profile.music_streaming_profile.includes('spotify.com') ? 'Spotify' : 'Music Profile')
                          : profile.music_streaming_profile
                        }
                      </span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
              
              <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                <span>Member since {(() => {
                  try {
                    return format(new Date(profile.created_at), 'MMM yyyy');
                  } catch {
                    return 'Recently';
                  }
                })()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Events and Reviews Tabs */}
        <Tabs defaultValue="events" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="events" className="flex items-center gap-2">
              <Heart className="w-4 h-4" />
              Events
            </TabsTrigger>
            <TabsTrigger value="reviews" className="flex items-center gap-2">
              <Star className="w-4 h-4" />
              Reviews
            </TabsTrigger>
            <TabsTrigger value="friends" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Friends
            </TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Heart className="w-5 h-5" />
                  Concerts You're Interested In
                </CardTitle>
              </CardHeader>
              <CardContent>
                {userEvents.length === 0 ? (
                  <div className="text-center py-8">
                    <Heart className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No concerts yet</p>
                    <p className="text-sm text-muted-foreground">
                      Start exploring concerts to build your profile!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {userEvents.map((event) => {
                      const eventDateTime = new Date(event.event_date);
                      
                      return (
                        <div key={event.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold truncate">{event.title}</h4>
                            <p className="text-sm text-muted-foreground truncate">{event.artist_name}</p>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                <span>{format(eventDateTime, 'MMM d, yyyy')}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                <span className="truncate">{event.venue_name}, {event.venue_city}</span>
                              </div>
                            </div>
                          </div>
                          <Badge variant="secondary">
                            Interested
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reviews" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Star className="w-5 h-5" />
                    Your Concert Reviews
                  </div>
                  <Button onClick={handleOpenReviewModal} size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Review
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {reviews.length === 0 ? (
                  <div className="text-center py-8">
                    <Star className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No reviews yet</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Share your concert experiences with others!
                    </p>
                    <Button onClick={handleOpenReviewModal} variant="outline">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Your First Review
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reviews.map((review) => (
                      <ReviewCard
                        key={review.id}
                        review={{
                          id: review.id,
                          user_id: review.user_id,
                          event_id: review.event_id,
                          rating: typeof review.rating === 'string' ? parseInt(review.rating) : review.rating,
                          review_text: review.review_text,
                          is_public: review.is_public,
                          created_at: review.created_at,
                          updated_at: review.created_at,
                          likes_count: 0,
                          comments_count: 0,
                          shares_count: 0,
                          is_liked_by_user: false,
                          reaction_emoji: '',
                          photos: [],
                          videos: [],
                          mood_tags: [],
                          genre_tags: [],
                          context_tags: []
                        }}
                        currentUserId={currentUserId}
                        onEdit={handleEditReview}
                        onDelete={handleDeleteReview}
                        showEventInfo={true}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
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
    </div>
  );
};
