/**
 * LOI-598 wave-1 seed-proxy enrollment (demo week).
 * Roster: LOI-579 invite-wave-1 · Live set: LOI-561 demo-week-seed-plan
 */

import type { SynthSupabaseClient } from './supabaseClientType';

export type Wave1Crew =
  | 'host'
  | 'scene_a'
  | 'scene_b'
  | 'show_depth'
  | 'standby';

export interface Wave1Seat {
  handle: string;
  crew: Wave1Crew;
  /** Chat keys to join now. Empty = hold (standby). */
  joinChatKeys: readonly string[];
}

export interface Wave1RoomSeatCount {
  chatKey: string;
  chatId: string | null;
  dcIcpMemberCount: number;
  demoSeedLive: boolean;
  homeEligible: boolean;
  membersOk: boolean;
}

export interface Wave1EnrollmentResult {
  wave: number;
  proxiesEnsured: number;
  activeJoinSeats: number;
  standbyHeld: number;
  rooms: Wave1RoomSeatCount[];
  appliedAt: string;
}

/** Live-set chat keys that receive demoSeedLive=true (not 06–12). */
export const WAVE1_LIVE_CHAT_KEYS = [
  'scene.this_week_dc',
  'scene.going_out',
  'FIX-SHOW-01',
  'FIX-SHOW-02',
  'FIX-SHOW-03',
  'FIX-SHOW-04',
  'FIX-SHOW-05',
] as const;

export const WAVE1_HOST_HANDLES = [
  'host.dc.maya',
  'host.dc.jordan',
  'host.dc.riley',
] as const;

export const WAVE1_SCENE_A_HANDLES = [
  'crew.a.01',
  'crew.a.02',
  'crew.a.03',
  'crew.a.04',
  'crew.a.05',
  'crew.a.06',
  'crew.a.07',
  'crew.a.08',
  'crew.a.09',
  'crew.a.10',
] as const;

export const WAVE1_SCENE_B_HANDLES = [
  'crew.b.01',
  'crew.b.02',
  'crew.b.03',
  'crew.b.04',
  'crew.b.05',
  'crew.b.06',
  'crew.b.07',
  'crew.b.08',
  'crew.b.09',
  'crew.b.10',
] as const;

export const WAVE1_SHOW_DEPTH_HANDLES = [
  'depth.01',
  'depth.02',
  'depth.03',
  'depth.04',
  'depth.05',
  'depth.06',
  'depth.07',
  'depth.08',
] as const;

export const WAVE1_STANDBY_HANDLES = [
  'standby.01',
  'standby.02',
  'standby.03',
  'standby.04',
  'standby.05',
] as const;

/** Full wave-1 roster with landing-map joins (standby joinChatKeys empty). */
export function buildWave1Seats(): Wave1Seat[] {
  const seats: Wave1Seat[] = [];

  for (const handle of WAVE1_HOST_HANDLES) {
    seats.push({
      handle,
      crew: 'host',
      joinChatKeys: WAVE1_LIVE_CHAT_KEYS,
    });
  }
  for (const handle of WAVE1_SCENE_A_HANDLES) {
    seats.push({
      handle,
      crew: 'scene_a',
      joinChatKeys: ['scene.this_week_dc', 'FIX-SHOW-01', 'FIX-SHOW-02'],
    });
  }
  for (const handle of WAVE1_SCENE_B_HANDLES) {
    seats.push({
      handle,
      crew: 'scene_b',
      joinChatKeys: ['scene.going_out', 'FIX-SHOW-04', 'FIX-SHOW-05'],
    });
  }
  for (const handle of WAVE1_SHOW_DEPTH_HANDLES) {
    seats.push({
      handle,
      crew: 'show_depth',
      joinChatKeys: ['FIX-SHOW-01', 'FIX-SHOW-02', 'FIX-SHOW-03'],
    });
  }
  for (const handle of WAVE1_STANDBY_HANDLES) {
    seats.push({ handle, crew: 'standby', joinChatKeys: [] });
  }

  return seats;
}

/** Expected unique proxy seats per live room after wave-1 enrollment. */
export function expectedWave1SeatCounts(): Record<string, number> {
  const seats = buildWave1Seats();
  const counts: Record<string, number> = {};
  for (const key of WAVE1_LIVE_CHAT_KEYS) counts[key] = 0;
  for (const seat of seats) {
    for (const key of seat.joinChatKeys) {
      if (key in counts) counts[key] += 1;
    }
  }
  return counts;
}

export function allLiveRoomsMeetMemberFloor(
  counts: Record<string, number>,
  floor = 8
): boolean {
  return WAVE1_LIVE_CHAT_KEYS.every((key) => (counts[key] ?? 0) >= floor);
}

/** RPC: enroll wave-1 proxies, set demoSeedLive, return per-room warmth counts. */
export async function enrollWave1SeedProxies(
  supabase: SynthSupabaseClient
): Promise<{ data: Wave1EnrollmentResult | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('enroll_wave1_seed_proxies');
    if (error) return { data: null, error: error.message || 'rpc_failed' };
    const raw = (data ?? {}) as Record<string, unknown>;
    const roomsRaw = Array.isArray(raw.rooms) ? raw.rooms : [];
    const rooms: Wave1RoomSeatCount[] = roomsRaw.map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return {
        chatKey: String(o.chatKey ?? ''),
        chatId: o.chatId == null ? null : String(o.chatId),
        dcIcpMemberCount: Number(o.dcIcpMemberCount ?? 0),
        demoSeedLive: Boolean(o.demoSeedLive),
        homeEligible: Boolean(o.homeEligible),
        membersOk: Boolean(o.membersOk),
      };
    });
    return {
      data: {
        wave: Number(raw.wave ?? 1),
        proxiesEnsured: Number(raw.proxiesEnsured ?? 0),
        activeJoinSeats: Number(raw.activeJoinSeats ?? 31),
        standbyHeld: Number(raw.standbyHeld ?? 5),
        rooms,
        appliedAt: String(raw.appliedAt ?? new Date().toISOString()),
      },
      error: null,
    };
  } catch (e: unknown) {
    return { data: null, error: e instanceof Error ? e.message : 'unknown_error' };
  }
}
