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
  onCommentAdded?: () => void;
  onCommentsLoaded?: (count: number) => void;
}

export function ReviewCommentsModal({ reviewId, isOpen, onClose, currentUserId, onCommentAdded, onCommentsLoaded }: ReviewCommentsModalProps) {
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
    if (!reviewId) {
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const result = await ReviewService.getReviewComments(reviewId);
      setComments(result);
      if (onCommentsLoaded) onCommentsLoaded(result.length);
    } catch (err) {
      console.error('Failed to load review comments', err);
      setError('Failed to load comments');
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!currentUserId || !reviewId || !newComment.trim() || submitting) return;
    try {
      setSubmitting(true);
      setError(null);
      const created = await ReviewService.addComment(currentUserId, reviewId, newComment.trim());
      
      // Add the new comment to the list with user info
      const newCommentWithUser: CommentWithUser = {
        ...created,
        user: {
          id: currentUserId,
          name: 'You',
          avatar_url: undefined
        }
      };
      
      setComments(prev => [...prev, newCommentWithUser]);
      setNewComment('');
      
      if (onCommentAdded) onCommentAdded();
    } catch (err) {
      console.error('Failed to add comment', err);
      setError('Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleAddComment();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="fixed inset-0 z-[100] max-w-none w-full h-full m-0 p-0 overflow-hidden flex flex-col rounded-none"
        style={{
          left: 0,
          top: 0,
          transform: 'none',
          width: '100vw',
          height: '100vh',
          maxWidth: '100vw',
          maxHeight: '100vh',
          borderRadius: 0,
          backgroundColor: 'var(--neutral-50)',
        }}
      >
        <DialogHeader
          className="px-4 py-3 border-b sticky top-0 z-10"
          style={{
            borderColor: 'var(--neutral-200)',
            backgroundColor: 'var(--neutral-50)',
          }}
        >
          <DialogTitle>Review Comments</DialogTitle>
          <DialogDescription>
            Share your thoughts about this review
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Loading comments...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-600">
              <p>{error}</p>
              <Button variant="outline" onClick={loadComments} className="mt-2">
                Try Again
              </Button>
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No comments yet.</p>
              <p className="text-sm">Be the first to share your thoughts!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={comment.user.avatar_url} />
                    <AvatarFallback className="text-xs">
                      {(comment.user.name || 'U').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{comment.user.name || 'User'}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(comment.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                      {comment.comment_text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="border-t border-gray-200 p-4 bg-white">
          <div className="flex gap-2">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={currentUserId ? 'Write a comment...' : 'Sign in to comment'}
              disabled={!currentUserId || submitting}
              className="min-h-[60px] resize-none"
            />
            <Button 
              onClick={handleAddComment} 
              disabled={!currentUserId || submitting || !newComment.trim()}
              className="px-3"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Press Ctrl+Enter to submit
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}