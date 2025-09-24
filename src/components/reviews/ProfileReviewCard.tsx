import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, Images, MessageCircle, Heart, Share2, Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReviewService, type CommentWithUser } from '@/services/reviewService';
import { ShareService } from '@/services/shareService';

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
}

function normalizeRating(r: number | 'good' | 'okay' | 'bad'): number {
  if (typeof r === 'number') return Math.max(1, Math.min(5, Math.round(r)));
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
  initialCommentsCount = 0
}: ProfileReviewCardProps) {
  const stars = normalizeRating(rating);
  const [isLiked, setIsLiked] = React.useState<boolean>(initialIsLiked);
  const [likesCount, setLikesCount] = React.useState<number>(initialLikesCount);
  const [commentsCount, setCommentsCount] = React.useState<number>(initialCommentsCount);
  const [showComments, setShowComments] = React.useState<boolean>(false);
  const [comments, setComments] = React.useState<CommentWithUser[]>([]);
  const [loadingComments, setLoadingComments] = React.useState<boolean>(false);
  const [newComment, setNewComment] = React.useState<string>('');
  const [submitting, setSubmitting] = React.useState<boolean>(false);

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
      await ShareService.shareReview(reviewId, 'PlusOne Review', reviewText || undefined);
    } catch {}
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
        setIsLiked(engagement.is_liked_by_user);
      }
    })();
  }, [reviewId, currentUserId]);

  return (
    <Card className={cn('border-gray-200', className)}>
      <CardHeader className="pb-3">
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
        {/* Stars */}
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }, (_, i) => (
            <Star
              key={i}
              className={cn('w-5 h-5', i < stars ? 'text-yellow-400 fill-current' : 'text-gray-300')}
            />
          ))}
        </div>

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

        {/* Photos placeholder */}
        <div className="rounded-lg border p-4 bg-gray-50">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Images className="w-4 h-4" />
            <span>Photos</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="aspect-square rounded bg-white border flex items-center justify-center text-xs text-gray-400">Add photo</div>
            <div className="aspect-square rounded bg-white border flex items-center justify-center text-xs text-gray-400">Add photo</div>
            <div className="aspect-square rounded bg-white border flex items-center justify-center text-xs text-gray-400">Add photo</div>
          </div>
        </div>

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


