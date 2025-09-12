import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ArrowLeft, Edit, Heart, MapPin, Calendar, Instagram, Camera, ExternalLink, Settings, Music } from 'lucide-react';
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
  snapchat_handle: string | null;
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

export const ProfileView = ({ currentUserId, onBack, onEdit, onSettings, onSignOut }: ProfileViewProps) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userEvents, setUserEvents] = useState<UserEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConcertRankings, setShowConcertRankings] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchProfile();
    fetchUserEvents();
  }, [currentUserId]);

  const fetchProfile = async () => {
    try {
      console.log('Fetching profile for user:', currentUserId);
      
      // First try to get the profile
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, name, avatar_url, bio, instagram_handle, snapchat_handle, created_at, updated_at')
        .eq('user_id', currentUserId)
        .single();

      if (error) {
        console.error('Profile query error:', error);
        
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
          console.log('No profile found, creating default profile');
          
          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert({
              user_id: currentUserId,
              name: 'New User',
              bio: null,
              instagram_handle: null,
              snapchat_handle: null
            })
            .select()
            .single();
          
          if (insertError) {
            console.error('Error creating profile:', insertError);
            // If we can't create a profile, show a fallback
            setProfile({
              id: 'temp',
              user_id: currentUserId,
              name: 'New User',
              avatar_url: null,
              bio: null,
              instagram_handle: null,
              snapchat_handle: null,
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
        snapchat_handle: null,
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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-4">Profile not found</h2>
          <Button onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
      </div>
    );
  }

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
    <div className="min-h-screen p-4">
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
              {(profile.instagram_handle || profile.snapchat_handle) && (
                <div className="flex items-center justify-center gap-4 mb-4">
                  {profile.instagram_handle && (
                    <a
                      href={`https://instagram.com/${profile.instagram_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-pink-600 hover:text-pink-700 transition-colors"
                    >
                      <Instagram className="w-4 h-4" />
                      <span className="text-sm">@{profile.instagram_handle}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {profile.snapchat_handle && (
                    <a
                      href={`https://snapchat.com/add/${profile.snapchat_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-yellow-600 hover:text-yellow-700 transition-colors"
                    >
                      <Camera className="w-4 h-4" />
                      <span className="text-sm">@{profile.snapchat_handle}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
              
              <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                <span>Member since {format(new Date(profile.created_at), 'MMM yyyy')}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Concerts Interested In */}
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
      </div>
    </div>
  );
};
