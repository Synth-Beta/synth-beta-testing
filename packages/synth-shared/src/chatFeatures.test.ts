/**
 * Checks for the Phase 3 chat feature logic that can be exercised without a database:
 * reaction grouping, quote previews, and the typing-indicator wording.
 *
 * Run: node --experimental-strip-types packages/synth-shared/src/chatFeatures.test.ts
 */

import assert from 'node:assert/strict';
import { summarizeReactions, type MessageReactionRow } from './chatReactions.ts';
import { quotePreview } from './chatCore.ts';
import { formatTypingIndicator } from './chatPresence.ts';

const ME = 'user-me';
const THEM = 'user-them';
const THIRD = 'user-third';

function reactions() {
  const rows: MessageReactionRow[] = [
    { message_id: 'm1', user_id: ME, emoji: '❤️' },
    { message_id: 'm1', user_id: THEM, emoji: '❤️' },
    { message_id: 'm1', user_id: THIRD, emoji: '🔥' },
    { message_id: 'm2', user_id: THEM, emoji: '😂' },
  ];

  const summary = summarizeReactions(rows, ME);

  const m1 = summary.get('m1')!;
  assert.equal(m1.length, 2, 'two distinct emoji on m1');
  // Sorted by count desc: ❤️ (2) before 🔥 (1).
  assert.equal(m1[0]!.emoji, '❤️');
  assert.equal(m1[0]!.count, 2);
  assert.equal(m1[0]!.reactedByMe, true);
  assert.equal(m1[1]!.emoji, '🔥');
  assert.equal(m1[1]!.count, 1);
  assert.equal(m1[1]!.reactedByMe, false, 'someone else reacted, not me');

  const m2 = summary.get('m2')!;
  assert.equal(m2[0]!.count, 1);
  assert.equal(m2[0]!.reactedByMe, false);

  // A realtime INSERT can race the initial fetch and deliver the same row twice.
  // The count must not double.
  const duplicated = summarizeReactions(
    [
      { message_id: 'm3', user_id: THEM, emoji: '👍' },
      { message_id: 'm3', user_id: THEM, emoji: '👍' },
    ],
    ME
  );
  assert.equal(duplicated.get('m3')![0]!.count, 1, 'duplicate row must not double the count');

  // Ties break alphabetically so the row does not reorder between renders.
  const tied = summarizeReactions(
    [
      { message_id: 'm4', user_id: ME, emoji: '🔥' },
      { message_id: 'm4', user_id: THEM, emoji: '❤️' },
    ],
    ME
  );
  const order = tied.get('m4')!.map((r) => r.emoji);
  assert.deepEqual(order, [...order].sort((a, b) => a.localeCompare(b)), 'tied counts sort stably');

  assert.equal(summarizeReactions([], ME).size, 0);
  console.log('  reactions: grouping, self-flag, dedupe, stable order');
}

function quotes() {
  assert.equal(quotePreview({ content: 'see you there', message_type: 'text' }), 'see you there');
  assert.equal(quotePreview({ content: 'anything', message_type: 'image' }), 'Photo');
  assert.equal(quotePreview({ content: '', message_type: 'event_share' }), 'Shared an event');
  assert.equal(quotePreview({ content: '', message_type: 'review_share' }), 'Shared a review');
  assert.equal(quotePreview({ content: '   ', message_type: 'text' }), 'Message');

  // Newlines collapse so a quote bar stays one line.
  assert.equal(quotePreview({ content: 'a\n\nb', message_type: 'text' }), 'a b');

  const long = 'x'.repeat(500);
  const preview = quotePreview({ content: long, message_type: 'text' });
  assert.equal(preview.length, 120, 'truncated to 119 chars plus ellipsis');
  assert.ok(preview.endsWith('…'));
  console.log('  quotes: labels, whitespace collapse, truncation');
}

function typing() {
  assert.equal(formatTypingIndicator([]), '');
  assert.equal(formatTypingIndicator([{ userId: 'a', name: 'Alex' }]), 'Alex is typing…');
  assert.equal(
    formatTypingIndicator([
      { userId: 'a', name: 'Alex' },
      { userId: 'b', name: 'Sam' },
    ]),
    'Alex and Sam are typing…'
  );
  assert.equal(
    formatTypingIndicator([
      { userId: 'a', name: 'Alex' },
      { userId: 'b', name: 'Sam' },
      { userId: 'c', name: 'Jo' },
    ]),
    '3 people are typing…'
  );
  console.log('  typing: 0/1/2/many wording');
}

reactions();
quotes();
typing();
console.log('chatFeatures: all checks passed');
