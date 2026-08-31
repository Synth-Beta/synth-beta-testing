// Run: node scripts/test-sync-helpers.mjs
import assert from 'node:assert/strict';
import { sameValue } from './sync-helpers.mjs';

// --- sameValue --------------------------------------------------------------
assert.equal(sameValue('Union Stage', 'Union Stage'), true);
assert.equal(sameValue('Union Stage', 'Union Stage DC'), false);
assert.equal(sameValue(null, undefined), true, 'null and undefined are the same absence');
assert.equal(sameValue(null, ''), false, 'empty string is a real value, not absence');
assert.equal(sameValue(['rock', 'indie'], ['rock', 'indie']), true);
assert.equal(sameValue(['rock', 'indie'], ['indie', 'rock']), false, 'order matters; merge preserves it');
assert.equal(sameValue(['rock'], ['rock', 'indie']), false, 'a newly merged genre is a real change');
assert.equal(sameValue(1, '1'), false, 'type change counts as a change (errs toward writing)');
assert.equal(sameValue(false, null), false);

// --- the guard the sync actually applies ------------------------------------
// Mirrors upsertArtists3NF: write only if some field differs from the stored row.
const hasRealChange = (existing, update) =>
  Object.keys(update).some((k) => !sameValue(existing?.[k], update[k]));

const stored = { id: 'a1', name: 'Phish', image_url: null, genres: ['rock'] };

assert.equal(
  hasRealChange(stored, { name: 'Phish', image_url: null, genres: ['rock'] }),
  false,
  'identical payload must not write — this is the whole point of the change'
);
assert.equal(
  hasRealChange(stored, { name: 'Phish', image_url: 'https://x/y.jpg', genres: ['rock'] }),
  true,
  'a newly arrived image must still write'
);
assert.equal(
  hasRealChange(stored, { name: 'Phish', genres: ['rock', 'jam'] }),
  true,
  'a merged genre must still write'
);
assert.equal(
  hasRealChange(undefined, { name: 'Phish' }),
  true,
  'no stored row yet means write'
);

console.log('ok — sync-helpers');

// --- stripServerOwned / isUnchanged -----------------------------------------
// Regression: extractVenueData / extractArtistData put a fresh last_synced_at in
// every payload, plus hardcoded num_upcoming_events: 0 and verified: false.
// Without stripping, the guard never fires AND the write clobbers server state.
import { stripServerOwned, isUnchanged } from './sync-helpers.mjs';

const jambasePayload = {
  name: 'The Fillmore',
  city: 'San Francisco',
  latitude: 37.7841,
  last_synced_at: '2026-08-31T23:07:21.738Z', // fresh on every extract
  num_upcoming_events: 0,                     // trigger-maintained in the DB
  verified: false,                            // admin-set in the DB
  typical_genres: null,                       // aggregated in the DB
  identifier: 'jambase:12345',                // rewritten by the DB trigger
};

const storedVenue = {
  name: 'The Fillmore',
  city: 'San Francisco',
  latitude: 37.7841,
  last_synced_at: '2026-08-30T04:00:00.000Z',
  num_upcoming_events: 47,
  verified: true,
  typical_genres: ['rock', 'indie'],
  identifier: 'the_fillmore',
};

const stripped = stripServerOwned(jambasePayload);
for (const k of ['last_synced_at', 'num_upcoming_events', 'verified', 'typical_genres', 'identifier']) {
  assert.equal(k in stripped, false, `${k} must not reach the UPDATE`);
}
assert.deepEqual(stripped, { name: 'The Fillmore', city: 'San Francisco', latitude: 37.7841 });

assert.equal(
  isUnchanged(storedVenue, jambasePayload),
  false,
  'unstripped payload always looks changed — this was the bug'
);
assert.equal(
  isUnchanged(storedVenue, stripped),
  true,
  'stripped payload matching stored data must skip the write'
);
assert.equal(
  isUnchanged(storedVenue, stripServerOwned({ ...jambasePayload, city: 'Oakland' })),
  false,
  'a real field change must still write'
);
assert.equal(isUnchanged(undefined, stripped), false, 'no stored row means write');

console.log('ok — stripServerOwned / isUnchanged');
