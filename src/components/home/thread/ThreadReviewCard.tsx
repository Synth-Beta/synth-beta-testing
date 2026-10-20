import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Heart, MessageCircle, Send, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReviewService, type ReviewWithEngagement } from '@/services/reviewService';
import { ReviewShareModal } from '@/components/reviews/ReviewShareModal';
import { replaceJambasePlaceholder, getFallbackEventImage, getSynthPlaceholderImage } from '@/utils/eventImageFallbacks';

export interface ThreadReviewCardProps {
  review: ReviewWithEngagement;
  author: { name: string; avatar_url?: string };
  /** Artist image, used when the review has no photo. */
  artistImageUrl?: string;
  currentUserId: string;
  /** Opens the review page (details, comments, likes). */
  onOpen: () => void;
  /** Chip text on the image, e.g. "Friend review" on Home, "Review" on Community. */
  chipLabel?: string;
}

/**
 * Review card shaped like ThreadEventCard (image, chip, date badge, title, body, pill
 * actions) so reviews sit naturally in the home thread and Community.
 */
export const ThreadReviewCard: React.FC<ThreadReviewCardProps> = ({
  review,
  author,
  artistImageUrl,
  currentUserId,
  onOpen,
  chipLabel = 'Friend review',
}) => {
  const [likesCount, setLikesCount] = useState(review.likes_count || 0);
  const [commentsCount, setCommentsCount] = useState(review.comments_count || 0);
  const [isLiked, setIsLiked] = useState(!!review.is_liked_by_user);
  const [liking, setLiking] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    ReviewService.getReviewEngagement(review.id, currentUserId)
      .then((e) => {
        if (cancelled || !e) return;
        setLikesCount(e.likes_count);
        setCommentsCount(e.comments_count);
        setIsLiked(e.is_liked_by_user);
      })
      .catch((error) => console.error('Error loading review engagement:', error));
    return () => {
      cancelled = true;
    };
  }, [review.id, currentUserId]);

  const imageUrl = useMemo(() => {
    const raw = review.photos?.[0] || artistImageUrl;
    return (raw ? replaceJambasePlaceholder(raw) : null) || getFallbackEventImage(review.id);
  }, [review.id, review.photos, artistImageUrl]);

  // Event_date is set by the feed mappers but isn't on ReviewWithEngagement.
  const rawEventDate = (review as { Event_date?: string | Date }).Event_date;
  const eventDate = rawEventDate ? new Date(rawEventDate) : null;
  const validDate = eventDate && !Number.isNaN(eventDate.getTime()) ? eventDate : null;
  const title = [review.artist_name, review.venue_name].filter(Boolean).join(' at ') || 'Concert review';
  const rating = typeof review.rating === 'number' ? Math.max(0, Math.min(5, review.rating)) : null;
  const text = review.review_text?.trim();

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUserId || liking) return;
    setLiking(true);
    const next = !isLiked;
    setIsLiked(next);
    setLikesCount((c) => Math.max(0, c + (next ? 1 : -1)));
    try {
      if (next) await ReviewService.likeReview(currentUserId, review.id);
      else await ReviewService.unlikeReview(currentUserId, review.id);
    } catch (error) {
      console.error('Error toggling review like:', error);
      setIsLiked(!next);
      setLikesCount((c) => Math.max(0, c + (next ? -1 : 1)));
    } finally {
      setLiking(false);
    }
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const generic = getFallbackEventImage(review.id);
    if (img.src.includes('Synth_Placeholder')) img.onerror = null;
    else if (!img.src.includes('Generic') && img.src !== generic) img.src = generic;
    else img.src = getSynthPlaceholderImage();
  };

  return (
    <>
      <article
        className="thread-card thread-card--review"
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
          }
        }}
        tabIndex={0}
        role="button"
        aria-label={`Read ${author.name}'s review of ${title}`}
      >
        <div className="thread-card__media">
          <img src={imageUrl} alt="" loading="lazy" onError={handleImageError} />
          <div className="thread-card__scrim" aria-hidden="true" />
          <div className="thread-card__chips">
            <span className="thread-chip" data-reason="review">
              <span className="thread-chip__dot" aria-hidden="true" />
              {chipLabel}
            </span>
          </div>
          {validDate && (
            <div className="thread-card__date" aria-label={format(validDate, 'EEEE, MMMM d')}>
              <span>{format(validDate, 'MMM')}</span>
              <strong>{format(validDate, 'd')}</strong>
              <span>{format(validDate, 'yyyy')}</span>
            </div>
          )}
        </div>

        <div className="thread-card__body">
          <h2 className="thread-card__title line-clamp-2">{title}</h2>

          <div className="thread-card__author">
            {author.avatar_url ? (
              <img src={author.avatar_url} alt="" className="thread-card__avatar" />
            ) : (
              <span className="thread-card__avatar thread-card__avatar--initial" aria-hidden="true">
                {author.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="truncate">{author.name}</span>
            {rating != null && (
              <span className="thread-card__stars" aria-label={`Rated ${rating} out of 5`}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star
                    key={i}
                    size={14}
                    aria-hidden="true"
                    fill={rating >= i - 0.25 ? 'currentColor' : 'none'}
                    className={rating >= i - 0.25 ? undefined : 'is-empty'}
                  />
                ))}
              </span>
            )}
          </div>

          {text && <p className="thread-card__quote line-clamp-3">“{text}”</p>}

          <div className="thread-card__actions">
            <button
              type="button"
              onClick={handleLike}
              className={cn('thread-btn thread-btn--interest', isLiked && 'is-active')}
              aria-pressed={isLiked}
              aria-label={isLiked ? 'Unlike review' : 'Like review'}
            >
              <Heart size={17} strokeWidth={2.4} aria-hidden="true" fill={isLiked ? 'currentColor' : 'none'} />
              {likesCount > 0 ? likesCount : 'Like'}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              className="thread-btn thread-btn--ghost"
              aria-label={`Comments (${commentsCount})`}
            >
              <MessageCircle size={16} strokeWidth={2.4} aria-hidden="true" />
              {commentsCount > 0 ? commentsCount : 'Comment'}
            </button>
            <div className="flex-1" />
            {currentUserId && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShareOpen(true);
                }}
                className="thread-btn thread-btn--ghost thread-btn--share"
                aria-label="Share review"
              >
                <Send size={16} strokeWidth={2.4} aria-hidden="true" />
                <span className="thread-btn__label">Share</span>
              </button>
            )}
          </div>
        </div>
      </article>

      {shareOpen && currentUserId && (
        <ReviewShareModal review={review} currentUserId={currentUserId} isOpen={shareOpen} onClose={() => setShareOpen(false)} />
      )}
    </>
  );
};
