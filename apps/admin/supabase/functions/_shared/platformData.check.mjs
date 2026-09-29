/**
 * Runnable check for the analytics predicates:  node platformData.check.mjs
 *
 * No framework and no Deno — node strips the TS types on import. The first case
 * is the real payload shape that broke production: a totally failed Instagram
 * fetch that the old `stat.value != null` test scored as "has data".
 */
import assert from 'assert';
import {
  describeGraphError,
  hasPositiveValue,
  platformResultHasData,
} from './platformData.ts';

// ── hasPositiveValue ────────────────────────────────────────────────────────
assert.strictEqual(hasPositiveValue(null), false);
assert.strictEqual(hasPositiveValue(undefined), false);
assert.strictEqual(hasPositiveValue(0), false);
assert.strictEqual(hasPositiveValue('0'), false, 'the string "0" is not data');
assert.strictEqual(
  hasPositiveValue('N/A (Instagram impressions unavailable status 400: Graph API error 400)'),
  false,
  'an N/A explanation string is not data'
);
assert.strictEqual(hasPositiveValue('62'), true);
assert.strictEqual(hasPositiveValue('1,234'), true);
assert.strictEqual(hasPositiveValue('4.2%'), true);
assert.strictEqual(hasPositiveValue(328), true);

// ── platformResultHasData: the live failure, verified 2026-09-28 ────────────
const failedInstagram = {
  metrics: { followers: null, reach: null, likes: 0, saves: 0, comments: 0, shares: 0 },
  contentPerformance: [],
  recentPosts: [],
  platformComparison: {
    stats: [
      { label: 'Total Saves', value: '0', subLabel: '0 posts' },
      { label: 'Engagement Rate', value: null },
      { label: 'Profile Views', value: null },
      {
        label: 'Views',
        value: 'N/A (Instagram impressions unavailable status 400: Graph API error 400)',
        subLabel: 'Fallback metric',
      },
    ],
  },
};
assert.strictEqual(
  platformResultHasData(failedInstagram),
  false,
  'a failed fetch must NOT count as data — otherwise it overwrites the saved snapshot with nothing'
);

// A real result still counts, by any one of the four signals.
assert.strictEqual(platformResultHasData({ metrics: { followers: 62 } }), true);
assert.strictEqual(
  platformResultHasData({ platformComparison: { stats: [{ label: 'Followers', value: '62' }] } }),
  true
);
assert.strictEqual(platformResultHasData({ recentPosts: [{ caption: 'hi' }] }), true);
assert.strictEqual(
  platformResultHasData({ contentPerformance: [{ metricValue: '1,204' }] }),
  true
);
assert.strictEqual(platformResultHasData({}), false);

// ── describeGraphError ─────────────────────────────────────────────────────
assert.strictEqual(
  describeGraphError(JSON.stringify({
    error: {
      message: 'Error validating access token: Session has expired',
      type: 'OAuthException',
      code: 190,
      error_subcode: 463,
    },
  })),
  'Error validating access token: Session has expired — code 190 — subcode 463'
);
assert.strictEqual(
  describeGraphError(JSON.stringify({
    error: { message: 'Unsupported get request.', type: 'GraphMethodException', code: 100 },
  })),
  'Unsupported get request. — code 100'
);
// Non-Graph bodies leave the caller's bare status message alone.
assert.strictEqual(describeGraphError('<html>502</html>'), null);
assert.strictEqual(describeGraphError(''), null);
assert.strictEqual(describeGraphError(JSON.stringify({ data: [] })), null);

console.log('✅ platformData checks passed.');
