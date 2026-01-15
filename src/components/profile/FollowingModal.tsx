import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Music, MapPin, Loader2, User, X } from 'lucide-react';
import { ArtistFollowService } from '@/services/artistFollowService';
import { VenueFollowService } from '@/services/venueFollowService';
import { supabase } from '@/integrations/supabase/client';
import type { ArtistFollowWithDetails } from '@/types/artistFollow';
import type { VenueFollowWithDetails } from '@/types/venueFollow';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface FollowingModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  profileName: string;
  isOwnProfile?: boolean;
  onNavigateToProfile?: (userId: string) => void;
}

interface FollowedUser {
  id: string;
  user_id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
}

export function FollowingModal({
  isOpen,
  onClose,
  userId,
  profileName,
  isOwnProfile = false,
  onNavigateToProfile
}: FollowingModalProps) {
  const navigate = useNavigate();
  const [followedUsers, setFollowedUsers] = useState<FollowedUser[]>([]);
  const [followedArtists, setFollowedArtists] = useState<ArtistFollowWithDetails[]>([]);
  const [followedVenues, setFollowedVenues] = useState<VenueFollowWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'artists' | 'venues'>('users');

  useEffect(() => {
    if (isOpen && userId) {
      console.log('🔄 FollowingModal: Loading following for user:', userId);
      loadFollowing();
    } else {
      // Reset when modal closes
      setFollowedUsers([]);
      setFollowedArtists([]);
      setFollowedVenues([]);
      setLoading(true);
    }
  }, [isOpen, userId]);

  const loadFollowing = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('📥 FollowingModal: Fetching users, artists and venues for user:', userId);

      // Fetch users, artists and venues in parallel
      const [usersResult, artists, venues] = await Promise.all([
        // Fetch followed users from user_relationships where relationship_type='follow'
        supabase
          .from('user_relationships')
          .select('related_user_id, created_at')
          .eq('user_id', userId)
          .eq('relationship_type', 'follow')
          .order('created_at', { ascending: false }),
        ArtistFollowService.getUserFollowedArtists(userId),
        VenueFollowService.getUserFollowedVenues(userId)
      ]);

      // Process followed users
      if (usersResult.error) {
        console.error('Error fetching followed users:', usersResult.error);
      } else {
        const followedUserIds = (usersResult.data || [])
          .map((r: any) => r.related_user_id)
          .filter(Boolean);
        
        if (followedUserIds.length > 0) {
          // Fetch user profiles
          const { data: userProfiles, error: profilesError } = await supabase
            .from('users')
            .select('id, user_id, name, username, avatar_url, bio')
            .in('user_id', followedUserIds);

          if (profilesError) {
            console.error('Error fetching user profiles:', profilesError);
          } else {
            // Sort alphabetically by name
            const sortedUsers = (userProfiles || []).sort((a, b) => 
              (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
            ).map((profile: any) => ({
              id: profile.id,
              user_id: profile.user_id,
              name: profile.name || 'Unknown User',
              username: profile.username,
              avatar_url: profile.avatar_url,
              bio: profile.bio
            }));
            setFollowedUsers(sortedUsers);
            console.log('✅ FollowingModal: Set users:', sortedUsers.length);
          }
        }
      }

      console.log('📥 FollowingModal: Received artists:', artists.length, 'venues:', venues.length);
      console.log('📥 FollowingModal: Artist details:', artists.map(a => ({ name: a.artist_name, id: a.artist_id })));

      // Filter out artists without names (orphaned follows should be handled by service)
      const validArtists = artists.filter(a => a.artist_name && a.artist_name.trim() !== '');
      
      if (validArtists.length < artists.length) {
        console.warn(`⚠️ Filtered out ${artists.length - validArtists.length} artists without names`);
      }

      // Sort alphabetically by name
      const sortedArtists = [...validArtists].sort((a, b) => 
        (a.artist_name || '').localeCompare(b.artist_name || '', undefined, { sensitivity: 'base' })
      );
      const sortedVenues = [...venues].sort((a, b) => 
        (a.venue_name || '').localeCompare(b.venue_name || '', undefined, { sensitivity: 'base' })
      );

      setFollowedArtists(sortedArtists);
      setFollowedVenues(sortedVenues);
      
      console.log('✅ FollowingModal: Set artists:', sortedArtists.length, 'venues:', sortedVenues.length);
    } catch (error) {
      console.error('❌ FollowingModal: Error loading following:', error);
      setError('Failed to load following');
    } finally {
      setLoading(false);
    }
  };

  const handleArtistClick = (artist: ArtistFollowWithDetails) => {
    if (!artist.artist_name) return;
    
    // Use artistId if available and valid, otherwise use encoded artist name
    const artistId = artist.artist_id && artist.artist_id !== 'manual' 
      ? artist.artist_id 
      : encodeURIComponent(artist.artist_name);
    
    // Navigate to artist page
    navigate(`/artist/${artistId}`);
    onClose(); // Close the modal after opening the card
  };

  const handleVenueClick = (venue: VenueFollowWithDetails) => {
    if (!venue.venue_name) return;
    
    // Use venue_id if available, otherwise use encoded venue name
    const venueId = (venue as any).venue_id || encodeURIComponent(venue.venue_name);
    
    // Navigate to venue page
    navigate(`/venue/${venueId}`);
    onClose(); // Close the modal after opening the card
  };

  const handleUserClick = (followedUser: FollowedUser) => {
    if (onNavigateToProfile) {
      onNavigateToProfile(followedUser.user_id);
    }
    onClose();
  };

  const totalCount = followedUsers.length + followedArtists.length + followedVenues.length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="sm:max-w-lg w-[95vw] max-h-[80vh] flex flex-col p-0 max-w-[393px] mx-auto" 
      >
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4 border-b relative">
          <DialogTitle className="text-center text-lg font-semibold">Following</DialogTitle>
          <button
            onClick={onClose}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#cc2486] flex items-center justify-center hover:bg-[#b01f75] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'users' | 'artists' | 'venues')} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full grid grid-cols-3 rounded-none border-b">
            <TabsTrigger value="users" className="rounded-none">
              Users ({followedUsers.length})
            </TabsTrigger>
            <TabsTrigger value="artists" className="rounded-none">
              Artists ({followedArtists.length})
            </TabsTrigger>
            <TabsTrigger value="venues" className="rounded-none">
              Venues ({followedVenues.length})
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-[#cc2486] mr-2" />
                <span className="text-muted-foreground">Loading...</span>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-red-600">{error}</p>
              </div>
            ) : (
              <>
                {/* Users Tab */}
                <TabsContent value="users" className="mt-0 space-y-2">
                  {followedUsers.length === 0 ? (
                    <div className="text-center py-8">
                      <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">
                        {isOwnProfile ? 'Not following any users yet' : `${profileName} is not following any users yet`}
                      </p>
                    </div>
                  ) : (
                    followedUsers.map((followedUser) => (
                      <div
                        key={followedUser.user_id}
                        className="flex items-center gap-3 hover:bg-muted/40 rounded-lg p-3 transition-colors mx-2"
                        onClick={() => handleUserClick(followedUser)}
                      >
                        <Avatar className="w-10 h-10 flex-shrink-0">
                          <AvatarImage src={followedUser.avatar_url || undefined} />
                          <AvatarFallback className="text-sm">
                            {followedUser.name ? followedUser.name.split(' ').map(n => n[0]).join('') : 'U'}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0 mr-2">
                          <p className="font-semibold text-sm truncate">{followedUser.name}</p>
                          {followedUser.username ? (
                            <p className="text-xs text-muted-foreground truncate">@{followedUser.username}</p>
                          ) : null}
                          {followedUser.bio && (
                            <p className="text-xs text-muted-foreground truncate mt-1">{followedUser.bio}</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>

                {/* Artists Tab */}
                <TabsContent value="artists" className="mt-0 space-y-2">
                  {followedArtists.length === 0 ? (
                    <div className="text-center py-8">
                      <Music className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">
                        {isOwnProfile ? 'Not following any artists yet' : `${profileName} is not following any artists yet`}
                      </p>
                    </div>
                  ) : (
                    followedArtists.map((artist) => (
                      <div
                        key={artist.artist_id || artist.artist_name}
                        className="flex items-center gap-3 hover:bg-[rgba(201,201,201,0.2)] rounded-lg p-3 transition-colors cursor-pointer"
                        onClick={() => handleArtistClick(artist)}
                      >
                        <Avatar className="w-12 h-12 flex-shrink-0">
                          {artist.artist_image_url ? (
                            <AvatarImage src={artist.artist_image_url} alt={artist.artist_name || 'Artist'} />
                          ) : null}
                          <AvatarFallback className="bg-[#fdf2f7]">
                            <Music className="w-6 h-6 text-[#cc2486]" />
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-base truncate">{artist.artist_name}</p>
                          <p className="text-sm text-muted-foreground">Artist</p>
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>

                {/* Venues Tab */}
                <TabsContent value="venues" className="mt-0 space-y-2">
                  {followedVenues.length === 0 ? (
                    <div className="text-center py-8">
                      <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">
                        {isOwnProfile ? 'Not following any venues yet' : `${profileName} is not following any venues yet`}
                      </p>
                    </div>
                  ) : (
                    followedVenues.map((venue) => (
                      <div
                        key={(venue as any).venue_id || venue.venue_name}
                        className="flex items-center gap-3 hover:bg-[rgba(201,201,201,0.2)] rounded-lg p-3 transition-colors cursor-pointer"
                        onClick={() => handleVenueClick(venue)}
                      >
                        <Avatar className="w-12 h-12 flex-shrink-0">
                          {venue.venue_image_url ? (
                            <AvatarImage src={venue.venue_image_url} alt={venue.venue_name || 'Venue'} />
                          ) : null}
                          <AvatarFallback className="bg-[#fdf2f7]">
                            <MapPin className="w-6 h-6 text-[#cc2486]" />
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-base truncate">{venue.venue_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {venue.venue_state || 'Venue'}
                          </p>
                        </div>
                      </div>
                    ))
                )}
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

