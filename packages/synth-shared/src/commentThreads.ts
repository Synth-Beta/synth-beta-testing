/**
 * Flattened Instagram-style comment threads.
 * Replies always hang under a single root parent (no nested indentation).
 */

export type ThreadableComment = {
  id: string;
  parent_comment_id?: string | null;
  created_at: string;
};

export type CommentThread<T extends ThreadableComment> = {
  root: T;
  replies: T[];
};

export const DEFAULT_VISIBLE_REPLIES = 1;
export const SEE_MORE_REPLY_BATCH = 5;

/** Root id for a reply target: the top-level comment that owns the thread. */
export function resolveThreadRootId<T extends ThreadableComment>(
  target: T,
  byId?: Map<string, T>
): string {
  if (!target.parent_comment_id) return target.id;
  if (!byId) return target.parent_comment_id;
  // Walk up in case legacy data nested more than one level
  let current: T | undefined = target;
  const seen = new Set<string>();
  while (current?.parent_comment_id) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    const parent = byId.get(current.parent_comment_id);
    if (!parent) return current.parent_comment_id;
    current = parent;
  }
  return current?.id ?? target.parent_comment_id;
}

export function buildCommentThreads<T extends ThreadableComment>(
  comments: T[]
): CommentThread<T>[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const roots: T[] = [];
  const repliesByRoot = new Map<string, T[]>();

  for (const comment of comments) {
    if (!comment.parent_comment_id) {
      roots.push(comment);
      continue;
    }
    const rootId = resolveThreadRootId(comment, byId);
    const list = repliesByRoot.get(rootId) ?? [];
    list.push(comment);
    repliesByRoot.set(rootId, list);
  }

  roots.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return roots.map((root) => {
    const replies = (repliesByRoot.get(root.id) ?? []).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    return { root, replies };
  });
}

/** How many replies should be visible so `focusId` is included (batch of 5 after the first). */
export function visibleReplyCountForFocus(
  replies: ThreadableComment[],
  focusId: string | null | undefined,
  minimum = DEFAULT_VISIBLE_REPLIES
): number {
  if (!focusId || replies.length === 0) return Math.min(minimum, replies.length);
  const index = replies.findIndex((r) => r.id === focusId);
  if (index < 0) return Math.min(minimum, replies.length);
  if (index < minimum) return Math.min(minimum, replies.length);
  // Reveal in batches of SEE_MORE_REPLY_BATCH after the first
  const beyondFirst = index + 1 - DEFAULT_VISIBLE_REPLIES;
  const batches = Math.ceil(beyondFirst / SEE_MORE_REPLY_BATCH);
  return Math.min(
    DEFAULT_VISIBLE_REPLIES + batches * SEE_MORE_REPLY_BATCH,
    replies.length
  );
}

export function nextVisibleReplyCount(
  current: number,
  total: number
): number {
  return Math.min(current + SEE_MORE_REPLY_BATCH, total);
}
