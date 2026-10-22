/**
 * Run: node --experimental-strip-types --test api/_lib/shareCopy.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starRating, truncateQuote, formatShowDate, eventBubble, reviewBubble } from './shareCopy.ts';

test('starRating draws five symbols with half stars', () => {
  assert.equal(starRating(4.5), '★★★★½');
  assert.equal(starRating(3), '★★★☆☆');
  assert.equal(starRating(0), '☆☆☆☆☆');
  assert.equal(starRating(7), '★★★★★');
});

test('truncateQuote collapses whitespace and cuts long quotes at a word', () => {
  assert.equal(truncateQuote('  a   b  '), 'a b');
  const long = 'This was one of the best shows I have ever been to and the encore went on forever '.repeat(3);
  const cut = truncateQuote(long);
  assert.ok(cut.length <= 91, `length ${cut.length}`);
  assert.ok(cut.endsWith('…'));
  assert.ok(!cut.slice(0, -1).endsWith(' '));
  assert.equal(truncateQuote(null), '');
});

test('formatShowDate uses the show timezone, not UTC', () => {
  assert.equal(formatShowDate('2026-11-08T20:00:00Z'), 'Sun, Nov 8');
  assert.equal(formatShowDate('2026-11-08T03:00:00Z', 'America/Denver'), 'Sat, Nov 7');
  assert.equal(formatShowDate('nope'), '');
  assert.equal(formatShowDate(null), '');
});

test('eventBubble builds title and description from what exists', () => {
  assert.deepEqual(
    eventBubble({ artist: 'Goose', venue: 'Red Rocks', city: 'Morrison', state: 'CO', date: '2026-11-08T20:00:00Z' }),
    { title: 'Goose at Red Rocks', description: 'Sun, Nov 8 · Morrison, CO · on Synth' }
  );
  assert.deepEqual(eventBubble({ title: 'Some Show' }), { title: 'Some Show', description: 'on Synth' });
});

test('reviewBubble names the reviewer and rating, with fallbacks', () => {
  assert.deepEqual(
    reviewBubble({ reviewer: 'Tej', artist: 'Goose', venue: 'Red Rocks', date: '2026-11-08T20:00:00Z', rating: 4.5 }),
    { title: 'Tej rated Goose ★★★★½', description: 'Red Rocks · Sun, Nov 8' }
  );
  assert.deepEqual(reviewBubble({ artist: 'Goose' }), { title: "Someone's review of Goose", description: '' });
});
