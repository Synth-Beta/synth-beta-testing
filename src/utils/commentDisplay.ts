import {
  buildReplyMentionPrefill,
  materializeReplyMention,
  extractMentionedUserIds,
  commentTextToPlain,
  resolveThreadRootId,
  type ThreadableComment,
} from '@synth/shared';

export type CommentAuthor = {
  id: string;
  name: string;
  username?: string | null;
  avatar_url?: string;
};

export type DisplayComment = ThreadableComment & {
  user_id: string;
  comment_text: string;
  mentioned_user_ids?: string[] | null;
  user: CommentAuthor;
};

export type ReplyTarget = {
  commentId: string;
  /** Thread root. Kept so older callers can still group a reply. */
  rootParentId: string;
  userId: string;
  username: string;
  /** Plain-text snippet of the comment being answered, so it stays visible in the composer. */
  preview: string;
};

/** Prefer @username; fall back to a handle derived from display name. */
export function mentionHandleForUser(user: {
  username?: string | null;
  name?: string | null;
  user_id?: string;
}): string {
  const fromUsername = user.username?.replace(/^@/, '').trim();
  if (fromUsername) return fromUsername;
  const fromName = (user.name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);
  if (fromName) return fromName;
  return 'user';
}

export function buildReplyTarget(
  comment: DisplayComment,
  all: DisplayComment[]
): ReplyTarget {
  const byId = new Map(all.map((c) => [c.id, c]));
  const rootParentId = resolveThreadRootId(comment, byId);
  const username = mentionHandleForUser({
    username: comment.user?.username,
    name: comment.user?.name,
    user_id: comment.user_id,
  });
  const preview = commentTextToPlain(comment.comment_text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
  return {
    commentId: comment.id,
    rootParentId,
    userId: comment.user_id,
    username,
    preview,
  };
}

export function prepareReplySubmission(
  rawText: string,
  replyTo: ReplyTarget | null
): { commentText: string; parentCommentId?: string; mentionedUserIds: string[] } {
  const materialized = materializeReplyMention(rawText.trim(), replyTo);
  const mentionedUserIds = extractMentionedUserIds(materialized);
  // Ensure the reply-to user is always referenced even if they deleted the @handle
  if (replyTo?.userId && !mentionedUserIds.includes(replyTo.userId)) {
    mentionedUserIds.unshift(replyTo.userId);
  }
  return {
    commentText: materialized,
    // Direct parent, so the reply renders under the comment that was answered.
    parentCommentId: replyTo?.commentId,
    mentionedUserIds,
  };
}

export function replyInputPrefill(replyTo: ReplyTarget): string {
  return buildReplyMentionPrefill(replyTo.username);
}
