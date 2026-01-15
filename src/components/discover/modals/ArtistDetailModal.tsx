import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/Icon/Icon';
import { Star } from 'lucide-react';
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
      
      // Get artist image from artists table
      const { data: artistData } = await supabase
        .from('artists')
        .select('id, name, image_url')
        .eq('id', artistId)
        .maybeSingle();

      if (artistData?.image_url) {
        setArtistImage(artistData.image_url);
      }

      // Get events for this artist using artist_id (UUID join)
      const { data: events } = await supabase
        .from('events')
        .select('id, event_date, images')
        .eq('artist_id', artistId);

      if (events) {
        setTotalEvents(events.length);
        const now = new Date();
        const upcoming = events.filter(e => new Date(e.event_date) >= now).length;
        setUpcomingEvents(upcoming);
        setPastEvents(events.length - upcoming);

        // Get first event image as artist image if artist table doesn't have one
        if (!artistImage) {
          const firstEvent = events.find(e => e.images && Array.isArray(e.images) && e.images.length > 0);
          if (firstEvent?.images) {
            const imageUrl = firstEvent.images.find((img: any) => img?.url)?.url;
            if (imageUrl) setArtistImage(imageUrl);
          }
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

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-[#fcfcfc] overflow-y-auto overflow-x-hidden w-full max-w-full"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'max(5rem, calc(5rem + env(safe-area-inset-bottom, 0px)))'
      }}
    >
      {/* Header with X button */}
      <div className="bg-[#fcfcfc] border-b border-gray-200 w-full max-w-full">
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold flex-1 pr-2 break-words min-w-0">{artistName}</h1>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <Icon name="x" size={24} color="var(--neutral-900)" />
          </button>
        </div>
          </div>
      
      <div className="px-4 py-4 w-full max-w-full overflow-x-hidden">

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header Section */}
            <div className="flex items-start gap-3 w-full">
              {artistImage ? (
                <img
                  src={artistImage}
                  alt={artistName}
                  className="w-16 h-16 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Icon name="music" size={35} color="var(--neutral-600)" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold mb-2 break-words">{artistName}</h2>
                {averageRating !== null && (
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          size={16}
                          style={{
                            color: i < Math.floor(averageRating) ? 'var(--color-yellow)' : 'var(--neutral-300)',
                            fill: i < Math.floor(averageRating) ? 'var(--color-yellow)' : 'none',
                          }}
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
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <ArtistFollowButton
                    artistName={artistName}
                    artistId={artistId}
                    userId={currentUserId}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
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
            <div className="grid grid-cols-3 gap-2 w-full">
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
      </div>
    </div>
  );
};

