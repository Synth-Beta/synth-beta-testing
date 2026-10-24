/**
 * Run: node --experimental-strip-types --test api/_lib/spotifySync.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEmptySpotifySync } from './spotifySync.ts';

test('no profile and no listening data is an empty (failed) sync', () => {
  assert.equal(isEmptySpotifySync({ hasProfile: false, artistCount: 0, trackCount: 0 }), true);
});

test('any real data is not empty', () => {
  assert.equal(isEmptySpotifySync({ hasProfile: true, artistCount: 0, trackCount: 0 }), false);
  assert.equal(isEmptySpotifySync({ hasProfile: false, artistCount: 3, trackCount: 0 }), false);
  assert.equal(isEmptySpotifySync({ hasProfile: false, artistCount: 0, trackCount: 5 }), false);
});
