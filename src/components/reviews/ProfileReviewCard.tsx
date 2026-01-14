import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, Images, MessageCircle, Heart, Share2, Loader2, Send, Play, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReviewService, type CommentWithUser, type ReviewWithEngagement } from '@/services/reviewService';
import { supabase } from '@/integrations/supabase/client';
import { ArtistFollowButton } from '@/components/artists/ArtistFollowButton';
import { getFallbackEventImage } from '@/utils/eventImageFallbacks';
import { ReviewShareModal } from '@/components/reviews/ReviewShareModal';

interface ReviewEventMeta {
  event_name: string;
  event_date: string;
  artist_name?: string | null;
  artist_id?: string | null;
  venue_name?: string | null;
  venue_id?: string | null;
}

export interface ProfileReviewCardProps {
  title?: string;
  rating: number | 'good' | 'okay' | 'bad';
  reviewText?: string | null;
  event: ReviewEventMeta;
  onOpenArtist?: (artistId?: string | null, artistName?: string | null) => void;
  onOpenVenue?: (venueId?: string | null, venueName?: string | null) => void;
  className?: string;
  reviewId: string;
  currentUserId?: string;
  initialIsLiked?: boolean;
  initialLikesCount?: number;
  initialCommentsCount?: number;
  initialSharesCount?: number;
  photos?: string[];
  videos?: string[];
  showCommentsInitially?: boolean;
}

function normalizeRating(r: number | 'good' | 'okay' | 'bad'): number {
  if (typeof r === 'number') {
    const clamped = Math.max(1, Math.min(5, r));
    return Math.round(clamped * 2) / 2; // preserve .5 increments
  }
  if (r === 'good') return 5;
  if (r === 'okay') return 3;
  if (r === 'bad') return 1;
  return 0;
}

