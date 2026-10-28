import assert from 'node:assert/strict';
import {
  buildCommentThreads,
  resolveThreadRootId,
  visibleReplyCountForFocus,
  nextVisibleReplyCount,
  DEFAULT_VISIBLE_REPLIES,
  SEE_MORE_REPLY_BATCH,
} from './commentThreads.ts';

type C = { id: string; parent_comment_id?: string | null; created_at: string };

const root: C = { id: 'r1', parent_comment_id: null, created_at: '2026-01-01T00:00:00Z' };
const a: C = { id: 'a', parent_comment_id: 'r1', created_at: '2026-01-01T01:00:00Z' };
const b: C = { id: 'b', parent_comment_id: 'r1', created_at: '2026-01-01T02:00:00Z' };
const c: C = { id: 'c', parent_comment_id: 'r1', created_at: '2026-01-01T03:00:00Z' };
const nestedLegacy: C = {
  id: 'n',
  parent_comment_id: 'a',
  created_at: '2026-01-01T04:00:00Z',
};

const threads = buildCommentThreads([root, b, a, c, nestedLegacy]);
assert.equal(threads.length, 1);
assert.equal(threads[0].root.id, 'r1');
assert.deepEqual(
  threads[0].replies.map((r) => r.id),
  ['a', 'b', 'c', 'n']
);

const byId = new Map([root, a, b, c, nestedLegacy].map((x) => [x.id, x]));
assert.equal(resolveThreadRootId(a, byId), 'r1');
assert.equal(resolveThreadRootId(nestedLegacy, byId), 'r1');
assert.equal(resolveThreadRootId(root, byId), 'r1');

assert.equal(visibleReplyCountForFocus([a, b, c], null), DEFAULT_VISIBLE_REPLIES);
assert.equal(visibleReplyCountForFocus([a], 'a'), 1);
// Focus on 3rd reply → one See More batch past the default first reply (capped at total)
assert.equal(
  visibleReplyCountForFocus([a, b, c, nestedLegacy], 'c'),
  Math.min(1 + SEE_MORE_REPLY_BATCH, 4)
);
assert.equal(nextVisibleReplyCount(1, 12), 1 + SEE_MORE_REPLY_BATCH);
assert.equal(nextVisibleReplyCount(11, 12), 12);

console.log('commentThreads: OK');
