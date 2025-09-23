import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, MessageCircle, Share2, MoreHorizontal, Star, Edit, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReviewWithEngagement, ReviewService, CommentWithUser } from '@/services/reviewService';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send } from 'lucide-react';
import { ShareService } from '@/services/shareService';
import { formatDistanceToNow } from 'date-fns';

interface ReviewCardProps {
  review: ReviewWithEngagement;
  currentUserId?: string;
  onLike?: (reviewId: string, isLiked: boolean) => void;
  onComment?: (reviewId: string) => void;
  onShare?: (reviewId: string) => void;
  onEdit?: (review: ReviewWithEngagement) => void;
  onDelete?: (reviewId: string) => void;
  showEventInfo?: boolean;
}

export function ReviewCard({
  review,
  currentUserId,
  onLike,
  onComment,
  onShare,
  onEdit,
  onDelete,
  showEventInfo = false
}: ReviewCardProps) {
  const [isLiked, setIsLiked] = useState(review.is_liked_by_user || false);
  const [likesCount, setLikesCount] = useState(review.likes_count);
  const [isLiking, setIsLiking] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<CommentWithUser[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLike = async () => {
    if (!currentUserId || isLiking) return;
    
    setIsLiking(true);
    try {
      if (isLiked) {
        await ReviewService.unlikeReview(currentUserId, review.id);
        setLikesCount(prev => Math.max(0, prev - 1));
        setIsLiked(false);
      } else {
        await ReviewService.likeReview(currentUserId, review.id);
        setLikesCount(prev => prev + 1);
        setIsLiked(true);
      }
      
      if (onLike) {
        onLike(review.id, !isLiked);
      }
    } catch (error) {
      console.error('Error toggling like:', error);
    } finally {
      setIsLiking(false);
    }
  };

  const handleComment = async () => {
    // Toggle open; when opening, load comments
    const next = !showComments;
    setShowComments(next);
    if (next && comments.length === 0) {
      try {
        setLoadingComments(true);
        const result = await ReviewService.getReviewComments(review.id);
        setComments(result);
      } finally {
        setLoadingComments(false);
      }
    }
    // Intentionally do not notify parents; keep comment flow self-contained
  };

  const handleAddComment = async () => {
    if (!currentUserId || !newComment.trim() || submitting) return;
    try {
      setSubmitting(true);
      const created = await ReviewService.addComment(currentUserId, review.id, newComment.trim());
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
      setNewComment('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleShare = async () => {
    await ShareService.shareReview(review.id, 'PlusOne Review', review.review_text || undefined);
  };

  const handleEdit = () => {
    if (onEdit) {
      onEdit(review);
    }
  };

  const handleDelete = async () => {
    if (onDelete && window.confirm('Are you sure you want to delete this review?')) {
      onDelete(review.id);
    }
  };

  const isOwner = currentUserId && review.user_id === currentUserId;

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={cn(
          "w-4 h-4",
          i < rating ? "text-yellow-400 fill-current" : "text-gray-300"
        )}
      />
    ));
  };


  useEffect(() => {
    const listener = (e: Event) => {
      e.stopPropagation();
      handleComment();
    };
    const el = document.getElementById(`review-card-${review.id}`);
    el?.addEventListener('toggle-review-comments', listener as EventListener);
    return () => el?.removeEventListener('toggle-review-comments', listener as EventListener);
  }, [review.id, showComments, comments.length]);

  return (
    <Card className="w-full" id={`review-card-${review.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={undefined} />
              <AvatarFallback>
                {review.user_id?.slice(0, 2).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">
                User {review.user_id?.slice(0, 8)}
              </p>
              <div className="flex items-center space-x-2">
                <div className="flex items-center">
                  {renderStars(review.rating)}
                </div>
                <span className="text-xs text-gray-500">
                  {formatDistanceToNow(new Date(review.created_at), { addSuffix: true })}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-1">
            {isOwner && (
              <>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={handleEdit}
                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={handleDelete}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Review Text */}
        {review.review_text && (
          <p className="text-sm text-gray-700 mb-3">{review.review_text}</p>
        )}

        {/* Event Info (if showEventInfo is true) */}
        {showEventInfo && (
          <div className="mb-3 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-900">Event Information</p>
            <p className="text-xs text-gray-600">Event details would be shown here</p>
          </div>
        )}

        {/* Social Actions */}
        <div className="flex items-center justify-between pt-3 border-t">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleLike(); }}
              disabled={!currentUserId || isLiking}
              className={cn(
                "flex items-center space-x-1",
                isLiked && "text-red-500"
              )}
            >
              <Heart
                className={cn(
                  "h-4 w-4",
                  isLiked && "fill-current"
                )}
              />
              <span className="text-sm">{likesCount}</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleComment(); }}
              className="flex items-center space-x-1"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="text-sm">{review.comments_count}</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleShare(); }}
              className="flex items-center space-x-1"
            >
              <Share2 className="h-4 w-4" />
              <span className="text-sm">{review.shares_count}</span>
            </Button>
          </div>
        </div>
      </CardContent>
    {showComments && (
      <div className="px-6 pb-4">
        <div className="mt-3 border-t pt-3 space-y-3">
          {loadingComments ? (
            <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading comments…</div>
          ) : comments.length === 0 ? (
            <div className="text-sm text-muted-foreground">No comments yet. Be the first to comment!</div>
          ) : (
            comments.map((c) => (
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
          <div className="flex items-end gap-2">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={currentUserId ? 'Write a comment…' : 'Sign in to comment'}
              disabled={!currentUserId || submitting}
              className="min-h-[56px]"
            />
            <Button onClick={handleAddComment} disabled={!currentUserId || submitting || !newComment.trim()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    )}
    </Card>
  );
}
