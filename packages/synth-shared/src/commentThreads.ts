/**
 * Comment threads. A reply hangs under the comment that was answered
 * (its parent_comment_id), so the parent stays on screen and the reply
 * sits directly beneath it. The visible window is the most recent replies,
 * not the oldest — a new reply is the one under its parent.
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

export type CommentNode<T extends ThreadableComment> = {
  comment: T;
  replies: CommentNode<T>[];
};

function byCreatedAt<T extends ThreadableComment>(a: T, b: T): number {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

/** Tree of direct replies. A reply to a reply nests under that reply. */
export function buildCommentTree<T extends ThreadableComment>(
  comments: T[]
): CommentNode<T>[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const childMap = new Map<string, T[]>();
  const roots: T[] = [];

  for (const comment of comments) {
    const parentId = comment.parent_comment_id;
    const parent =
      parentId && parentId !== comment.id ? byId.get(parentId) : undefined;
    if (!parent) {
      roots.push(comment);
      continue;
    }
    const list = childMap.get(parent.id) ?? [];
    list.push(comment);
    childMap.set(parent.id, list);
  }

  const toNode = (comment: T, seen: Set<string>): CommentNode<T> => {
    if (seen.has(comment.id)) return { comment, replies: [] };
    const nextSeen = new Set(seen);
    nextSeen.add(comment.id);
    const replies = (childMap.get(comment.id) ?? [])
      .slice()
      .sort(byCreatedAt)
      .map((child) => toNode(child, nextSeen));
    return { comment, replies };
  };

  roots.sort(byCreatedAt);
  return roots.map((root) => toNode(root, new Set()));
}

export type FlatCommentItem<T extends ThreadableComment> =
  | { kind: 'comment'; comment: T; depth: number }
  | { kind: 'seeMore'; parentId: string; depth: number; hiddenCount: number };

/**
 * Depth-first list. Each comment is followed immediately by its most recent
 * visible replies, so a new reply renders under the comment it answers.
 * Older replies stay behind See More, which comes after that subtree.
 */
export function flattenVisibleComments<T extends ThreadableComment>(
  nodes: CommentNode<T>[],
  visibleCounts: Record<string, number>,
  depth = 0
): FlatCommentItem<T>[] {
  const items: FlatCommentItem<T>[] = [];
  for (const node of nodes) {
    items.push({ kind: 'comment', comment: node.comment, depth });
    const total = node.replies.length;
    if (total === 0) continue;
    const visible = Math.min(
      visibleCounts[node.comment.id] ?? DEFAULT_VISIBLE_REPLIES,
      total
    );
    const shown = node.replies.slice(total - visible);
    items.push(...flattenVisibleComments(shown, visibleCounts, depth + 1));
    const hidden = total - shown.length;
    if (hidden > 0) {
      items.push({
        kind: 'seeMore',
        parentId: node.comment.id,
        depth: depth + 1,
        hiddenCount: hidden,
      });
    }
  }
  return items;
}

/**
 * How many trailing replies each ancestor must show so `focusId` is on screen
 * under its parent. Does not open unrelated branches.
 */
export function visibleCountsForFocus<T extends ThreadableComment>(
  roots: CommentNode<T>[],
  focusId: string | null | undefined
): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!focusId) return counts;

  const walk = (nodes: CommentNode<T>[], parentId: string | null): boolean => {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const hit =
        node.comment.id === focusId || walk(node.replies, node.comment.id);
      if (!hit) continue;
      if (parentId) {
        const needed = nodes.length - i;
        counts[parentId] = Math.max(counts[parentId] ?? 0, needed);
      }
      return true;
    }
    return false;
  };

  walk(roots, null);
  return counts;
}

export function mergeVisibleReplyCounts(
  prev: Record<string, number>,
  needed: Record<string, number>
): Record<string, number> {
  let changed = false;
  const next = { ...prev };
  for (const [id, count] of Object.entries(needed)) {
    const merged = Math.max(prev[id] ?? DEFAULT_VISIBLE_REPLIES, count);
    if (next[id] !== merged) {
      next[id] = merged;
      changed = true;
    }
  }
  return changed ? next : prev;
}
