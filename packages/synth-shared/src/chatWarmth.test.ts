import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeWarmthSnapshot,
  WARMTH_HUMAN_MSG_24H_THRESHOLD,
  WARMTH_MEMBER_THRESHOLD,
} from './chatWarmth.ts';

describe('computeWarmthSnapshot (contract v1)', () => {
  it('marks scene room homeEligible when members + activity clear', () => {
    const snap = computeWarmthSnapshot({
      chatId: 'c1',
      chatKind: 'scene_persistent',
      showId: null,
      dcIcpMemberCount: WARMTH_MEMBER_THRESHOLD,
      humanMessageCount24h: WARMTH_HUMAN_MSG_24H_THRESHOLD,
      demoSeedLive: false,
      featuredParentInSet: false,
    });
    assert.equal(snap.homeEligible, true);
    assert.deepEqual(snap.gate.failReasons, []);
  });

  it('allows demoSeedLive to satisfy activity without 3 human msgs', () => {
    const snap = computeWarmthSnapshot({
      chatId: 'c2',
      chatKind: 'scene_persistent',
      showId: null,
      dcIcpMemberCount: 8,
      humanMessageCount24h: 0,
      demoSeedLive: true,
      featuredParentInSet: true,
    });
    assert.equal(snap.homeEligible, true);
    assert.equal(snap.gate.demoSeedLive, true);
  });

  it('fails scene room under member gate', () => {
    const snap = computeWarmthSnapshot({
      chatId: 'c3',
      chatKind: 'scene_persistent',
      showId: null,
      dcIcpMemberCount: 7,
      humanMessageCount24h: 5,
      demoSeedLive: true,
      featuredParentInSet: true,
    });
    assert.equal(snap.homeEligible, false);
    assert.ok(snap.gate.failReasons.includes('members_below_8'));
  });

  it('requires featured parent for featured_show chats', () => {
    const cold = computeWarmthSnapshot({
      chatId: 'c4',
      chatKind: 'featured_show',
      showId: 'FIX-SHOW-07',
      dcIcpMemberCount: 10,
      humanMessageCount24h: 4,
      demoSeedLive: false,
      featuredParentInSet: false,
    });
    assert.equal(cold.homeEligible, false);
    assert.ok(cold.gate.failReasons.includes('show_not_featured'));

    const warm = computeWarmthSnapshot({
      chatId: 'c5',
      chatKind: 'featured_show',
      showId: 'FIX-SHOW-01',
      dcIcpMemberCount: 10,
      humanMessageCount24h: 4,
      demoSeedLive: false,
      featuredParentInSet: true,
    });
    assert.equal(warm.homeEligible, true);
  });

  it('emits activity + not_demo_seed_live when both activity paths fail', () => {
    const snap = computeWarmthSnapshot({
      chatId: 'c6',
      chatKind: 'featured_show',
      showId: 'FIX-SHOW-01',
      dcIcpMemberCount: 8,
      humanMessageCount24h: 1,
      demoSeedLive: false,
      featuredParentInSet: true,
    });
    assert.equal(snap.homeEligible, false);
    assert.deepEqual(snap.gate.failReasons, [
      'activity_below_3',
      'not_demo_seed_live',
    ]);
  });
});
