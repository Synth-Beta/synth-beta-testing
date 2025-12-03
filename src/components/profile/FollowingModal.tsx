import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Music, MapPin, Loader2, User } from 'lucide-react';
import { ArtistFollowService } from '@/services/artistFollowService';
import { VenueFollowService } from '@/services/venueFollowService';
import type { ArtistFollowWithDetails } from '@/types/artistFollow';
import type { VenueFollowWithDetails } from '@/types/venueFollow';

interface FollowingModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  profileName: string;
  isOwnProfile?: boolean;
}

export function FollowingModal({
  isOpen,
  onClose,
  userId,
  profileName,
  isOwnProfile = false
}: FollowingModalProps) {
  const navigate = useNavigate();
  const [followedArtists, setFollowedArtists] = useState<ArtistFollowWithDetails[]>([]);
  const [followedVenues, setFollowedVenues] = useState<VenueFollowWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && userId) {
      loadFollowing();
    }
  }, [isOpen, userId]);

  const loadFollowing = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch both artists and venues in parallel
      const [artists, venues] = await Promise.all([
        ArtistFollowService.getUserFollowedArtists(userId),
        VenueFollowService.getUserFollowedVenues(userId)
      ]);

      // Sort alphabetically by name
      const sortedArtists = [...artists].sort((a, b) => 
        (a.artist_name || '').localeCompare(b.artist_name || '', undefined, { sensitivity: 'base' })
      );
      const sortedVenues = [...venues].sort((a, b) => 
        (a.venue_name || '').localeCompare(b.venue_name || '', undefined, { sensitivity: 'base' })
      );

      setFollowedArtists(sortedArtists);
      setFollowedVenues(sortedVenues);
    } catch (error) {
      console.error('Error loading following:', error);
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

  const totalCount = followedArtists.length + followedVenues.length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="sm:max-w-lg w-[95vw] max-h-[80vh] flex flex-col p-0" 
      >
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-center">Following</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4" style={{ maxHeight: 'calc(80vh - 100px)' }}>
          <div className="space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-pink-500 mr-2" />
                <span className="text-muted-foreground">Loading...</span>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-red-600">{error}</p>
              </div>
            ) : totalCount === 0 ? (
              <div className="text-center py-8">
                <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {isOwnProfile ? 'Not following any artists or venues yet' : `${profileName} is not following any artists or venues yet`}
                </p>
              </div>
            ) : (
              <>
                {/* Artists Section */}
                {followedArtists.length > 0 && (
                  <>
                    {followedArtists.map((artist) => (
                      <div
                        key={artist.artist_id || artist.artist_name}
                        className="flex items-center gap-3 hover:bg-muted/40 rounded-lg p-3 transition-colors cursor-pointer"
                        onClick={() => handleArtistClick(artist)}
                      >
                        <Avatar className="w-10 h-10 flex-shrink-0">
                          {artist.artist_image_url ? (
                            <AvatarImage src={artist.artist_image_url} />
                          ) : null}
                          <AvatarFallback className="text-sm bg-pink-100">
                            <Music className="w-5 h-5 text-pink-600" />
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0 mr-2">
                          <p className="font-semibold text-sm truncate">{artist.artist_name}</p>
                          <p className="text-xs text-muted-foreground">Artist</p>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* Venues Section */}
                {followedVenues.length > 0 && (
                  <>
                    {followedVenues.map((venue) => (
                      <div
                        key={(venue as any).venue_id || venue.venue_name}
                        className="flex items-center gap-3 hover:bg-muted/40 rounded-lg p-3 transition-colors cursor-pointer"
                        onClick={() => handleVenueClick(venue)}
                      >
                        <Avatar className="w-10 h-10 flex-shrink-0">
                          {venue.venue_image_url ? (
                            <AvatarImage src={venue.venue_image_url} />
                          ) : null}
                          <AvatarFallback className="text-sm bg-blue-100">
                            <MapPin className="w-5 h-5 text-blue-600" />
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0 mr-2">
                          <p className="font-semibold text-sm truncate">{venue.venue_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {[venue.venue_city, venue.venue_state].filter(Boolean).join(', ') || 'Venue'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