export function ProfileReviewCard({
  title,
  rating,
  reviewText,
  event,
  onOpenArtist,
  onOpenVenue,
  className,
  reviewId,
  currentUserId,
  initialIsLiked = false,
  initialLikesCount = 0,
  initialCommentsCount = 0,
  initialSharesCount = 0,
  photos: initialPhotos,
  videos: initialVideos,
  showCommentsInitially = false
}: ProfileReviewCardProps) {
  // Display stars should honor .5 increments. Prefer category averages when available.
  const baseStars = normalizeRating(rating);
  const getDisplayStars = () => {
    const parts: number[] = [];
    ['artistPerformance', 'production', 'venue', 'location', 'value'].forEach((key) => {
      const candidate = (categoryRatings as any)[key];
      if (typeof candidate === 'number' && candidate > 0) {
        parts.push(candidate);
      }
    });
    if (parts.length === 0) return baseStars;
    const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
    return Math.round(avg * 2) / 2;
  };
  const [isLiked, setIsLiked] = React.useState<boolean>(initialIsLiked);
  const [likesCount, setLikesCount] = React.useState<number>(initialLikesCount);
  const [commentsCount, setCommentsCount] = React.useState<number>(initialCommentsCount);
  const [sharesCount, setSharesCount] = React.useState<number>(initialSharesCount);
  const [showComments, setShowComments] = React.useState<boolean>(showCommentsInitially);
  const [comments, setComments] = React.useState<CommentWithUser[]>([]);
  const [loadingComments, setLoadingComments] = React.useState<boolean>(false);
  const [newComment, setNewComment] = React.useState<string>('');
  const [submitting, setSubmitting] = React.useState<boolean>(false);
  const [media, setMedia] = React.useState<{ photos: string[]; videos: string[] }>({ photos: initialPhotos || [], videos: initialVideos || [] });
  const [shareModalOpen, setShareModalOpen] = React.useState<boolean>(false);
  const [reviewEventId, setReviewEventId] = React.useState<string | null>(null);
  const [categoryRatings, setCategoryRatings] = React.useState<{
    artistPerformance?: number;
    production?: number;
    venue?: number;
    location?: number;
    value?: number;
  }>({});
  const [artistAvatar, setArtistAvatar] = React.useState<string | null>(null);

  const toggleComments = async () => {
    const next = !showComments;
    setShowComments(next);
    if (next && comments.length === 0) {
      try {
        setLoadingComments(true);
        const result = await ReviewService.getReviewComments(reviewId);
        setComments(result);
        setCommentsCount(result.length);
      } finally {
        setLoadingComments(false);
      }
    }
  };

  const toggleLike = async () => {
    if (!currentUserId) return;
    try {
      if (isLiked) {
        await ReviewService.unlikeReview(currentUserId, reviewId);
        setLikesCount(prev => Math.max(0, prev - 1));
        setIsLiked(false);
      } else {
        await ReviewService.likeReview(currentUserId, reviewId);
        setLikesCount(prev => prev + 1);
        setIsLiked(true);
      }
    } catch {}
  };

  const handleShare = async () => {
    // Ensure event_id is fetched before opening modal
    if (!reviewEventId) {
      try {
        const { data } = await (supabase as any)
          .from('reviews')
          .select('event_id')
          .eq('id', reviewId)
          .maybeSingle();
        if (data?.event_id) {
          setReviewEventId(data.event_id);
        }
      } catch (error) {
        console.error('Error fetching event_id for share:', error);
      }
    }
    setShareModalOpen(true);
  };

  const addComment = async () => {
    if (!currentUserId || !newComment.trim() || submitting) return;
    try {
      setSubmitting(true);
      const created = await ReviewService.addComment(currentUserId, reviewId, newComment.trim());
      setComments(prev => [
        ...prev,
        {
          ...created,
          user: {
            id: created.user_id,
            name: 'You',
            avatar_url: undefined
          }
        } as CommentWithUser
      ]);
      setCommentsCount(prev => prev + 1);
      setNewComment('');
    } finally {
      setSubmitting(false);
    }
  };

  // Keep counts fresh when the dialog/card mounts
  React.useEffect(() => {
    (async () => {
      const engagement = await ReviewService.getReviewEngagement(reviewId, currentUserId);
      if (engagement) {
        setLikesCount(engagement.likes_count);
        setCommentsCount(engagement.comments_count);
        setSharesCount(engagement.shares_count);
        setIsLiked(engagement.is_liked_by_user);
      }
    })();
  }, [reviewId, currentUserId]);

  // Load comments if showCommentsInitially is true
  React.useEffect(() => {
    if (showCommentsInitially && comments.length === 0) {
      (async () => {
        try {
          setLoadingComments(true);
          const result = await ReviewService.getReviewComments(reviewId);
          setComments(result);
          setCommentsCount(result.length);
        } catch (error) {
          console.error('Error loading comments:', error);
        } finally {
          setLoadingComments(false);
        }
      })();
    }
  }, [showCommentsInitially, reviewId, comments.length]);

  // Lazy-load media and category ratings for this review (and artist avatar)
  React.useEffect(() => {
    (async () => {
      try {
        // fetch media, ratings, and event_id
        const { data } = await (supabase as any)
          .from('reviews')
          .select('photos, videos, artist_performance_rating, production_rating, venue_rating, location_rating, value_rating, event_id')
          .eq('id', reviewId)
          .maybeSingle();
        if (data) {
          const nextPhotos = Array.isArray(data.photos) ? data.photos : [];
          const nextVideos = Array.isArray(data.videos) ? data.videos : [];
          if (nextPhotos.length || nextVideos.length) {
            setMedia({ photos: nextPhotos, videos: nextVideos });
          }
          if (data.event_id) {
            setReviewEventId(data.event_id);
          }
          setCategoryRatings({
            artistPerformance: typeof data.artist_performance_rating === 'number' ? data.artist_performance_rating : undefined,
            production: typeof data.production_rating === 'number' ? data.production_rating : undefined,
            venue: typeof data.venue_rating === 'number' ? data.venue_rating : undefined,
            location: typeof data.location_rating === 'number' ? data.location_rating : undefined,
            value: typeof data.value_rating === 'number' ? data.value_rating : undefined,
          });
        }
      } catch {}

      try {
        // best-effort artist avatar
        if (event.artist_name) {
          const avatarSel = await (supabase as any)
            .from('artist_profile')
            .select('image_url')
            .ilike('name', `%${event.artist_name}%`)
            .limit(1);
          const img = Array.isArray(avatarSel.data) && avatarSel.data[0]?.image_url;
          if (img) setArtistAvatar(img);
        }
      } catch {}
    })();
  }, [reviewId, event.artist_name]);

  const userProvidedHero = media.photos.length > 0;
  const fallbackHeroImage = React.useMemo(
    () => getFallbackEventImage(`${event.event_name}-${event.event_date}-${reviewId}`),
    [event.event_name, event.event_date, reviewId]
  );
  const heroImage = userProvidedHero ? media.photos[0] : fallbackHeroImage;
  const heroAltText = `${event.event_name || title || 'Event'} hero image`;
  const heroWrapperClass = cn(
    'relative w-full overflow-hidden',
    userProvidedHero ? 'bg-black' : 'h-40 sm:h-52'
  );
  const heroImageClass = cn(
    'w-full transition-transform duration-500',
    userProvidedHero ? 'max-h-[60vh] object-contain mx-auto' : 'h-full object-cover brightness-[0.95]'
  );

  return (
    <Card className={cn('border-gray-200 overflow-hidden', className)}>
      <div className={heroWrapperClass}>
        <img
          src={heroImage}
          alt={heroAltText}
          className={heroImageClass}
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" aria-hidden="true" />
        <div className="absolute top-3 left-3 flex items-center gap-2 text-white z-10">
          <Sparkles className="w-4 h-4" />
          <span className="text-xs tracking-wide uppercase">Review</span>
        </div>
        <div
          className={cn(
            'absolute z-10 rounded-full ring-4 ring-white/80 overflow-hidden bg-white/80 flex items-center justify-center text-base md:text-lg font-semibold shadow-md transition-all',
            userProvidedHero
              ? 'top-3 left-3 md:left-4 translate-y-12 h-12 w-12 md:h-14 md:w-14'
              : 'bottom-3 left-3 h-16 w-16'
          )}
        >
          {artistAvatar ? (
            <img src={artistAvatar} alt={event.artist_name || 'Artist'} className="h-full w-full object-cover" />
          ) : (
            <span>{(event.artist_name || title || 'A').slice(0, 1).toUpperCase()}</span>
          )}
        </div>
      </div>

      <CardHeader className="pt-10 pb-3">
        <CardTitle className="text-lg">
          {title || event.event_name}
        </CardTitle>
        <div className="mt-2 flex items-center flex-wrap gap-2 text-xs">
          {event.artist_name && (
            <>
              <Badge
                variant="secondary"
                className="cursor-pointer"
                onClick={() => onOpenArtist?.(event.artist_id || null, event.artist_name || null)}
              >
                {event.artist_name}
              </Badge>
              {currentUserId && (
                <ArtistFollowButton
                  artistName={event.artist_name}
                  userId={currentUserId}
                  variant="ghost"
                  size="sm"
                  showFollowerCount={false}
                  className="h-6 text-xs"
                />
              )}
            </>
          )}
          <span className="text-gray-500">
            {new Date(event.event_date).toLocaleDateString()}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Overall Stars (supports half-star display) */}
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }, (_, i) => {
            const starIndex = i + 1;
            const stars = getDisplayStars();
            const isFull = stars >= starIndex;
            const isHalf = !isFull && stars >= starIndex - 0.5;
            return (
              <div key={i} className="relative w-5 h-5">
                <Star className="w-5 h-5 text-gray-300" />
                {(isHalf || isFull) && (
                  <div className={cn('absolute left-0 top-0 h-full overflow-hidden pointer-events-none', isFull ? 'w-full' : 'w-1/2')}>
                    <Star className="w-5 h-5 text-yellow-400 fill-current" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Category chips */}
        {['artistPerformance', 'production', 'venue', 'location', 'value'].some(
          (key) => typeof (categoryRatings as any)[key] === 'number'
        ) && (
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'artistPerformance', label: 'Artist' },
              { key: 'production', label: 'Production' },
              { key: 'venue', label: 'Venue' },
              { key: 'location', label: 'Location' },
              { key: 'value', label: 'Value' }
            ].map(({ key, label }) => {
              const value = (categoryRatings as any)[key];
              if (typeof value !== 'number' || Number.isNaN(value)) return null;
              return (
                <Badge key={key} variant="outline" className="gap-1">
                  <Star className="w-3 h-3 text-yellow-400" />
                  <span className="text-xs">
                    {label} {value.toFixed(1)}
                  </span>
                </Badge>
              );
            })}
          </div>
        )}

        {/* Social Actions */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={toggleLike} className={cn('flex items-center gap-1', isLiked && 'text-red-500')}>
              <Heart className={cn('w-4 h-4', isLiked && 'fill-current')} />
              <span className="text-sm">{likesCount}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={toggleComments} className="flex items-center gap-1">
              <MessageCircle className="w-4 h-4" />
              <span className="text-sm">{commentsCount}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleShare} className="flex items-center gap-1">
              <Share2 className="w-4 h-4" />
              <span className="text-sm">Share</span>
            </Button>
          </div>
        </div>

        {/* Review text */}
        {reviewText && (
          <div className="rounded-lg border p-4 bg-white">
            <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{reviewText}</div>
          </div>
        )}

        {/* Media gallery (show remaining photos/videos after hero) */}
        {((media.photos.length > 1) || media.videos.length > 0) && (
          <div className="rounded-lg border p-3 bg-gray-50">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Images className="w-4 h-4" />
              <span>Media</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {media.photos.slice(1, 7).map((src, idx) => (
                <div key={`p-${idx}`} className="aspect-square rounded overflow-hidden bg-white">
                  <img src={src} alt={`${event.event_name} photo ${idx + 2}`} className="h-full w-full object-cover" loading="lazy" />
                </div>
              ))}
              {media.videos.slice(0, 2).map((src, idx) => (
                <div key={`v-${idx}`} className="aspect-square rounded overflow-hidden bg-black relative">
                  <video src={src} className="h-full w-full object-cover" muted playsInline />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-white/80 rounded-full p-2"><Play className="w-4 h-4" /></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comments */}
        {showComments && (
          <div className="rounded-lg border p-4 bg-gray-50">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MessageCircle className="w-4 h-4" />
              <span>Comments</span>
            </div>
            <div className="mt-3 space-y-3">
              {loadingComments ? (
                <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading comments…</div>
              ) : comments.length === 0 ? (
                <div className="text-sm text-gray-500">No comments yet.</div>
              ) : (
                comments.map(c => (
                  <div key={c.id} className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-xs">
                      {(c.user.name || 'U').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{c.user.name || 'User'}</div>
                      <div className="text-sm text-foreground whitespace-pre-wrap">{c.comment_text}</div>
                      <div className="text-xs text-muted-foreground mt-1">{new Date(c.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className="flex-1 border rounded px-3 py-2 text-sm"
                placeholder={currentUserId ? 'Write a comment…' : 'Sign in to comment'}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                disabled={!currentUserId || submitting}
              />
              <Button size="sm" onClick={addComment} disabled={!currentUserId || submitting || !newComment.trim()}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Review Share Modal */}
      {shareModalOpen && currentUserId && (
        <ReviewShareModal
          review={{
            id: reviewId,
            user_id: currentUserId,
            event_id: reviewEventId || '', // Use fetched event_id from review data, or empty string if not available (required by type)
            rating: normalizeRating(rating),
            review_text: reviewText || null,
            is_public: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            likes_count: likesCount,
            comments_count: commentsCount,
            shares_count: sharesCount,
            is_liked_by_user: isLiked,
            reaction_emoji: '',
            photos: media.photos,
            videos: media.videos,
            mood_tags: [],
            genre_tags: [],
            context_tags: [],
            artist_name: event.artist_name || null,
            artist_id: event.artist_id || null,
            venue_name: event.venue_name || null,
            venue_id: event.venue_id || null,
          } as ReviewWithEngagement}
          currentUserId={currentUserId}
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          onShareComplete={() => {
            // Update local share count after successful share
            setSharesCount(prev => prev + 1);
          }}
        />
      )}
    </Card>
  );
}


