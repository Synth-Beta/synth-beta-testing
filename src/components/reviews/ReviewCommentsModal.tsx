import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send } from 'lucide-react';
import { ReviewService, CommentWithUser } from '@/services/reviewService';

interface ReviewCommentsModalProps {
  reviewId: string | null;
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: string;
}

export function ReviewCommentsModal({ reviewId, isOpen, onClose, currentUserId }: ReviewCommentsModalProps) {
  const [comments, setComments] = useState<CommentWithUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && reviewId) {
      loadComments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, reviewId]);

  const loadComments = async () => {
    if (!reviewId) return;
    try {
      setLoading(true);
      setError(null);
      const result = await ReviewService.getReviewComments(reviewId);
      setComments(result);
    } catch (err) {
      console.error('Failed to load comments', err);
      setError('Failed to load comments');
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!currentUserId || !reviewId || !newComment.trim() || submitting) return;
    try {
      setSubmitting(true);
      const created = await ReviewService.addComment(currentUserId, reviewId, newComment.trim());
      // Optimistically add to local list; minimal user data
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
    } catch (err) {
      console.error('Failed to add comment', err);
      setError('Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Comments</DialogTitle>
          <DialogDescription>Join the discussion for this review.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading comments...
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 py-4">{error}</div>
          ) : comments.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">No comments yet. Be the first to comment!</div>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex items-start gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={c.user.avatar_url || undefined} />
                  <AvatarFallback>{(c.user.name || 'U').slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">{c.user.name || 'User'}</div>
                  <div className="text-sm text-foreground whitespace-pre-wrap">{c.comment_text}</div>
                  <div className="text-xs text-muted-foreground mt-1">{new Date(c.created_at).toLocaleString()}</div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="pt-2 border-t mt-2">
          <div className="flex items-end gap-2">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={currentUserId ? 'Write a comment…' : 'Sign in to comment'}
              disabled={!currentUserId || submitting}
              className="min-h-[72px]"
            />
            <Button onClick={handleAddComment} disabled={!currentUserId || submitting || !newComment.trim()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
