import React, { useState, useEffect } from 'react';
import { ChevronLeft, Share2, Star, MapPin, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { VenueFollowButton } from '@/components/venues/VenueFollowButton';
import { ArtistVenueReviews } from '@/components/reviews/ArtistVenueReviews';
import { EventMap } from '@/components/EventMap';
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

interface VenueDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  venueId: string;
  venueName: string;
  currentUserId: string;
}

export const VenueDetailModal: React.FC<VenueDetailModalProps> = ({
  isOpen,
  onClose,
  venueId,
  venueName,
  currentUserId,
}) => {
  const [venueCity, setVenueCity] = useState<string | null>(null);
  const [venueState, setVenueState] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [totalReviews, setTotalReviews] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadVenueData();
    }
  }, [isOpen, venueId, venueName]);

  const loadVenueData = async () => {
    try {
      setLoading(true);
      
      // Get events for this venue using venue_id (UUID join)
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('venue_id', venueId)
        .order('event_date', { ascending: true })
        .limit(100);

      if (eventsError) {
        console.warn('Error fetching venue events:', eventsError);
      }

      // Get venue details if possible
      try {
        const { data: venueData } = await supabase
          .from('venues')
          .select('id, name, state, latitude, longitude, street_address, zip, country')
          .eq('id', venueId)
          .maybeSingle();

        if (venueData) {
          if (venueData.state && !venueState) setVenueState(venueData.state);
          if (venueData.latitude && !latitude) setLatitude(Number(venueData.latitude));
          if (venueData.longitude && !longitude) setLongitude(Number(venueData.longitude));
        }
      } catch (venueError) {
        console.warn('Could not fetch venue details (non-critical):', venueError);
      }

      if (eventsData && eventsData.length > 0) {
        setEvents(eventsData);

        // Get location from first event
        const firstEvent = eventsData[0];
        if (firstEvent.venue_city) setVenueCity(firstEvent.venue_city);
        if (firstEvent.venue_state) setVenueState(firstEvent.venue_state);
        if (firstEvent.latitude) setLatitude(Number(firstEvent.latitude));
        if (firstEvent.longitude) setLongitude(Number(firstEvent.longitude));
      }

      // Get reviews for events at this venue
      const eventIds = eventsData?.map(e => e.id) || [];
      if (eventIds.length > 0) {
        const { data: reviews } = await supabase
          .from('reviews')
          .select('venue_rating, rating')
          .in('event_id', eventIds)
          .eq('is_public', true)
          .eq('is_draft', false);

        if (reviews && reviews.length > 0) {
          const ratings = reviews
            .map(r => r.venue_rating || r.rating)
            .filter((r): r is number => typeof r === 'number' && !isNaN(r) && r > 0);
          if (ratings.length > 0) {
            const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
            setAverageRating(avgRating);
          } else {
            setAverageRating(null);
          }
          setTotalReviews(ratings.length);
        }
      }
    } catch (error) {
      console.error('Error loading venue data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

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
            {venueName}
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
              {/* Hero Section - Venue Info */}
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
                {/* Venue Icon */}
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 20,
                    background: 'linear-gradient(135deg, var(--brand-pink-500) 0%, #8D1FF4 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                    boxShadow: '0 8px 24px rgba(204, 36, 134, 0.3)',
                  }}
                >
                  <Building2 size={36} color="#fff" />
                </div>
                
                {/* Venue Name */}
                <h2 style={{ ...textStyles.title1, color: 'var(--neutral-900)', marginBottom: 8 }}>
                  {venueName}
                </h2>
                
                {/* Location */}
                {(venueCity || venueState) && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 12,
                    }}
                  >
                    <MapPin size={16} style={{ color: 'var(--neutral-600)' }} />
                    <span style={{ ...textStyles.callout, color: 'var(--neutral-600)' }}>
                      {[venueCity, venueState].filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}
                
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
                <VenueFollowButton
                  venueName={venueName}
                  venueCity={venueCity || undefined}
                  venueState={venueState || undefined}
                  userId={currentUserId}
                />
              </div>

              {/* Map Section */}
              {latitude && longitude && (
                <div
                  style={{
                    ...glassCardLight,
                    padding: 0,
                    overflow: 'hidden',
                    height: 200,
                    borderRadius: 16,
                  }}
                >
                  <EventMap
                    center={[latitude, longitude]}
                    zoom={15}
                    events={[{
                      id: venueId,
                      jambase_event_id: venueId,
                      title: venueName,
                      artist_name: venueName,
                      artist_id: '',
                      venue_name: venueName,
                      venue_id: venueId,
                      event_date: new Date().toISOString(),
                      latitude,
                      longitude,
                    }]}
                    onEventClick={() => {}}
                  />
                </div>
              )}

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
                    artistName=""
                    venueName={venueName}
                    venueId={venueId}
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
                  <Building2 size={48} style={{ color: 'var(--neutral-400)', marginBottom: 16 }} />
                  <p style={{ ...textStyles.body, color: 'var(--neutral-600)' }}>
                    No events found for this venue
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
