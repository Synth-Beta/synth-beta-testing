/**
 * Run: node --experimental-strip-types packages/synth-shared/src/naturalWeave.test.ts
 */
import assert from 'node:assert/strict';
import { planNaturalWeave, weaveNaturally } from './naturalWeave.ts';

type Ev = { id: number; artist: string };
const events: Ev[] = Array.from({ length: 60 }, (_, i) => ({ id: i, artist: `a${i}` }));
const extras = Array.from({ length: 10 }, (_, i) => `x${i}`);
const opts = { seed: 'user-1:2026-10-19:reviews', firstAt: 3, minGap: 4, maxGap: 8 };

// 1. Never two extras in a row, never one before the first event.
const woven = weaveNaturally(events, extras, opts);
assert.equal(woven[0].kind, 'event');
for (let i = 1; i < woven.length; i++) {
  assert.ok(!(woven[i].kind === 'extra' && woven[i - 1].kind === 'extra'), 'extras must not touch');
}

// 2. Gaps vary (not a fixed every-Nth) and stay within range.
const at = [...planNaturalWeave(events, extras, opts).keys()].sort((a, b) => a - b);
const gaps = at.slice(1).map((v, i) => v - at[i]);
assert.ok(gaps.every((g) => g >= 4 && g <= 8), `gaps in range: ${gaps}`);
assert.ok(new Set(gaps).size > 1, `gaps should vary: ${gaps}`);

// 3. Same seed => same layout. Loading more events never moves cards already placed.
const short = planNaturalWeave(events.slice(0, 25), extras, opts);
const long = planNaturalWeave(events, extras, opts);
for (const [i, x] of short) assert.equal(long.get(i), x, 'prefix layout must be stable');

// 4. Extras that don't fit wait (not dumped at the end).
const few = weaveNaturally(events.slice(0, 5), extras, opts);
assert.ok(few.filter((e) => e.kind === 'extra').length <= 1);

// 5. A related extra jumps to right after its event when it's inside the gap.
const relOpts = {
  ...opts,
  relatesTo: (x: string, e: Ev) => x === 'x1' && e.artist === 'a' + (at[0] + 2),
};
const rel = planNaturalWeave(events, extras, relOpts);
assert.equal(rel.get(at[0] + 2), 'x1', 'related extra anchors to its event');

// 6. Different seeds give different layouts.
const other = [...planNaturalWeave(events, extras, { ...opts, seed: 'user-2:2026-10-19:reviews' }).keys()];
assert.notDeepEqual(other, at);

console.log('naturalWeave OK', { at, gaps });
