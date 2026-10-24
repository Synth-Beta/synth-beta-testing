/**
 * Run: node --experimental-strip-types --test packages/synth-shared/src/spotifySyncGuard.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEmptySpotifySync, streamingRowHasData } from './spotifySyncGuard.ts';

test('no profile and no listening data is an empty (failed) sync', () => {
  assert.equal(isEmptySpotifySync({ hasProfile: false, artistCount: 0, trackCount: 0 }), true);
});

test('any real data is not empty', () => {
  assert.equal(isEmptySpotifySync({ hasProfile: true, artistCount: 0, trackCount: 0 }), false);
  assert.equal(isEmptySpotifySync({ hasProfile: false, artistCount: 3, trackCount: 0 }), false);
  assert.equal(isEmptySpotifySync({ hasProfile: false, artistCount: 0, trackCount: 5 }), false);
});

test('an empty Spotify row (old failed sync) does not count as linked', () => {
  assert.equal(streamingRowHasData({ service_type: 'spotify', a0: null, t0: null, me: null }), false);
  assert.equal(streamingRowHasData({ service_type: 'spotify', a0: { name: 'SZA' }, t0: null, me: null }), true);
  assert.equal(streamingRowHasData({ service_type: 'spotify', a0: null, t0: { name: 'x' }, me: null }), true);
  assert.equal(streamingRowHasData({ service_type: 'spotify', a0: null, t0: null, me: { id: 'u1' } }), true);
  assert.equal(streamingRowHasData({ service_type: 'apple-music', a0: null, t0: null, me: null }), true);
});
