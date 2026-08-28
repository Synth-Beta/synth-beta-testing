/**
 * Lightweight self-checks for LOI-571 density helpers (no Jest required).
 * Run: npx tsx src/services/homeDensityService.selftest.ts
 */
import {
  clampFeaturedBand,
  getHomeWarmT1Scorecard,
  orderFeaturedByCollisionPotential,
  recordHomeWarmT1Instrument,
} from './homeDensityService';
import type { WeeklyFeaturedShow } from './weeklyFeaturedService';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function show(partial: Partial<WeeklyFeaturedShow> & { eventId: string; position: number }): WeeklyFeaturedShow {
  return {
    genre: null,
    curatorNote: null,
    chatProvisionKey: `featured_show:test:${partial.eventId}`,
    title: partial.title ?? partial.eventId,
    artistName: partial.artistName ?? null,
    venueName: null,
    venueCity: null,
    eventDate: partial.eventDate ?? null,
    imageUrl: null,
    eventGenres: null,
    ...partial,
  };
}

const over = Array.from({ length: 18 }, (_, i) => show({ eventId: `e${i}`, position: i + 1 }));
const overClamp = clampFeaturedBand(over);
assert(overClamp.shows.length === 15, 'over-band clamps to 15');
assert(overClamp.outsideBand && overClamp.clamped, 'over-band flags PM');

const under = over.slice(0, 4);
const underClamp = clampFeaturedBand(under);
assert(underClamp.shows.length === 4, 'under-band does not pad');
assert(underClamp.outsideBand && !underClamp.clamped, 'under-band flags without inventing');

const empty = clampFeaturedBand([]);
assert(empty.outsideBand && empty.shows.length === 0, 'empty stays empty (no catalog dump)');

const unordered = [
  show({ eventId: 'late', position: 2, eventDate: '2026-08-28T00:00:00Z' }),
  show({ eventId: 'boosted', position: 5, eventDate: '2026-08-30T00:00:00Z' }),
  show({ eventId: 'early', position: 1, eventDate: '2026-08-26T00:00:00Z' }),
  show({ eventId: 'popular', position: 3, eventDate: '2026-08-27T00:00:00Z' }),
];
const ordered = orderFeaturedByCollisionPotential(unordered, {
  interestBoostIds: new Set(['boosted']),
});
assert(ordered[0].eventId === 'boosted', 'seeded interest sorts first');
assert(ordered[1].eventId === 'early', 'then curator position / doors');
assert(ordered[2].eventId === 'late', 'remaining by position');

const byGoing = orderFeaturedByCollisionPotential(
  [
    show({ eventId: 'a', position: 1, eventDate: '2026-08-26T00:00:00Z' }),
    show({ eventId: 'b', position: 1, eventDate: '2026-08-26T00:00:00Z' }),
  ],
  { goingCounts: new Map([['b', 12], ['a', 2]]) }
);
assert(byGoing[0].eventId === 'b', 'going counts break position/doors ties');

// T1 instrument: pass when eligibleCount >= 3
const t1Pass = recordHomeWarmT1Instrument({
  eligibleCount: 4,
  shownCount: 3,
  at: new Date('2026-08-25T16:00:00Z'),
});
assert(t1Pass.pass === true, 'T1 pass at eligibleCount=4');
assert(t1Pass.eligibleCount === 4, 'T1 stores gate-pass count');
assert(t1Pass.shownCount === 3, 'T1 stores post-hide shown count');

const t1Fail = recordHomeWarmT1Instrument({
  eligibleCount: 2,
  shownCount: 2,
  at: new Date('2026-08-24T16:00:00Z'),
});
assert(t1Fail.pass === false, 'T1 fail under threshold');

const scorecard = getHomeWarmT1Scorecard({ windowDays: 7, now: new Date('2026-08-25T20:00:00Z') });
assert(scorecard.days.length >= 1, 'T1 scorecard retains days');
assert(scorecard.days.some((d) => d.day === t1Pass.day && d.pass), 'T1 scorecard keeps pass day');

console.log('homeDensityService.selftest: ok');
