/**
 * Run: node --experimental-strip-types packages/synth-shared/src/justAnnouncedFeed.test.ts
 */

import assert from 'node:assert/strict';
import { weaveJustAnnouncedIntoFeed } from './justAnnouncedFeed.ts';

type Item = { id: string; fan?: boolean; label?: string };
const feed = (n: number): Item[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}` }));
const weave = (events: Item[], ja: Item[], spacing?: number, pinLimit?: number) =>
  weaveJustAnnouncedIntoFeed(
    events,
    ja,
    (e) => e.id,
    (e) => Boolean(e.fan),
    (e) => ({ ...e, label: 'JA' }),
    spacing,
    pinLimit
  );
const ids = (items: Item[]) => items.map((i) => i.id);

// Nothing new: feed untouched.
assert.deepEqual(weave(feed(3), []), feed(3));

// Already in the feed: stays in place, gets the badge, no duplicate.
const inPlace = weave(feed(3), [{ id: 'r1' }]);
assert.deepEqual(ids(inPlace), ['r0', 'r1', 'r2']);
assert.equal(inPlace[1].label, 'JA');
assert.equal(inPlace[0].label, undefined);

// Own-artist shows pinned on top (up to the limit), others woven every `spacing`.
const woven = weave(feed(6), [{ id: 'f0', fan: true }, { id: 'f1', fan: true }, { id: 'n0' }], 3, 1);
assert.deepEqual(ids(woven), ['f0', 'r0', 'r1', 'r2', 'f1', 'r3', 'r4', 'r5', 'n0']);
assert.ok(woven.filter((w) => w.id.startsWith('f') || w.id.startsWith('n')).every((w) => w.label === 'JA'));

// Overflow appended, never dropped.
assert.deepEqual(ids(weave(feed(1), [{ id: 'n0' }, { id: 'n1' }], 6)), ['r0', 'n0', 'n1']);

// Empty ranked feed still shows new shows.
assert.deepEqual(ids(weave([], [{ id: 'f0', fan: true }, { id: 'n0' }])), ['f0', 'n0']);

console.log('weaveJustAnnouncedIntoFeed: all checks passed');
