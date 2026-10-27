/**
 * Run: npx tsx packages/synth-shared/src/reviewHighlights.test.ts
 */
import assert from 'node:assert/strict';
import { summarizeReviewHighlights } from './reviewHighlights.ts';

const A = 'artist-1';
const V = 'venue-1';
const long = (s: string) => `${s} ${'and it was a great night overall'.repeat(1)}`;

// Newest first.
const rows = [
  // Newest: low artist rating with text -> counts in the average, never quoted.
  { artist_id: A, venue_id: V, artist_performance_rating: 2, venue_rating: 5, review_text: long('Band was sloppy'), venue_feedback: long('Room sounded incredible') },
  // Good artist rating, artist feedback present -> artist quote (feedback beats review text).
  { artist_id: A, venue_id: V, artist_performance_rating: 5, venue_rating: 2, artist_performance_feedback: long('Tightest set I have seen'), review_text: long('Overall text'), venue_feedback: long('Venue was too crowded') },
  // Overall rating only (older review) -> counts for the artist, not the venue.
  { artist_id: A, venue_id: V, rating: 4, review_text: long('Older review text') },
  // Venue rating but no venue_feedback -> venue average only.
  { artist_id: null, venue_id: V, venue_rating: 4, review_text: long('Talking about the band here') },
];

const h = summarizeReviewHighlights(rows, [A], [V]);
const artist = h.artists.get(A)!;
const venue = h.venues.get(V)!;

assert.equal(artist.avgRating, Math.round(((2 + 5 + 4) / 3) * 10) / 10);
assert.ok(artist.quote?.startsWith('Tightest set'), 'artist quote from a >=4 artist rating, feedback first');
assert.equal(venue.avgRating, Math.round(((5 + 2 + 4) / 3) * 10) / 10, 'venue avg uses venue_rating only');
assert.ok(venue.quote?.startsWith('Room sounded'), 'venue quote from venue_feedback with venue rating >=4');

// A venue never quotes review_text (band talk), and short text is never quoted.
const onlyText = summarizeReviewHighlights(
  [{ venue_id: V, venue_rating: 5, review_text: long('Band talk only') }, { artist_id: A, artist_performance_rating: 5, review_text: 'Too short' }],
  [A],
  [V]
);
assert.equal(onlyText.venues.get(V)!.quote, null);
assert.equal(onlyText.artists.get(A)!.quote, null);

// Long quotes are trimmed on a word boundary with an ellipsis; no counts are exposed.
const big = summarizeReviewHighlights([{ artist_id: A, artist_performance_rating: 5, artist_performance_feedback: 'word '.repeat(80) }], [A], []);
const q = big.artists.get(A)!.quote!;
assert.ok(q.length <= 141 && q.endsWith('…'));
assert.deepEqual(Object.keys(big.artists.get(A)!).sort(), ['avgRating', 'quote']);

console.log('reviewHighlights OK');
