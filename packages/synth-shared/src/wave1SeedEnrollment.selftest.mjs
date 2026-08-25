/**
 * Offline checks for LOI-598 wave-1 landing map (no network).
 * Run: node --experimental-strip-types packages/synth-shared/src/wave1SeedEnrollment.selftest.mjs
 * Or: node packages/synth-shared/src/wave1SeedEnrollment.selftest.mjs (Node 22+)
 */

import {
  WAVE1_LIVE_CHAT_KEYS,
  buildWave1Seats,
  expectedWave1SeatCounts,
  allLiveRoomsMeetMemberFloor,
} from './wave1SeedEnrollment.ts';

const seats = buildWave1Seats();
const active = seats.filter((s) => s.joinChatKeys.length > 0);
const standby = seats.filter((s) => s.crew === 'standby');

if (seats.length !== 36) throw new Error(`expected 36 seats, got ${seats.length}`);
if (active.length !== 31) throw new Error(`expected 31 active, got ${active.length}`);
if (standby.length !== 5) throw new Error(`expected 5 standby, got ${standby.length}`);
if (standby.some((s) => s.joinChatKeys.length > 0)) {
  throw new Error('standby must not join until Community pages');
}

const expected = {
  'scene.this_week_dc': 13,
  'scene.going_out': 13,
  'FIX-SHOW-01': 21,
  'FIX-SHOW-02': 21,
  'FIX-SHOW-03': 11,
  'FIX-SHOW-04': 13,
  'FIX-SHOW-05': 13,
};

const counts = expectedWave1SeatCounts();
for (const key of WAVE1_LIVE_CHAT_KEYS) {
  if (counts[key] !== expected[key]) {
    throw new Error(`${key}: expected ${expected[key]}, got ${counts[key]}`);
  }
}

if (!allLiveRoomsMeetMemberFloor(counts, 8)) {
  throw new Error('live rooms must all clear ≥8');
}

const offHome = ['FIX-SHOW-06', 'FIX-SHOW-07', 'FIX-SHOW-12'];
for (const seat of active) {
  for (const key of seat.joinChatKeys) {
    if (offHome.includes(key)) {
      throw new Error(`active seat ${seat.handle} must not join ${key}`);
    }
  }
}

console.log('wave1SeedEnrollment.selftest OK', counts);
