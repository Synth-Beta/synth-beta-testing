/**
 * Node smoke test for DC week helpers + pin validation (LOI-566).
 * Run: node --experimental-strip-types packages/synth-shared/src/weeklyFeatured.selftest.ts
 */
import assert from 'node:assert/strict';
import {
  dcWeekId,
  dcWeekStartDate,
  featuredShowChatKey,
  validateFeaturedPins,
  FEATURED_MAX,
  DEMO_FEATURED_WEEK_ID,
  DEMO_FEATURED_WEEK_START,
} from './weeklyFeatured.ts';

const wed = new Date('2026-08-26T15:00:00.000Z');
assert.equal(dcWeekStartDate(wed), '2026-08-24');
assert.equal(DEMO_FEATURED_WEEK_START, '2026-08-24');
assert.equal(DEMO_FEATURED_WEEK_ID, '2026-W35');
assert.equal(dcWeekId(wed), DEMO_FEATURED_WEEK_ID);
assert.match(dcWeekId(wed), /^2026-W\d{2}$/);

assert.equal(
  featuredShowChatKey('2026-W35', 'evt-1'),
  'featured_show:2026-W35:evt-1'
);

const tooMany = Array.from({ length: FEATURED_MAX + 1 }, (_, i) => ({
  eventId: `e${i}`,
  genre: i % 2 ? 'indie' : 'jazz',
}));
assert.equal(validateFeaturedPins(tooMany).ok, false);

const okPublish = Array.from({ length: 12 }, (_, i) => ({
  eventId: `e${i}`,
  genre: i % 2 ? 'indie' : 'jazz',
}));
assert.equal(validateFeaturedPins(okPublish, { forPublish: true }).ok, true);

const singleGenre = Array.from({ length: 12 }, (_, i) => ({
  eventId: `e${i}`,
  genre: 'indie',
}));
assert.equal(validateFeaturedPins(singleGenre, { forPublish: true }).ok, false);

console.log('weeklyFeatured.selftest: ok');
