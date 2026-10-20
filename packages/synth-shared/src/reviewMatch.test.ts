/**
 * Run: node --experimental-strip-types packages/synth-shared/src/reviewMatch.test.ts
 */
import assert from 'node:assert/strict';
import { reviewEventMatch, reviewQuoteFor } from './reviewMatch.ts';

const review = {
  artist_id: 'x',
  venue_id: 'a',
  review_text: 'Great night',
  artist_performance_feedback: 'Tight set',
  venue_feedback: 'Great sound',
};

// Same artist wins, even at another venue.
assert.equal(reviewEventMatch(review, { artist_id: 'x', venue_id: 'b' }), 'artist');
// Other artist, same venue: pairs only when there is venue text.
assert.equal(reviewEventMatch(review, { artist_id: 'y', venue_id: 'a' }), 'venue');
assert.equal(reviewEventMatch({ ...review, venue_feedback: '  ' }, { artist_id: 'y', venue_id: 'a' }), null);
// Unrelated / missing ids never match; numeric ids compare by value.
assert.equal(reviewEventMatch(review, { artist_id: 'y', venue_id: 'b' }), null);
assert.equal(reviewEventMatch({ artist_id: undefined }, { artist_id: undefined }), null);
assert.equal(reviewEventMatch({ artist_id: '7' }, { artist_id: 7 }), 'artist');

// Quote follows the match, falls back to review_text.
assert.equal(reviewQuoteFor(review, 'artist'), 'Tight set');
assert.equal(reviewQuoteFor(review, 'venue'), 'Great sound');
assert.equal(reviewQuoteFor(review, null), 'Great night');
assert.equal(reviewQuoteFor({ ...review, artist_performance_feedback: '' }, 'artist'), 'Great night');

console.log('reviewMatch OK');
