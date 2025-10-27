import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, ChevronDown } from 'lucide-react';
import { EventCommentsService, EventCommentWithUser } from '@/services/eventCommentsService';

interface EventCommentsModalProps {
  eventId: string | null;
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: string;
  onCommentAdded?: () => void;
  onCommentsLoaded?: (count: number) => void;
}

export function EventCommentsModal({ eventId, isOpen, onClose, currentUserId, onCommentAdded, onCommentsLoaded }: EventCommentsModalProps) {
  const [comments, setComments] = useState<EventCommentWithUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (isOpen && eventId) {
      loadComments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, eventId]);

  const loadComments = async () => {
    if (!eventId) return;
    try {
      setLoading(true);
      setError(null);
      const result = await EventCommentsService.getEventComments(eventId, 20, 0);
      setComments(result.comments);
      setHasMore(result.hasMore);
      if (onCommentsLoaded) onCommentsLoaded(result.comments.length);
    } catch (err) {
      console.error('Failed to load event comments', err);
      setError('Failed to load comments');
    } finally {
      setLoading(false);
    }
  };

  const loadMoreComments = async () => {
    if (!eventId || loadingMore || !hasMore) return;
    try {
      setLoadingMore(true);
      const result = await EventCommentsService.getEventComments(eventId, 20, comments.length);
      setComments(prev => [...prev, ...result.comments]);
      setHasMore(result.hasMore);
    } catch (err) {
      console.error('Failed to load more comments', err);
      setError('Failed to load more comments');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleAddComment = async () => {
    if (!currentUserId || !eventId || !newComment.trim() || submitting) return;
    try {
      setSubmitting(true);
      const created = await EventCommentsService.addEventComment(currentUserId, eventId, newComment.trim());
      setComments(prev => [
        ...prev,
        {
          ...created,
          user: { id: created.user_id, name: 'You' }
        } as EventCommentWithUser
      ]);
      setNewComment('');
      if (onCommentAdded) onCommentAdded();
    } catch (err) {
      console.error('Failed to add comment', err);
      setError('Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Event Comments</DialogTitle>
          <DialogDescription>Discuss this event.</DialogDescription>
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
          {hasMore && !loading && (
            <div className="flex justify-center pt-4">
              <Button 
                variant="outline" 
                size="sm"
                onClick={loadMoreComments}
                disabled={loadingMore}
                className="text-sm"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading...
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-2" />
                    Load More Comments
                  </>
                )}
              </Button>
            </div>
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
            <Button onClick={handleAddComment} disabled={!currentUserId || submitting || !newComment.trim()} className="bg-pink-500 hover:bg-pink-600 text-white">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


