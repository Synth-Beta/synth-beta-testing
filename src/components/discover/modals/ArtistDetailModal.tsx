import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Star, Music, Calendar, MapPin, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ArtistFollowButton } from '@/components/artists/ArtistFollowButton';
import { ArtistVenueReviews } from '@/components/reviews/ArtistVenueReviews';
import { useNavigate } from 'react-router-dom';

interface ArtistDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  artistId: string;
  artistName: string;
  currentUserId: string;
}

export const ArtistDetailModal: React.FC<ArtistDetailModalProps> = ({
  isOpen,
  onClose,
  artistId,
  artistName,
  currentUserId,
}) => {
  const navigate = useNavigate();
  const [artistImage, setArtistImage] = useState<string | null>(null);
  const [totalEvents, setTotalEvents] = useState(0);
  const [upcomingEvents, setUpcomingEvents] = useState(0);
  const [pastEvents, setPastEvents] = useState(0);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [totalReviews, setTotalReviews] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadArtistData();
    }
  }, [isOpen, artistId, artistName]);

  const loadArtistData = async () => {
    try {
      setLoading(true);
      
      // Get events for this artist
      const { data: events } = await supabase
        .from('events')
        .select('id, event_date, images')
        .ilike('artist_name', `%${artistName}%`);

      if (events) {
        setTotalEvents(events.length);
        const now = new Date();
        const upcoming = events.filter(e => new Date(e.event_date) >= now).length;
        setUpcomingEvents(upcoming);
        setPastEvents(events.length - upcoming);

        // Get first event image as artist image
        const firstEvent = events.find(e => e.images && Array.isArray(e.images) && e.images.length > 0);
        if (firstEvent?.images) {
          const imageUrl = firstEvent.images.find((img: any) => img?.url)?.url;
          if (imageUrl) setArtistImage(imageUrl);
        }
      }

      // Get reviews for events by this artist
      const eventIds = events?.map(e => e.id) || [];
      if (eventIds.length > 0) {
        const { data: reviews } = await supabase
          .from('reviews')
          .select('rating')
          .in('event_id', eventIds)
          .eq('is_public', true)
          .eq('is_draft', false);

        if (reviews && reviews.length > 0) {
          const avgRating = reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length;
          setAverageRating(avgRating);
          setTotalReviews(reviews.length);
        }
      }
    } catch (error) {
      console.error('Error loading artist data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="icon" onClick={onClose}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <DialogTitle className="flex-1">{artistName}</DialogTitle>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header Section */}
            <div className="flex items-start gap-4">
              {artistImage ? (
                <img
                  src={artistImage}
                  alt={artistName}
                  className="w-24 h-24 rounded-full object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center">
                  <Music className="w-12 h-12 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-2">{artistName}</h2>
                {averageRating !== null && (
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${
                            i < Math.floor(averageRating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-sm font-medium">{averageRating.toFixed(1)}</span>
                    {totalReviews > 0 && (
                      <span className="text-sm text-muted-foreground">
                        ({totalReviews} {totalReviews === 1 ? 'review' : 'reviews'})
                      </span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-4 mt-4">
                  <ArtistFollowButton
                    artistName={artistName}
                    artistId={artistId}
                    userId={currentUserId}
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigate(`/artist/${encodeURIComponent(artistName)}`);
                      onClose();
                    }}
                  >
                    View All Events
                  </Button>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{totalEvents}</div>
                <div className="text-sm text-muted-foreground">Total Events</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{upcomingEvents}</div>
                <div className="text-sm text-muted-foreground">Upcoming</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{pastEvents}</div>
                <div className="text-sm text-muted-foreground">Past</div>
              </div>
            </div>

            {/* Reviews Section */}
            {totalReviews > 0 && (
              <div>
                <h3 className="font-semibold mb-4">Reviews</h3>
                <ArtistVenueReviews
                  artistName={artistName}
                  artistId={artistId}
                />
              </div>
            )}

            {/* View Full Page Button */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                navigate(`/artist/${encodeURIComponent(artistName)}`);
                onClose();
              }}
            >
              View Full Artist Page
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

