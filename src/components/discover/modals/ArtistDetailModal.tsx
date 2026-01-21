import React, { useState, useEffect } from 'react';
import { ChevronLeft, Share2, Star, Music } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ArtistFollowButton } from '@/components/artists/ArtistFollowButton';
import { ArtistVenueReviews } from '@/components/reviews/ArtistVenueReviews';
import { SwiftUIEventCard } from '@/components/events/SwiftUIEventCard';
import {
  iosModal,
  iosModalBackdrop,
  iosHeader,
  iosIconButton,
  glassCard,
  glassCardLight,
  textStyles,
  animations,
} from '@/styles/glassmorphism';

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
  const [artistImage, setArtistImage] = useState<string | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [totalReviews, setTotalReviews] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && artistId) {
      loadArtistData();
    }
  }, [isOpen, artistId]);

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
      const { data: eventsData } = await supabase
        .from('events')
        .select('*')
        .eq('artist_id', artistId)
        .order('event_date', { ascending: true });

      if (eventsData) {
        setEvents(eventsData);

        // Get first event image as artist image if artist table doesn't have one
        if (!artistData?.image_url) {
          const firstEvent = eventsData.find(e => e.images && Array.isArray(e.images) && e.images.length > 0);
          if (firstEvent?.images) {
            const imageUrl = firstEvent.images.find((img: any) => img?.url)?.url;
            if (imageUrl) setArtistImage(imageUrl);
          }
        }
      }

      // Get reviews for events by this artist
      const eventIds = eventsData?.map(e => e.id) || [];
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

  if (!isOpen) {
    return null;
  }

  const upcomingEvents = events.filter(e => new Date(e.event_date) >= new Date());
  const pastEvents = events.filter(e => new Date(e.event_date) < new Date());

  return (
    <>
      {/* Backdrop */}
      <div style={iosModalBackdrop} onClick={onClose} />
      
      {/* Modal Container */}
      <div
        style={{
          ...iosModal,
          background: 'var(--neutral-50, #FCFCFC)',
        }}
      >
        {/* iOS-style Header */}
        <div
          style={{
            ...iosHeader,
            position: 'sticky',
            top: 0,
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
          }}
        >
          <button onClick={onClose} style={{ ...iosIconButton, width: 40, height: 40 }} aria-label="Close">
            <ChevronLeft size={24} style={{ color: 'var(--neutral-900)' }} />
          </button>
          
          <h1
            style={{
              ...textStyles.title2,
              flex: 1,
              textAlign: 'center',
              margin: '0 12px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--neutral-900)',
            }}
          >
            {artistName}
          </h1>
          
          <button style={{ ...iosIconButton, width: 40, height: 40 }} aria-label="Share">
            <Share2 size={20} style={{ color: 'var(--neutral-900)' }} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 20, paddingBottom: 100 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: '3px solid var(--neutral-200)',
                  borderTopColor: 'var(--brand-pink-500)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Hero Section - Artist Image & Info */}
              <div
                style={{
                  ...glassCard,
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                }}
              >
                {/* Artist Image */}
                {artistImage ? (
                  <img
                    src={artistImage}
                    alt={artistName}
                    style={{
                      width: 100,
                      height: 100,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      marginBottom: 16,
                      border: '3px solid rgba(255, 255, 255, 0.5)',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 100,
                      height: 100,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, var(--brand-pink-500) 0%, #8D1FF4 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 16,
                      boxShadow: '0 8px 24px rgba(204, 36, 134, 0.3)',
                    }}
                  >
                    <Music size={40} color="#fff" />
                  </div>
                )}
                
                {/* Artist Name */}
                <h2 style={{ ...textStyles.title1, color: 'var(--neutral-900)', marginBottom: 8 }}>
                  {artistName}
                </h2>
                
                {/* Rating */}
                {averageRating !== null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          size={18}
                          fill={i < Math.floor(averageRating) ? 'var(--rating-star)' : 'none'}
                          style={{
                            color: i < Math.floor(averageRating) ? 'var(--rating-star)' : 'var(--neutral-300)',
                          }}
                        />
                      ))}
                    </div>
                    <span style={{ ...textStyles.callout, fontWeight: 600 }}>{averageRating.toFixed(1)}</span>
                    {totalReviews > 0 && (
                      <span style={{ ...textStyles.footnote }}>
                        ({totalReviews} {totalReviews === 1 ? 'review' : 'reviews'})
                      </span>
                    )}
                  </div>
                )}
                
                {/* Follow Button */}
                <ArtistFollowButton
                  artistName={artistName}
                  artistId={artistId}
                  userId={currentUserId}
                />
              </div>

              {/* Upcoming Events Section */}
              {upcomingEvents.length > 0 && (
                <div>
                  <h3 style={{ ...textStyles.title2, color: 'var(--neutral-900)', marginBottom: 16 }}>
                    Upcoming Events ({upcomingEvents.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {upcomingEvents.slice(0, 10).map((event) => (
                      <SwiftUIEventCard
                        key={event.id}
                        event={event}
                        currentUserId={currentUserId}
                        showActions={false}
                        compact={true}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Past Events Section */}
              {pastEvents.length > 0 && (
                <div>
                  <h3 style={{ ...textStyles.title2, color: 'var(--neutral-900)', marginBottom: 16 }}>
                    Past Events ({pastEvents.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {pastEvents.slice(0, 5).map((event) => (
                      <SwiftUIEventCard
                        key={event.id}
                        event={event}
                        currentUserId={currentUserId}
                        showActions={false}
                        compact={true}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Reviews Section */}
              {totalReviews > 0 && (
                <div>
                  <h3 style={{ ...textStyles.title2, color: 'var(--neutral-900)', marginBottom: 16 }}>
                    Reviews
                  </h3>
                  <ArtistVenueReviews
                    artistName={artistName}
                    venueName=""
                    artistId={artistId}
                  />
                </div>
              )}

              {/* Empty State */}
              {events.length === 0 && (
                <div
                  style={{
                    ...glassCardLight,
                    padding: 40,
                    textAlign: 'center',
                  }}
                >
                  <Music size={48} style={{ color: 'var(--neutral-400)', marginBottom: 16 }} />
                  <p style={{ ...textStyles.body, color: 'var(--neutral-600)' }}>
                    No events found for this artist
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
