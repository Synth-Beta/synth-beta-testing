import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  WAVE1_LIVE_CHAT_KEYS,
  buildWave1Seats,
  expectedWave1SeatCounts,
  allLiveRoomsMeetMemberFloor,
} from './wave1SeedEnrollment.ts';

describe('wave1 seed enrollment landing map (LOI-598)', () => {
  it('builds 36 seats with 31 active and 5 standby held', () => {
    const seats = buildWave1Seats();
    assert.equal(seats.length, 36);
    assert.equal(seats.filter((s) => s.joinChatKeys.length > 0).length, 31);
    assert.equal(seats.filter((s) => s.crew === 'standby').length, 5);
    assert.ok(seats.filter((s) => s.crew === 'standby').every((s) => s.joinChatKeys.length === 0));
  });

  it('matches invite-wave-1 expected unique seats per live room', () => {
    const counts = expectedWave1SeatCounts();
    assert.deepEqual(counts, {
      'scene.this_week_dc': 13,
      'scene.going_out': 13,
      'FIX-SHOW-01': 21,
      'FIX-SHOW-02': 21,
      'FIX-SHOW-03': 11,
      'FIX-SHOW-04': 13,
      'FIX-SHOW-05': 13,
    });
    assert.ok(allLiveRoomsMeetMemberFloor(counts, 8));
  });

  it('never joins FIX-SHOW-06..12 in wave 1', () => {
    const banned = new Set(
      Array.from({ length: 7 }, (_, i) => `FIX-SHOW-${String(i + 6).padStart(2, '0')}`)
    );
    for (const seat of buildWave1Seats()) {
      for (const key of seat.joinChatKeys) {
        assert.equal(banned.has(key), false, `${seat.handle} → ${key}`);
        assert.ok(
          (WAVE1_LIVE_CHAT_KEYS as readonly string[]).includes(key),
          `unexpected key ${key}`
        );
      }
    }
  });
});
