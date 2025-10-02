import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, Images, MessageCircle, Heart, Share2, Loader2, Send, Play, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReviewService, type CommentWithUser } from '@/services/reviewService';
import { ShareService } from '@/services/shareService';
import { supabase } from '@/integrations/supabase/client';

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
    if (typeof (categoryRatings.performance) === 'number' && categoryRatings.performance > 0) parts.push(categoryRatings.performance);
    if (typeof (categoryRatings.venue) === 'number' && categoryRatings.venue > 0) parts.push(categoryRatings.venue);
    if (typeof (categoryRatings.overall) === 'number' && categoryRatings.overall > 0) parts.push(categoryRatings.overall);
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
  const [categoryRatings, setCategoryRatings] = React.useState<{ performance?: number; venue?: number; overall?: number }>({});
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

  const share = async () => {
    try {
      console.log('🔍 ProfileReviewCard: Sharing review', { reviewId });
      const url = await ShareService.shareReview(reviewId, 'PlusOne Review', reviewText || undefined);
      
      // Record the share in the database
      if (currentUserId) {
        try {
          await ReviewService.shareReview(currentUserId, reviewId);
          // Update local share count
          setSharesCount(prev => prev + 1);
        } catch (shareError) {
          console.error('❌ ProfileReviewCard: Error recording share:', shareError);
        }
      }
    } catch (error) {
      console.error('❌ ProfileReviewCard: Error sharing review:', error);
    }
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
        // fetch media and ratings
        const { data } = await (supabase as any)
          .from('user_reviews')
          .select('photos, videos, performance_rating, venue_rating_new, overall_experience_rating')
          .eq('id', reviewId)
          .maybeSingle();
        if (data) {
          const nextPhotos = Array.isArray(data.photos) ? data.photos : [];
          const nextVideos = Array.isArray(data.videos) ? data.videos : [];
          if (nextPhotos.length || nextVideos.length) {
            setMedia({ photos: nextPhotos, videos: nextVideos });
          }
          setCategoryRatings({
            performance: typeof data.performance_rating === 'number' ? data.performance_rating : undefined,
            venue: typeof data.venue_rating_new === 'number' ? data.venue_rating_new : undefined,
            overall: typeof data.overall_experience_rating === 'number' ? data.overall_experience_rating : undefined,
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

  const hasHero = media.photos.length > 0;

  return (
    <Card className={cn('border-gray-200 overflow-hidden', className)}>
      {/* Brand header - only show when there is no photo to hero */}
      {!hasHero && (
        <div className="h-32 w-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-purple-600 relative">
          <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_20%,white_0%,transparent_30%),radial-gradient(circle_at_80%_30%,white_0%,transparent_35%)]" />
          <div className="absolute top-3 left-3 flex items-center gap-2 text-white">
            <Sparkles className="w-4 h-4" />
            <span className="text-xs tracking-wide">Review</span>
          </div>
          {/* Artist avatar */}
          <div className="absolute -bottom-8 left-4 h-16 w-16 rounded-full ring-4 ring-white overflow-hidden bg-white/80 flex items-center justify-center text-lg font-semibold">
            {artistAvatar ? (
              <img src={artistAvatar} alt={event.artist_name || 'Artist'} className="h-full w-full object-cover" />
            ) : (
              <span>{(event.artist_name || title || 'A').slice(0,1).toUpperCase()}</span>
            )}
          </div>
        </div>
      )}

      {/* Hero image showcasing user's experience (first photo). Use object-contain to avoid cropping. */}
      {hasHero && (
        <div className="w-full overflow-hidden bg-black relative">
          {/* Overlay brand + avatar on top of the image */}
          <div className="absolute top-2 left-2 z-10 flex items-center gap-2 text-white/95">
            <Sparkles className="w-4 h-4" />
            <span className="text-xs tracking-wide">Review</span>
          </div>
          <div className="absolute top-2 left-2 md:left-4 translate-y-10 z-10 h-12 w-12 md:h-14 md:w-14 rounded-full ring-4 ring-white/80 overflow-hidden bg-white/80 flex items-center justify-center text-base md:text-lg font-semibold">
            {artistAvatar ? (
              <img src={artistAvatar} alt={event.artist_name || 'Artist'} className="h-full w-full object-cover" />
            ) : (
              <span>{(event.artist_name || title || 'A').slice(0,1).toUpperCase()}</span>
            )}
          </div>
          <img
            src={media.photos[0]}
            alt={`${event.event_name} photo 1`}
            className="w-full max-h-[60vh] object-contain"
            loading="lazy"
          />
        </div>
      )}

      <CardHeader className="pt-10 pb-3">
        <CardTitle className="text-lg">
          {title || event.event_name}
        </CardTitle>
        <div className="mt-2 flex items-center flex-wrap gap-2 text-xs">
          {event.artist_name && (
            <Badge
              variant="secondary"
              className="cursor-pointer"
              onClick={() => onOpenArtist?.(event.artist_id || null, event.artist_name || null)}
            >
              {event.artist_name}
            </Badge>
          )}
          {event.venue_name && (
            <Badge
              variant="outline"
              className="cursor-pointer"
              onClick={() => onOpenVenue?.(event.venue_id || null, event.venue_name || null)}
            >
              {event.venue_name}
            </Badge>
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
        {(categoryRatings.performance || categoryRatings.venue || categoryRatings.overall) && (
          <div className="flex flex-wrap gap-2">
            {typeof categoryRatings.performance === 'number' && (
              <Badge variant="outline" className="gap-1">
                <Star className="w-3 h-3 text-yellow-400" />
                <span className="text-xs">Performance {categoryRatings.performance.toFixed(1)}</span>
              </Badge>
            )}
            {typeof categoryRatings.venue === 'number' && (
              <Badge variant="outline" className="gap-1">
                <Star className="w-3 h-3 text-yellow-400" />
                <span className="text-xs">Venue {categoryRatings.venue.toFixed(1)}</span>
              </Badge>
            )}
            {typeof categoryRatings.overall === 'number' && (
              <Badge variant="outline" className="gap-1">
                <Star className="w-3 h-3 text-yellow-400" />
                <span className="text-xs">Experience {categoryRatings.overall.toFixed(1)}</span>
              </Badge>
            )}
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
            <Button variant="ghost" size="sm" onClick={share} className="flex items-center gap-1">
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
    </Card>
  );
}


