import React, { useState, useEffect } from 'react';
import { ChevronLeft, Share2, Star, Music, ChevronDown, Camera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ArtistFollowButton } from '@/components/artists/ArtistFollowButton';
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

interface ArtistDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  artistId: string;
  artistName: string;
  currentUserId: string;
}

const INITIAL_UPCOMING_COUNT = 5;
const INITIAL_PAST_COUNT = 3;
const LOAD_MORE_COUNT = 10;

export const ArtistDetailModal: React.FC<ArtistDetailModalProps> = ({
  isOpen,
  onClose,
  artistId,
  artistName,
  currentUserId,
}) => {
  const [artistImage, setArtistImage] = useState<string | null>(null);
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

  useEffect(() => {
    if (isOpen && artistId) {
      loadArtistData();
      // Reset pagination when modal opens
      setUpcomingShown(INITIAL_UPCOMING_COUNT);
      setPastShown(INITIAL_PAST_COUNT);
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

      // Get reviews for this artist - both direct (artist_id) and event-linked
      const eventIds = eventsData?.map(e => e.id) || [];
      
      // Fetch direct artist reviews (where artist_id matches)
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
        .eq('artist_id', artistId)
        .eq('is_public', true)
        .eq('is_draft', false)
        .order('created_at', { ascending: false });

      // Fetch event-linked reviews (reviews for events by this artist)
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

      // Calculate average rating
      if (uniqueReviews.length > 0) {
        const validRatings = uniqueReviews.filter(r => r.rating && r.rating > 0);
        if (validRatings.length > 0) {
          const avgRating = validRatings.reduce((sum, r) => sum + r.rating, 0) / validRatings.length;
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

      // Fetch venue names for reviews
      const venueIds = [...new Set(uniqueReviews.map(r => r.venue_id).filter(Boolean))];
      const { data: venues } = venueIds.length > 0
        ? await supabase.from('venues').select('id, name').in('id', venueIds)
        : { data: [] };

      // Transform reviews to ReviewWithEngagement format
      const transformedReviews: ReviewWithEngagement[] = uniqueReviews.map(r => {
        const profile = profiles?.find(p => p.user_id === r.user_id);
        const venue = venues?.find(v => v.id === r.venue_id);
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
          artist_name: artistName,
          venue_name: venue?.name || event?.venue_name || '',
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
                        const artistPerfRating = (review as any).artist_performance_rating;
                        return (
                          <div
                            key={review.id}
                            style={{
                              ...glassCardLight,
                              padding: 16,
                              borderRadius: 12,
                            }}
                          >
                            {/* Rating Row - Artist Performance Only */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {/* Primary Rating: Artist Performance (or fallback to overall) */}
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
                                  <Music size={14} />
                                  {(artistPerfRating || review.rating)?.toFixed(1) || 'N/A'}
                                </div>
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
                      No reviews yet for {artistName}
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

              {/* Media Section */}
              {mediaItems.length > 0 && (
                <div>
                  <h3 style={{ ...textStyles.title2, color: 'var(--neutral-900)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Camera size={20} style={{ color: 'var(--brand-pink-500)' }} />
                    Media ({mediaItems.length})
                  </h3>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(3, 1fr)', 
                    gap: 8,
                    borderRadius: 12,
                    overflow: 'hidden',
                  }}>
                    {mediaItems.slice(0, 6).map((media, idx) => (
                      <div 
                        key={idx}
                        style={{
                          aspectRatio: '1',
                          borderRadius: 8,
                          overflow: 'hidden',
                          background: 'var(--neutral-100)',
                        }}
                      >
                        {media.type === 'photo' ? (
                          <img 
                            src={media.url} 
                            alt={`Media ${idx + 1}`}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <video 
                            src={media.url}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  {mediaItems.length > 6 && (
                    <p style={{ ...textStyles.footnote, color: 'var(--neutral-600)', textAlign: 'center', marginTop: 8 }}>
                      +{mediaItems.length - 6} more
                    </p>
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
