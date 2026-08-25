/**
 * Lightweight self-checks for LOI-571 density helpers (no Jest required).
 * Run: npx tsx src/services/homeDensityService.selftest.ts
 */
import {
  clampFeaturedBand,
  orderFeaturedByCollisionPotential,
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
];
const ordered = orderFeaturedByCollisionPotential(unordered, {
  interestBoostIds: new Set(['boosted']),
});
assert(ordered[0].eventId === 'boosted', 'seeded interest sorts first');
assert(ordered[1].eventId === 'early', 'then curator position / doors');
assert(ordered[2].eventId === 'late', 'remaining by position');

console.log('homeDensityService.selftest: ok');
