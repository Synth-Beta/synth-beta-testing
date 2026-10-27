/**
 * Run: node --experimental-strip-types --test packages/synth-shared/src/reviewVideo.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkReviewVideo, REVIEW_VIDEO_MAX_SECONDS, REVIEW_VIDEO_MAX_MB } from './reviewVideo.ts';

const MB = 1024 * 1024;

test('limits are 30 seconds and 25MB', () => {
  assert.equal(REVIEW_VIDEO_MAX_SECONDS, 30);
  assert.equal(REVIEW_VIDEO_MAX_MB, 25);
});

test('a 20s 10MB clip is fine', () => {
  assert.equal(checkReviewVideo({ durationSec: 20, sizeBytes: 10 * MB }), null);
});

test('too long is rejected with a message', () => {
  assert.match(checkReviewVideo({ durationSec: 45, sizeBytes: 10 * MB }) ?? '', /30 seconds/);
});

test('allows a little rounding over 30s', () => {
  assert.equal(checkReviewVideo({ durationSec: 30.4, sizeBytes: MB }), null);
});

test('too big is rejected with a message', () => {
  assert.match(checkReviewVideo({ durationSec: 10, sizeBytes: 26 * MB }) ?? '', /25MB/);
});

test('unknown duration or size is not held against the user', () => {
  assert.equal(checkReviewVideo({}), null);
});
