import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, ChevronDown } from 'lucide-react';
import {
  buildCommentThreads,
  DEFAULT_VISIBLE_REPLIES,
  nextVisibleReplyCount,
} from '@synth/shared';
import { EventCommentsService, EventCommentWithUser } from '@/services/eventCommentsService';
import { CommentMentionText } from '@/components/comments/CommentMentionText';
import {
  buildReplyTarget,
  prepareReplySubmission,
  replyInputPrefill,
  type ReplyTarget,
} from '@/utils/commentDisplay';

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
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [visibleReplies, setVisibleReplies] = useState<Record<string, number>>({});
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (isOpen && eventId) {
      loadComments();
    } else if (!isOpen) {
      setReplyTo(null);
      setNewComment('');
      setVisibleReplies({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, eventId]);

  const threads = useMemo(() => buildCommentThreads(comments), [comments]);

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

  const startReply = (comment: EventCommentWithUser) => {
    if (!currentUserId) return;
    const target = buildReplyTarget(comment as any, comments as any);
    setReplyTo(target);
    setNewComment(replyInputPrefill(target));
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      const len = textareaRef.current?.value.length ?? 0;
      textareaRef.current?.setSelectionRange(len, len);
    });
  };

  const handleAddComment = async () => {
    if (!currentUserId || !eventId || !newComment.trim() || submitting) return;
    try {
      setSubmitting(true);
      const prepared = prepareReplySubmission(newComment, replyTo);
      const created = await EventCommentsService.addEventComment(
        currentUserId,
        eventId,
        prepared.commentText,
        prepared.parentCommentId,
        prepared.mentionedUserIds
      );
      const withUser: EventCommentWithUser = {
        ...created,
        parent_comment_id: created.parent_comment_id ?? prepared.parentCommentId ?? null,
        mentioned_user_ids: prepared.mentionedUserIds,
        user: { id: created.user_id, name: 'You', username: null },
      };
      setComments(prev => [...prev, withUser]);
      if (prepared.parentCommentId) {
        setVisibleReplies((prev) => {
          const thread = buildCommentThreads([...comments, withUser]).find(
            (t) => t.root.id === prepared.parentCommentId
          );
          const total = thread?.replies.length ?? 1;
          return {
            ...prev,
            [prepared.parentCommentId!]: Math.max(prev[prepared.parentCommentId!] ?? DEFAULT_VISIBLE_REPLIES, total),
          };
        });
      }
      setNewComment('');
      setReplyTo(null);
      if (onCommentAdded) onCommentAdded();
    } catch (err) {
      console.error('Failed to add comment', err);
      setError('Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  const renderRow = (c: EventCommentWithUser, isReply: boolean) => (
    <div
      key={c.id}
      className={`flex items-start gap-3 ${isReply ? 'ml-6 sm:ml-10 pl-2' : ''}`}
      style={isReply ? { borderLeft: '2px solid var(--neutral-200)' } : undefined}
    >
      <Avatar className="h-8 w-8">
        <AvatarImage src={c.user.avatar_url || undefined} />
        <AvatarFallback>{(c.user.name || 'U').slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{c.user.name || 'User'}</div>
        <CommentMentionText text={c.comment_text} className="text-sm text-foreground" />
        <div className="flex items-center gap-3 mt-1">
          <div className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</div>
          {currentUserId ? (
            <button
              type="button"
              onClick={() => startReply(c)}
              className="text-xs text-muted-foreground hover:text-foreground"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              Reply
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Event Comments</DialogTitle>
          <DialogDescription>Discuss this event.</DialogDescription>
        </DialogHeader>

        <div
          className="space-y-4 max-h-[60vh] overflow-y-auto pr-1"
          aria-busy={loading || loadingMore || submitting}
          aria-live="polite"
          aria-relevant="additions text"
        >
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground" role="status" aria-live="polite">
              <Loader2 className="h-5 w-5 animate-spin mr-2" aria-hidden="true" /> Loading comments...
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 py-4">{error}</div>
          ) : comments.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">No comments yet. Be the first to comment!</div>
          ) : (
            threads.map((thread) => {
              const totalReplies = thread.replies.length;
              const visible = Math.min(
                visibleReplies[thread.root.id] ?? DEFAULT_VISIBLE_REPLIES,
                totalReplies
              );
              const shown = thread.replies.slice(0, visible);
              return (
                <div key={thread.root.id} className="space-y-3">
                  {renderRow(thread.root, false)}
                  {shown.map((r) => renderRow(r, true))}
                  {visible < totalReplies ? (
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleReplies((prev) => ({
                          ...prev,
                          [thread.root.id]: nextVisibleReplyCount(
                            prev[thread.root.id] ?? DEFAULT_VISIBLE_REPLIES,
                            totalReplies
                          ),
                        }))
                      }
                      className="ml-6 sm:ml-10 text-xs text-muted-foreground"
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    >
                      See More
                    </button>
                  ) : null}
                </div>
              );
            })
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
          {replyTo ? (
            <div className="flex items-center justify-between mb-2 text-xs text-muted-foreground">
              <span>
                Replying to <span style={{ color: 'var(--brand-pink-500)', fontWeight: 500 }}>@{replyTo.username}</span>
              </span>
              <button
                type="button"
                onClick={() => { setReplyTo(null); setNewComment(''); }}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={currentUserId ? (replyTo ? `Reply to @${replyTo.username}…` : 'Write a comment…') : 'Sign in to comment'}
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
