import assert from 'node:assert/strict';
import {
  buildCommentMentionToken,
  buildReplyMentionPrefill,
  extractMentionedUserIds,
  materializeReplyMention,
  parseCommentMentionSegments,
  commentTextToPlain,
} from './commentMentions.ts';

const UID = 'aaaaaaaa-1111-4222-8333-444444444444';

assert.equal(buildCommentMentionToken('lauren', UID), `@[lauren](user:${UID})`);
assert.equal(buildReplyMentionPrefill('lauren'), '@lauren ');

const stored = `${buildCommentMentionToken('lauren', UID)} nice take`;
assert.deepEqual(extractMentionedUserIds(stored), [UID]);
assert.equal(commentTextToPlain(stored), '@lauren nice take');

const segs = parseCommentMentionSegments(stored);
assert.equal(segs.length, 2);
assert.equal(segs[0].type, 'mention');
if (segs[0].type === 'mention') {
  assert.equal(segs[0].username, 'lauren');
  assert.equal(segs[0].userId, UID);
}
assert.equal(segs[1].type, 'text');

assert.equal(
  materializeReplyMention('@lauren hello', { userId: UID, username: 'lauren' }),
  `@[lauren](user:${UID}) hello`
);

console.log('commentMentions: OK');
