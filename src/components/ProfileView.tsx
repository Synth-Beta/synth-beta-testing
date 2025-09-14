import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit, Heart, MapPin, Calendar, Instagram, ExternalLink, Settings, Music, Plus, ThumbsUp, ThumbsDown, Minus, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ConcertRanking } from './ConcertRanking';
import { JamBaseService } from '@/services/jambaseService';

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
  const [newReview, setNewReview] = useState({
    event_name: '',
    location: '',
    event_date: '',
    event_time: '',
    rating: '' as 'good' | 'okay' | 'bad' | '',
    review_text: '',
    is_public: true
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchProfile();
    fetchUserEvents();
    fetchReviews();
  }, [currentUserId]);

  const fetchProfile = async () => {
    try {
      console.log('Fetching profile for user:', currentUserId);
      
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
        
        // Handle API key errors specifically
        if (error.message?.includes('invalid') || error.message?.includes('API key') || error.message?.includes('JWT')) {
          console.error('API key error in ProfileView, signing out:', error);
          toast({
            title: "Session Expired",
            description: "Your session has expired. Please sign in again.",
            variant: "destructive",
          });
          // Don't sign out from here, let the parent handle it
          return;
        }
        
        // If no profile exists, create a default one
        if (error.code === 'PGRST116' || error.message?.includes('No rows found')) {
          console.log('No profile found for user:', currentUserId);
          
          // Debug: Let's see what profiles exist in the database
          const { data: allProfiles, error: allProfilesError } = await supabase
            .from('profiles')
            .select('id, user_id, name')
            .limit(10);
          
          console.log('All profiles in database:', allProfiles);
          console.log('All profiles error:', allProfilesError);
          
          console.log('Creating default profile for user:', currentUserId);
          
          // Get user metadata from auth
          const { data: { user } } = await supabase.auth.getUser();
          const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'New User';
          
          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert({
              user_id: currentUserId,
              name: userName,
              bio: null,
              instagram_handle: null
              // Note: music_streaming_profile will be added by the database default or migration
            })
            .select()
            .single();
          
          if (insertError) {
            console.error('Error creating profile:', insertError);
            // If we can't create a profile, show a fallback
            setProfile({
              id: 'temp',
              user_id: currentUserId,
              name: userName,
              avatar_url: null,
              bio: null,
              instagram_handle: null,
              music_streaming_profile: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          } else {
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
      // Load reviews from localStorage for now (similar to ConcertRanking component)
      const storedReviews = localStorage.getItem(`concert_reviews_${currentUserId}`);
      if (storedReviews) {
        setReviews(JSON.parse(storedReviews));
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
    }
  };

  const handleAddReview = async () => {
    if (!newReview.event_name || !newReview.rating) {
      toast({
        title: "Missing Information",
        description: "Please fill in the event name and rating.",
        variant: "destructive",
      });
      return;
    }

    const review: ConcertReview = {
      id: Date.now().toString(),
      user_id: currentUserId,
      event_id: 'placeholder', // Placeholder since we're using localStorage
      rating: newReview.rating,
      review_text: newReview.review_text || null,
      is_public: newReview.is_public,
      created_at: new Date().toISOString(),
      event: {
        event_name: newReview.event_name,
        location: newReview.location,
        event_date: newReview.event_date || new Date().toISOString().split('T')[0],
        event_time: newReview.event_time,
      },
    };

    const updatedReviews = [...reviews, review];
    setReviews(updatedReviews);
    localStorage.setItem(`concert_reviews_${currentUserId}`, JSON.stringify(updatedReviews));
    
    // Reset form
    setNewReview({
      event_name: '',
      location: '',
      event_date: '',
      event_time: '',
      rating: '',
      review_text: '',
      is_public: true
    });
    setShowAddReview(false);
    
    toast({
      title: "Review Added",
      description: "Your concert review has been added!",
    });
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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-4">Profile not found</h2>
          <p className="text-muted-foreground mb-4">Loading profile data...</p>
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="events" className="flex items-center gap-2">
              <Heart className="w-4 h-4" />
              Events
            </TabsTrigger>
            <TabsTrigger value="reviews" className="flex items-center gap-2">
              <Star className="w-4 h-4" />
              Reviews
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
                  <Button onClick={() => setShowAddReview(true)} size="sm">
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
                    <Button onClick={() => setShowAddReview(true)} variant="outline">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Your First Review
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reviews.map((review) => (
                      <div key={review.id} className="p-4 border rounded-lg">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h4 className="font-semibold">{review.event.event_name}</h4>
                            {review.event.location && (
                              <p className="text-sm text-muted-foreground">{review.event.location}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {(() => {
                                try {
                                  return format(new Date(review.event.event_date), 'MMM d, yyyy');
                                } catch {
                                  return review.event.event_date;
                                }
                              })()}
                            </p>
                          </div>
                          <Badge className={`${getRatingColor(review.rating)} border`}>
                            {getRatingIcon(review.rating)}
                            <span className="ml-1">{getRatingText(review.rating)}</span>
                          </Badge>
                        </div>
                        {review.review_text && (
                          <p className="text-sm text-gray-700 leading-relaxed mb-3">
                            {review.review_text}
                          </p>
                        )}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{(() => {
                            try {
                              return format(new Date(review.created_at), 'MMM d, yyyy');
                            } catch {
                              return review.created_at;
                            }
                          })()}</span>
                          <Badge variant="outline" className="text-xs">
                            {review.is_public ? 'Public' : 'Private'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>

      {/* Add Review Modal */}
      {showAddReview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>Add Concert Review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Event Name *</label>
                <input
                  type="text"
                  value={newReview.event_name}
                  onChange={(e) => setNewReview({ ...newReview, event_name: e.target.value })}
                  className="w-full p-2 border rounded-md"
                  placeholder="e.g., Taylor Swift - Eras Tour"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Location</label>
                <input
                  type="text"
                  value={newReview.location}
                  onChange={(e) => setNewReview({ ...newReview, location: e.target.value })}
                  className="w-full p-2 border rounded-md"
                  placeholder="e.g., Madison Square Garden, NYC"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Date</label>
                <input
                  type="date"
                  value={newReview.event_date}
                  onChange={(e) => setNewReview({ ...newReview, event_date: e.target.value })}
                  className="w-full p-2 border rounded-md"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Rating *</label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={newReview.rating === 'good' ? 'default' : 'outline'}
                    onClick={() => setNewReview({ ...newReview, rating: 'good' })}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    <ThumbsUp className="w-4 h-4 mr-2" />
                    Good
                  </Button>
                  <Button
                    type="button"
                    variant={newReview.rating === 'okay' ? 'default' : 'outline'}
                    onClick={() => setNewReview({ ...newReview, rating: 'okay' })}
                    className="flex-1 bg-yellow-600 hover:bg-yellow-700"
                  >
                    <Minus className="w-4 h-4 mr-2" />
                    Okay
                  </Button>
                  <Button
                    type="button"
                    variant={newReview.rating === 'bad' ? 'default' : 'outline'}
                    onClick={() => setNewReview({ ...newReview, rating: 'bad' })}
                    className="flex-1 bg-red-600 hover:bg-red-700"
                  >
                    <ThumbsDown className="w-4 h-4 mr-2" />
                    Bad
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Review (Optional)</label>
                <Textarea
                  value={newReview.review_text}
                  onChange={(e) => setNewReview({ ...newReview, review_text: e.target.value })}
                  placeholder="Share your thoughts about this concert..."
                  className="min-h-[100px]"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="public"
                  checked={newReview.is_public}
                  onChange={(e) => setNewReview({ ...newReview, is_public: e.target.checked })}
                />
                <label htmlFor="public" className="text-sm">Make this review public</label>
              </div>

              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowAddReview(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleAddReview} className="flex-1">
                  Add Review
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
