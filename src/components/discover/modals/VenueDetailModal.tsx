import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Share2, Star, MapPin, Building2, ChevronDown, Camera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { VenueFollowButton } from '@/components/venues/VenueFollowButton';
import { EventMap } from '@/components/EventMap';
import { SwiftUIEventCard } from '@/components/events/SwiftUIEventCard';
import type { ReviewWithEngagement } from '@/services/reviewService';
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

const INITIAL_UPCOMING_COUNT = 5;
const INITIAL_PAST_COUNT = 3;
const LOAD_MORE_COUNT = 10;

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
  const [reviews, setReviews] = useState<ReviewWithEngagement[]>([]);
  const [reviewUserProfiles, setReviewUserProfiles] = useState<Record<string, { name: string; avatar_url?: string }>>({});
  const [mediaItems, setMediaItems] = useState<{ url: string; type: 'photo' | 'video' }[]>([]);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [totalReviews, setTotalReviews] = useState(0);
  const [loading, setLoading] = useState(true);
  const [upcomingShown, setUpcomingShown] = useState(INITIAL_UPCOMING_COUNT);
  const [pastShown, setPastShown] = useState(INITIAL_PAST_COUNT);
  const [reviewsShown, setReviewsShown] = useState(3);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadVenueData();
      // Reset pagination when modal opens
      setUpcomingShown(INITIAL_UPCOMING_COUNT);
      setPastShown(INITIAL_PAST_COUNT);
    }
  }, [isOpen, venueId, venueName]);

  // Focus management for accessibility
  useEffect(() => {
    if (isOpen) {
      // Store the element that had focus before modal opened
      previousFocusRef.current = document.activeElement as HTMLElement;
      
      // Focus first focusable element in modal
      const firstFocusable = modalRef.current?.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) as HTMLElement;
      
      // Use setTimeout to ensure modal is rendered
      setTimeout(() => {
        firstFocusable?.focus();
      }, 0);

      // Focus trap: prevent tabbing outside modal
      const handleTabKey = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return;
        
        const focusableElements = modalRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) as NodeListOf<HTMLElement>;
        
        if (!focusableElements || focusableElements.length === 0) return;
        
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        if (e.shiftKey) {
          // Shift + Tab
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      };

      document.addEventListener('keydown', handleTabKey);
      
      return () => {
        document.removeEventListener('keydown', handleTabKey);
        // Restore focus to previous element when modal closes
        previousFocusRef.current?.focus();
      };
    }
  }, [isOpen]);

  const loadVenueData = async () => {
    try {
      setLoading(true);
      
      // Get events for this venue using venue_id (UUID join) - no limit
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('venue_id', venueId)
        .order('event_date', { ascending: true });

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

      // Get reviews for this venue - both direct (venue_id) and event-linked
      const eventIds = eventsData?.map(e => e.id) || [];
      
      // Fetch direct venue reviews (where venue_id matches)
      const { data: directReviews } = await supabase
        .from('reviews')
        .select(`
          id,
          user_id,
          event_id,
          artist_id,
          venue_id,
          rating,
          review_text,
          photos,
          videos,
          mood_tags,
          genre_tags,
          context_tags,
          likes_count,
          comments_count,
          shares_count,
          is_public,
          created_at,
          updated_at,
          artist_performance_rating,
          production_rating,
          venue_rating,
          location_rating,
          value_rating,
          "Event_date"
        `)
        .eq('venue_id', venueId)
        .eq('is_public', true)
        .eq('is_draft', false)
        .order('created_at', { ascending: false });

      // Fetch event-linked reviews (reviews for events at this venue)
      let eventLinkedReviews: any[] = [];
      if (eventIds.length > 0) {
        const { data: eventReviews } = await supabase
          .from('reviews')
          .select(`
            id,
            user_id,
            event_id,
            artist_id,
            venue_id,
            rating,
            review_text,
            photos,
            videos,
            mood_tags,
            genre_tags,
            context_tags,
            likes_count,
            comments_count,
            shares_count,
            is_public,
            created_at,
            updated_at,
            artist_performance_rating,
            production_rating,
            venue_rating,
            location_rating,
            value_rating,
            "Event_date"
          `)
          .in('event_id', eventIds)
          .eq('is_public', true)
          .eq('is_draft', false)
          .order('created_at', { ascending: false });

        if (eventReviews) {
          eventLinkedReviews = eventReviews;
        }
      }

      // Combine and deduplicate reviews
      const allReviewsRaw = [...(directReviews || []), ...eventLinkedReviews];
      const uniqueReviewIds = new Set<string>();
      const uniqueReviews = allReviewsRaw.filter(r => {
        if (uniqueReviewIds.has(r.id)) return false;
        uniqueReviewIds.add(r.id);
        return true;
      });

      // Calculate average rating (prefer venue_rating, fallback to rating)
      if (uniqueReviews.length > 0) {
        const ratings = uniqueReviews
            .map(r => r.venue_rating || r.rating)
            .filter((r): r is number => typeof r === 'number' && !isNaN(r) && r > 0);
          if (ratings.length > 0) {
            const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
            setAverageRating(avgRating);
        }
        setTotalReviews(uniqueReviews.length);
      }

      // Fetch user profiles for reviews
      const userIds = [...new Set(uniqueReviews.map(r => r.user_id).filter(Boolean))];
      const { data: profiles } = userIds.length > 0 
        ? await supabase.from('users').select('user_id, name, avatar_url').in('user_id', userIds)
        : { data: [] };

      // Store profiles in state for SwiftUIReviewCard
      if (profiles) {
        const profileMap: Record<string, { name: string; avatar_url?: string }> = {};
        profiles.forEach(p => {
          profileMap[p.user_id] = { name: p.name || 'User', avatar_url: p.avatar_url || undefined };
        });
        setReviewUserProfiles(profileMap);
      }

      // Fetch artist names for reviews
      const artistIds = [...new Set(uniqueReviews.map(r => r.artist_id).filter(Boolean))];
      const { data: artists } = artistIds.length > 0
        ? await supabase.from('artists').select('id, name, image_url').in('id', artistIds)
        : { data: [] };

      // Transform reviews to ReviewWithEngagement format
      const transformedReviews: ReviewWithEngagement[] = uniqueReviews.map(r => {
        const profile = profiles?.find(p => p.user_id === r.user_id);
        const artist = artists?.find(a => a.id === r.artist_id);
        const event = eventsData?.find(e => e.id === r.event_id);

        return {
          id: r.id,
          user_id: r.user_id,
          event_id: r.event_id || '',
          artist_id: r.artist_id,
          venue_id: r.venue_id,
          rating: r.rating,
          review_text: r.review_text,
          is_public: r.is_public,
          created_at: r.created_at,
          updated_at: r.updated_at,
          likes_count: r.likes_count || 0,
          comments_count: r.comments_count || 0,
          shares_count: r.shares_count || 0,
          is_liked_by_user: false,
          reaction_emoji: '',
          photos: r.photos || [],
          videos: r.videos || [],
          mood_tags: r.mood_tags || [],
          genre_tags: r.genre_tags || [],
          context_tags: r.context_tags || [],
          artist_name: artist?.name || event?.artist_name || '',
          venue_name: venueName,
          Event_date: r.Event_date || event?.event_date,
          artist_performance_rating: r.artist_performance_rating,
          production_rating: r.production_rating,
          venue_rating: r.venue_rating,
          location_rating: r.location_rating,
          value_rating: r.value_rating,
        };
      });

      setReviews(transformedReviews);

      // Collect media from reviews
      const allMedia: { url: string; type: 'photo' | 'video' }[] = [];
      uniqueReviews.forEach(r => {
        if (r.photos && Array.isArray(r.photos)) {
          r.photos.forEach((url: string) => {
            if (url) allMedia.push({ url, type: 'photo' });
          });
        }
        if (r.videos && Array.isArray(r.videos)) {
          r.videos.forEach((url: string) => {
            if (url) allMedia.push({ url, type: 'video' });
          });
        }
      });
      setMediaItems(allMedia);

    } catch (error) {
      console.error('Error loading venue data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const upcomingEvents = events.filter(e => new Date(e.event_date) >= new Date());
  const pastEvents = events.filter(e => new Date(e.event_date) < new Date());

  const hasMoreUpcoming = upcomingEvents.length > upcomingShown;
  const hasMorePast = pastEvents.length > pastShown;

  const loadMoreButtonStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    padding: '14px 20px',
    marginTop: 12,
    fontSize: 15,
    fontWeight: 600,
    borderRadius: 12,
    border: '1.5px solid var(--brand-pink-500)',
    background: 'rgba(255, 255, 255, 0.8)',
    backdropFilter: 'blur(20px)',
    color: 'var(--brand-pink-500)',
    cursor: 'pointer',
    transition: `all ${animations.standardDuration} ${animations.springTiming}`,
  };

  return (
    <>
      {/* Backdrop */}
      <div style={iosModalBackdrop} onClick={onClose} />
      
      {/* Modal Container */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Venue details: ${venueName}`}
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
          <button onClick={onClose} style={{ ...iosIconButton, width: 44, height: 44, minWidth: 44, minHeight: 44 }} aria-label="Close venue details" type="button">
            <ChevronLeft size={24} style={{ color: 'var(--neutral-900)' }} aria-hidden="true" />
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
          
          <button style={{ ...iosIconButton, width: 44, height: 44, minWidth: 44, minHeight: 44 }} aria-label="Share" type="button">
            <Share2 size={20} style={{ color: 'var(--neutral-900)' }} aria-hidden="true" />
          </button>
          </div>
      
        {/* Content */}
        <div style={{ padding: 20, paddingBottom: 100 }}>
        {loading ? (
            <div 
              aria-busy="true"
              aria-live="polite"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}
            >
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
              <span className="sr-only">Loading venue information...</span>
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

              {/* Reviews Section - Yelp/Google style (ABOVE events) */}
              <div>
                <h3 style={{ ...textStyles.title2, color: 'var(--neutral-900)', marginBottom: 16 }}>
                  Reviews {reviews.length > 0 && `(${reviews.length})`}
                </h3>
                {reviews.length > 0 ? (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {reviews.slice(0, reviewsShown).map((review) => {
                        const profile = reviewUserProfiles[review.user_id];
                        const venueRating = (review as any).venue_rating;
                        const locationRating = (review as any).location_rating;
                        return (
                          <div
                            key={review.id}
                            style={{
                              ...glassCardLight,
                              padding: 16,
                              borderRadius: 12,
                            }}
                          >
                            {/* Rating Row - Venue Ratings Only */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                {/* Primary Rating: Venue (or fallback to overall) */}
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  background: 'var(--brand-pink-500)',
                                  color: '#fff',
                                  padding: '4px 8px',
                                  borderRadius: 6,
                                  fontSize: 14,
                                  fontWeight: 600,
                                }}>
                                  <Building2 size={14} />
                                  {(venueRating || review.rating)?.toFixed(1) || 'N/A'}
                                </div>
                                {/* Secondary: Location Rating */}
                                {locationRating && (
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    background: 'var(--neutral-100)',
                                    color: 'var(--neutral-700)',
                                    padding: '4px 8px',
                                    borderRadius: 6,
                                    fontSize: 12,
                                  }}>
                                    <MapPin size={12} />
                                    Location: {locationRating.toFixed(1)}
                                  </div>
                                )}
                              </div>
                              <span style={{ ...textStyles.caption, color: 'var(--neutral-500)' }}>
                                {new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            </div>
                            
                            {/* Review Text */}
                            {review.review_text && (
                              <p style={{
                                ...textStyles.body,
                                color: 'var(--neutral-700)',
                                margin: '8px 0',
                                lineHeight: 1.5,
                              }}>
                                "{review.review_text}"
                              </p>
                            )}
                            
                            {/* User Profile Button with Avatar */}
                            <button
                              onClick={() => {
                                window.dispatchEvent(new CustomEvent('open-user-profile', { detail: { userId: review.user_id } }));
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                marginTop: 12,
                                padding: '8px 12px',
                                background: 'rgba(255,255,255,0.8)',
                                border: '1.5px solid var(--brand-pink-500)',
                                borderRadius: 20,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                              }}
                            >
                              {/* Profile Pic */}
                              <div style={{
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                background: profile?.avatar_url ? `url(${profile.avatar_url}) center/cover` : 'var(--brand-pink-500)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontSize: 11,
                                fontWeight: 600,
                              }}>
                                {!profile?.avatar_url && (profile?.name?.charAt(0).toUpperCase() || 'U')}
                              </div>
                              <span style={{
                                fontSize: 14,
                                color: 'var(--brand-pink-500)',
                                fontWeight: 500,
                              }}>
                                {profile?.name || 'User'}
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {reviews.length > reviewsShown && (
                      <button
                        onClick={() => setReviewsShown(prev => prev + LOAD_MORE_COUNT)}
                        style={loadMoreButtonStyle}
                      >
                        <ChevronDown size={18} />
                        Load More ({reviews.length - reviewsShown} remaining)
                      </button>
                    )}
                  </>
                ) : (
                  <div
                    style={{
                      ...glassCardLight,
                      padding: 24,
                      textAlign: 'center',
                    }}
                  >
                    <p style={{ ...textStyles.body, color: 'var(--neutral-600)' }}>
                      No reviews yet for {venueName}
                    </p>
              </div>
                )}
              </div>

              {/* Upcoming Events Section */}
              {upcomingEvents.length > 0 && (
                <div>
                  <h3 style={{ ...textStyles.title2, color: 'var(--neutral-900)', marginBottom: 16 }}>
                    Upcoming Events ({upcomingEvents.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {upcomingEvents.slice(0, upcomingShown).map((event) => (
                      <SwiftUIEventCard
                        key={event.id}
                        event={event}
                        currentUserId={currentUserId}
                        showActions={false}
                        compact={true}
                      />
                    ))}
              </div>
                  {hasMoreUpcoming && (
                    <button
                      onClick={() => setUpcomingShown(prev => prev + LOAD_MORE_COUNT)}
                      style={loadMoreButtonStyle}
                    >
                      <ChevronDown size={18} />
                      Load More ({upcomingEvents.length - upcomingShown} remaining)
                    </button>
                  )}
            </div>
              )}

              {/* Past Events Section */}
              {pastEvents.length > 0 && (
              <div>
                  <h3 style={{ ...textStyles.title2, color: 'var(--neutral-900)', marginBottom: 16 }}>
                    Past Events ({pastEvents.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {pastEvents.slice(0, pastShown).map((event) => (
                      <SwiftUIEventCard
                        key={event.id}
                        event={event}
                        currentUserId={currentUserId}
                        showActions={false}
                        compact={true}
                      />
                    ))}
                  </div>
                  {hasMorePast && (
                    <button
                      onClick={() => setPastShown(prev => prev + LOAD_MORE_COUNT)}
                      style={loadMoreButtonStyle}
                    >
                      <ChevronDown size={18} />
                      Load More ({pastEvents.length - pastShown} remaining)
                    </button>
                  )}
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
