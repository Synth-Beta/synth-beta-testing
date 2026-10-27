import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, X } from 'lucide-react';
import {
  buildCommentThreads,
  DEFAULT_VISIBLE_REPLIES,
  nextVisibleReplyCount,
  visibleReplyCountForFocus,
} from '@synth/shared';
import { ReviewService, CommentWithUser } from '@/services/reviewService';
import { CommentMentionText } from '@/components/comments/CommentMentionText';
import {
  buildReplyTarget,
  prepareReplySubmission,
  replyInputPrefill,
  type ReplyTarget,
} from '@/utils/commentDisplay';

interface ReviewCommentsModalProps {
  reviewId: string | null;
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: string;
  onCommentAdded?: () => void;
  onCommentsLoaded?: (count: number) => void;
  /** Deep-link: expand thread and scroll this comment into view */
  focusCommentId?: string | null;
}

export function ReviewCommentsModal({
  reviewId,
  isOpen,
  onClose,
  currentUserId,
  onCommentAdded,
  onCommentsLoaded,
  focusCommentId,
}: ReviewCommentsModalProps) {
  const [comments, setComments] = useState<CommentWithUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [visibleReplies, setVisibleReplies] = useState<Record<string, number>>({});
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const didFocusScroll = useRef(false);

  useEffect(() => {
    if (isOpen && reviewId) {
      didFocusScroll.current = false;
      loadComments();
    } else if (!isOpen) {
      setReplyTo(null);
      setNewComment('');
      setVisibleReplies({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, reviewId]);

  const threads = useMemo(() => buildCommentThreads(comments), [comments]);

  useEffect(() => {
    if (!focusCommentId || comments.length === 0) return;
    const next: Record<string, number> = {};
    for (const thread of threads) {
      if (thread.root.id === focusCommentId) {
        next[thread.root.id] = Math.max(
          visibleReplies[thread.root.id] ?? DEFAULT_VISIBLE_REPLIES,
          DEFAULT_VISIBLE_REPLIES
        );
        continue;
      }
      const needed = visibleReplyCountForFocus(thread.replies, focusCommentId);
      if (needed > 0 && thread.replies.some((r) => r.id === focusCommentId)) {
        next[thread.root.id] = Math.max(visibleReplies[thread.root.id] ?? DEFAULT_VISIBLE_REPLIES, needed);
      }
    }
    if (Object.keys(next).length > 0) {
      setVisibleReplies((prev) => ({ ...prev, ...next }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCommentId, comments, threads]);

  useEffect(() => {
    if (!isOpen || !focusCommentId || loading || didFocusScroll.current) return;
    const el = listRef.current?.querySelector(`[data-comment-id="${focusCommentId}"]`);
    if (el) {
      didFocusScroll.current = true;
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }, [isOpen, focusCommentId, loading, visibleReplies, comments]);

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

  const openProfile = (profileUserId?: string | null) => {
    if (!profileUserId) return;
    onClose();
    window.dispatchEvent(
      new CustomEvent('open-user-profile', { detail: { userId: profileUserId } })
    );
  };

  const startReply = (comment: CommentWithUser) => {
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

  const cancelReply = () => {
    setReplyTo(null);
    setNewComment('');
  };

  const handleAddComment = async () => {
    if (!currentUserId || !reviewId || !newComment.trim() || submitting) return;
    try {
      setSubmitting(true);
      setError(null);
      const prepared = prepareReplySubmission(newComment, replyTo);
      const created = await ReviewService.addComment(
        currentUserId,
        reviewId,
        prepared.commentText,
        prepared.parentCommentId,
        prepared.mentionedUserIds
      );

      const newCommentWithUser: CommentWithUser = {
        ...created,
        parent_comment_id: created.parent_comment_id ?? prepared.parentCommentId ?? null,
        mentioned_user_ids: prepared.mentionedUserIds,
        user: {
          id: currentUserId,
          name: 'You',
          username: null,
          avatar_url: undefined,
        },
      };

      setComments((prev) => [...prev, newCommentWithUser]);

      if (prepared.parentCommentId) {
        setVisibleReplies((prev) => {
          const thread = buildCommentThreads([...comments, newCommentWithUser]).find(
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleAddComment();
    }
  };

  const getVisibleCount = (rootId: string, total: number) => {
    const current = visibleReplies[rootId] ?? DEFAULT_VISIBLE_REPLIES;
    return Math.min(current, total);
  };

  const renderCommentBody = (comment: CommentWithUser, isReply: boolean) => {
    const profileUserId = comment.user_id || comment.user?.id;
    return (
      <div
        data-comment-id={comment.id}
        className={`flex items-start gap-3 p-3 bg-gray-50 rounded-lg ${isReply ? 'ml-6 sm:ml-10' : ''}`}
        style={isReply ? { borderLeft: '2px solid var(--neutral-200)' } : undefined}
      >
        <button
          type="button"
          onClick={() => openProfile(profileUserId)}
          aria-label={`View ${comment.user.name || 'user'}'s profile`}
          className="shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-500"
          style={{ cursor: 'pointer', padding: 0, border: 'none', background: 'transparent' }}
        >
          <Avatar className="w-8 h-8">
            <AvatarImage src={comment.user.avatar_url} />
            <AvatarFallback className="text-xs">
              {(comment.user.name || 'U').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <button
              type="button"
              onClick={() => openProfile(profileUserId)}
              className="font-medium text-sm text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-500"
              style={{ cursor: 'pointer', padding: 0, border: 'none', background: 'transparent' }}
            >
              {comment.user.name || 'User'}
            </button>
            <span className="text-xs text-gray-500">
              {new Date(comment.created_at).toLocaleString()}
            </span>
          </div>
          <CommentMentionText
            text={comment.comment_text}
            className="text-sm text-gray-900"
            onMentionClick={openProfile}
          />
          {currentUserId ? (
            <button
              type="button"
              onClick={() => startReply(comment)}
              className="mt-1 text-xs text-gray-500 hover:text-gray-700"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              Reply
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        hideCloseButton
        className="fixed inset-0 z-[100] max-w-none w-full max-h-full m-0 p-0 overflow-hidden flex flex-col rounded-none"
        style={{
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          transform: 'none',
          width: '100vw',
          maxWidth: '100vw',
          maxHeight: '100vh',
          borderRadius: 0,
          backgroundColor: 'var(--neutral-50)',
        }}
      >
        <div
          className="sticky top-0 z-10"
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            minHeight: 'calc(env(safe-area-inset-top, 0px) + 68px)',
            backgroundColor: 'var(--neutral-50)',
            borderBottom: '1px solid var(--neutral-200)',
            boxShadow: '0 4px 4px 0 var(--shadow-color)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              height: '68px',
              paddingLeft: 'var(--spacing-screen-margin-x, 20px)',
              paddingRight: 'var(--spacing-screen-margin-x, 20px)',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ flex: 1 }}>
              <DialogHeader
                className="p-0"
                style={{
                  margin: 0,
                  padding: 0,
                }}
              >
                <DialogTitle>Review Comments</DialogTitle>
                <DialogDescription>
                  Share your thoughts about this review
                </DialogDescription>
              </DialogHeader>
            </div>
            <DialogClose asChild>
              <button
                type="button"
                aria-label="Close comments"
                className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-500"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  border: '1px solid transparent',
                  backgroundColor: 'var(--neutral-50)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </DialogClose>
          </div>
        </div>
        
        <div
          ref={listRef}
          className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4"
          style={{
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 'var(--spacing-grouped, 24px)',
          }}
        >
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
              {threads.map((thread) => {
                const totalReplies = thread.replies.length;
                const visible = getVisibleCount(thread.root.id, totalReplies);
                const shown = thread.replies.slice(0, visible);
                const hasMore = visible < totalReplies;
                return (
                  <div key={thread.root.id} className="space-y-2">
                    {renderCommentBody(thread.root, false)}
                    {shown.map((reply) => renderCommentBody(reply, true))}
                    {hasMore ? (
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
                        className="ml-6 sm:ml-10 text-xs text-gray-500 hover:text-gray-700"
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                      >
                        See More
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        <div
          className="border-t border-gray-200 p-4 bg-white"
          style={{
            // Full-screen overlay covers the nav; keep breathing room as internal whitespace.
            paddingBottom: 'calc(var(--spacing-bottom-nav-gap, 32px) + env(safe-area-inset-bottom, 0px))',
          }}
        >
          {replyTo ? (
            <div className="flex items-center justify-between mb-2 text-xs text-gray-500">
              <span>
                Replying to <span style={{ color: 'var(--brand-pink-500)', fontWeight: 500 }}>@{replyTo.username}</span>
              </span>
              <button
                type="button"
                onClick={cancelReply}
                className="text-gray-500 hover:text-gray-700"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          ) : null}
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={
                currentUserId
                  ? replyTo
                    ? `Reply to @${replyTo.username}...`
                    : 'Write a comment...'
                  : 'Sign in to comment'
              }
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
          <p className="hidden md:block text-xs text-gray-500 mt-2">
            Press Ctrl+Enter to submit
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
