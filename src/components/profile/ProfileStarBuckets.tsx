import React, { useMemo, useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { getFallbackEventImage } from '@/utils/eventImageFallbacks';
import { supabase } from '@/integrations/supabase/client';

interface ProfileStarBucketsProps {
  reviews: any[];
  onSelectReview?: (review: any) => void;
}

interface CompactReviewCardProps {
  review: any;
  ratingValue: number;
  stars: number;
  onSelectReview?: (review: any) => void;
  renderStars: (rating: number) => React.ReactNode;
}

// Separate component for each review card to use hooks properly
function CompactReviewCard({ review, ratingValue, stars, onSelectReview, renderStars }: CompactReviewCardProps) {
  const event = review.event || {};
  const jambaseEvent = review.jambase_events || {};
  
  // Get artist and venue names
  const artistName = jambaseEvent.artist_name || event._fullEvent?.artist_name || 'Unknown Artist';
  const venueName = jambaseEvent.venue_name || event.location || event._fullEvent?.venue_name || 'Unknown Venue';
  const dateStr = event.event_date || review.created_at;
  
  // Get artist_id from event data
  const artistId = jambaseEvent.artist_id || event._fullEvent?.artist_id || null;
  
  const hasUserImage = Array.isArray(review.photos) && review.photos.length > 0;
  const primaryImage = hasUserImage ? review.photos[0] : undefined;
  
  // Fetch artist image if no user image
  const [artistImageUrl, setArtistImageUrl] = useState<string | null>(null);
  
  useEffect(() => {
    if (!primaryImage && artistId) {
      // Fetch artist image_url from artists table
      supabase
        .from('artists')
        .select('image_url')
        .eq('id', artistId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!error && data?.image_url) {
            setArtistImageUrl(data.image_url);
          }
        });
    }
  }, [primaryImage, artistId]);
  
  // Determine image source: user photo > artist image > fallback
  const imageKey = `${review.id}-${artistName}-${venueName}-${dateStr || ''}`;
  const imageSrc = primaryImage || artistImageUrl || getFallbackEventImage(imageKey);

  return (
    <button
      key={review.id}
      type="button"
      onClick={() => onSelectReview?.(review)}
      className="w-40 shrink-0 rounded-2xl bg-white border border-pink-100 shadow-sm hover:shadow-md transition-shadow text-left overflow-hidden"
    >
      {/* Image */}
      <div className="relative h-20 w-full overflow-hidden">
        <img
          src={imageSrc}
          alt={`${artistName} at ${venueName}`}
          className={`w-full h-full object-cover transition-transform duration-500 ${hasUserImage ? '' : 'scale-105'}`}
          loading="lazy"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent"
          aria-hidden="true"
        />
      </div>
      {/* Text content */}
      <div className="px-3 py-2 space-y-1">
        <p className="text-sm font-semibold text-gray-900 line-clamp-1">Concert Review</p>
        <p className="text-xs text-gray-600 line-clamp-1">{artistName}</p>
        <p className="text-xs text-gray-600 line-clamp-1">{venueName}</p>
        <p className="text-[11px] text-gray-400">
          {dateStr ? new Date(dateStr).toLocaleDateString() : ''}
        </p>
        <div className="flex items-center justify-between mt-1">
          {renderStars(ratingValue)}
          <span className="text-xs font-semibold text-gray-800">
            {Math.round(ratingValue * 10) / 10}★
          </span>
        </div>
      </div>
    </button>
  );
}

/**
 * Visual grouping of a user's reviews into 5★–1★ horizontal carousels,
 * mirroring the profile layout in the Figma. This is strictly presentational:
 * it derives everything from the already-fetched `reviews` array in ProfileView
 * and uses the existing review objects when a card is clicked.
 */
export function ProfileStarBuckets({ reviews, onSelectReview }: ProfileStarBucketsProps) {
  const grouped = useMemo(() => {
    const buckets: Record<1 | 2 | 3 | 4 | 5, any[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };

    for (const review of reviews || []) {
      // Skip attendance-only markers that aren't real written reviews
      if (review.review_text === 'ATTENDANCE_ONLY' && !review.was_there) continue;

      const rawRating = typeof review.category_average === 'number'
        ? review.category_average
        : typeof review.rating === 'number'
          ? review.rating
          : 0;

      if (!rawRating || rawRating <= 0) continue;

      // Bucket by floor so only true 5.0 land in 5★, 4.0–4.9 → 4★, etc.
      const bucket = Math.floor(rawRating) as 1 | 2 | 3 | 4 | 5;
      if (bucket >= 1 && bucket <= 5) {
        buckets[bucket].push(review);
      }
    }

    // Sort each bucket by event date or created_at desc
    const starKeys: Array<1 | 2 | 3 | 4 | 5> = [5, 4, 3, 2, 1];
    starKeys.forEach((stars) => {
      const items = buckets[stars] || [];
      buckets[stars] = items.slice().sort((a, b) => {
        // Primary: within a bucket, higher effective rating should come first
        const getEffective = (review: any) => {
          if (typeof review?.category_average === 'number') return review.category_average;
          if (typeof review?.rating === 'number') return review.rating;
          return stars;
        };

        const aRating = getEffective(a);
        const bRating = getEffective(b);
        if (bRating !== aRating) {
          return bRating - aRating; // higher rating first
        }

        // Secondary: newer events/reviews first
        const aDate = a?.event?.event_date || a?.created_at;
        const bDate = b?.event?.event_date || b?.created_at;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });
    });

    return buckets;
  }, [reviews]);

  const renderStars = (rating: number) => {
    // Round DOWN to the nearest 0.5 star (e.g., 4.8 → 4.5, 4.7 → 4.5, 4.6 → 4.5)
    const rounded = Math.floor(rating * 2) / 2;
    return (
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }, (_, i) => {
          const starIndex = i + 1;
          const isFull = rounded >= starIndex;
          const isHalf = !isFull && rounded >= starIndex - 0.5;
          return (
            <div key={i} className="relative w-3 h-3">
              <Star className={`w-3 h-3 ${isFull ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
              {isHalf && (
                <div className="absolute inset-0 overflow-hidden" style={{ width: '50%' }}>
                  <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const sections: Array<{ stars: 5 | 4 | 3 | 2 | 1; label: string }> = [
    { stars: 5, label: '5 Star Reviews' },
    { stars: 4, label: '4 Star Reviews' },
    { stars: 3, label: '3 Star Reviews' },
    { stars: 2, label: '2 Star Reviews' },
    { stars: 1, label: '1 Star Reviews' },
  ];

  const hasAny = sections.some(({ stars }) => grouped[stars].length > 0);
  if (!hasAny) return null;

  return (
    <div className="space-y-6 mb-8">
      {sections.map(({ stars, label }) => {
        const bucket = grouped[stars];
        if (!bucket || bucket.length === 0) return null;

        return (
          <section key={stars} className="space-y-2">
            <h3 className="text-base font-semibold text-gray-900">
              {label} <span className="text-sm font-normal text-gray-500">({bucket.length})</span>
            </h3>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {bucket.map((review) => {
                const ratingValue =
                  typeof review.category_average === 'number'
                    ? review.category_average
                    : typeof review.rating === 'number'
                      ? review.rating
                      : stars;

                return (
                  <CompactReviewCard
                    key={review.id}
                    review={review}
                    ratingValue={ratingValue}
                    stars={stars}
                    onSelectReview={onSelectReview}
                    renderStars={renderStars}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}


