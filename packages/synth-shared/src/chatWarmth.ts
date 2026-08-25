/**
 * Chat warmth evaluation (contract v1 — LOI-561 / LOI-577).
 * Threshold math is authoritative in Postgres (`evaluate_chat_warmth`).
 * This module mirrors the predicate for shared types, client RPC wrappers,
 * and offline unit tests. Frontend Home must only consume `homeEligible`.
 */

import type { SynthSupabaseClient } from './supabaseClientType';

export const WARMTH_CONTRACT_VERSION = 'v1' as const;

export const WARMTH_MEMBER_THRESHOLD = 8;
export const WARMTH_HUMAN_MSG_24H_THRESHOLD = 3;

export type ChatWarmthKind = 'scene_persistent' | 'featured_show';

export type WarmthFailReason =
  | 'members_below_8'
  | 'activity_below_3'
  | 'not_demo_seed_live'
  | 'show_not_featured';

export interface ChatWarmthGate {
  dcIcpMemberCount: number;
  humanMessageCount24h: number;
  demoSeedLive: boolean;
  featuredParentInSet: boolean;
  failReasons: WarmthFailReason[];
}

export interface ChatWarmthSnapshot {
  chatId: string;
  chatKind: ChatWarmthKind | null;
  showId: string | null;
  homeEligible: boolean;
  gate: ChatWarmthGate;
  evaluatedAt: string;
}

export interface HomeWarmChatsResponse {
  items: ChatWarmthSnapshot[];
  fetchedAt: string;
}

export interface DemoSeedLiveSetResult {
  liveKeys: string[];
  updatedChatIds: string[];
  clearedCount: number;
  appliedAt: string;
}

/** Inputs for the pure predicate (server encodes the same rules). */
export interface WarmthEvalInput {
  chatId: string;
  chatKind: ChatWarmthKind | null;
  showId: string | null;
  dcIcpMemberCount: number;
  humanMessageCount24h: number;
  demoSeedLive: boolean;
  featuredParentInSet: boolean;
  evaluatedAt?: string;
}

export function computeWarmthSnapshot(input: WarmthEvalInput): ChatWarmthSnapshot {
  const membersOk = input.dcIcpMemberCount >= WARMTH_MEMBER_THRESHOLD;
  const activityOk =
    input.humanMessageCount24h >= WARMTH_HUMAN_MSG_24H_THRESHOLD || input.demoSeedLive;
  const featuredOk =
    input.chatKind !== 'featured_show' || input.featuredParentInSet === true;
  const homeEligible = membersOk && activityOk && featuredOk;

  const failReasons: WarmthFailReason[] = [];
  if (!membersOk) failReasons.push('members_below_8');
  if (!activityOk) {
    failReasons.push('activity_below_3');
    if (!input.demoSeedLive) failReasons.push('not_demo_seed_live');
  }
  if (!featuredOk) failReasons.push('show_not_featured');

  return {
    chatId: input.chatId,
    chatKind: input.chatKind,
    showId: input.showId,
    homeEligible,
    gate: {
      dcIcpMemberCount: input.dcIcpMemberCount,
      humanMessageCount24h: input.humanMessageCount24h,
      demoSeedLive: input.demoSeedLive,
      featuredParentInSet: input.featuredParentInSet,
      failReasons,
    },
    evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
  };
}

/** Default Community live-set keys from LOI-561 demo-week seed plan. */
export const DEFAULT_DEMO_SEED_LIVE_KEYS = [
  'scene.dc.this_week',
  'scene.dc.going_out',
  'FIX-SHOW-01',
  'FIX-SHOW-02',
  'FIX-SHOW-03',
  'FIX-SHOW-04',
  'FIX-SHOW-05',
] as const;

function asSnapshot(raw: unknown): ChatWarmthSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const gate = (o.gate ?? {}) as Record<string, unknown>;
  return {
    chatId: String(o.chatId ?? ''),
    chatKind: (o.chatKind as ChatWarmthKind | null) ?? null,
    showId: o.showId == null ? null : String(o.showId),
    homeEligible: Boolean(o.homeEligible),
    gate: {
      dcIcpMemberCount: Number(gate.dcIcpMemberCount ?? 0),
      humanMessageCount24h: Number(gate.humanMessageCount24h ?? 0),
      demoSeedLive: Boolean(gate.demoSeedLive),
      featuredParentInSet: gate.featuredParentInSet !== false,
      failReasons: Array.isArray(gate.failReasons)
        ? (gate.failReasons as WarmthFailReason[])
        : [],
    },
    evaluatedAt: String(o.evaluatedAt ?? new Date().toISOString()),
  };
}

/** RPC: refresh + return warmth snapshot for one chat. */
export async function fetchChatWarmthSnapshot(
  supabase: SynthSupabaseClient,
  chatId: string,
  options?: { refresh?: boolean }
): Promise<{ data: ChatWarmthSnapshot | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('get_chat_warmth_snapshot', {
      p_chat_id: chatId,
      p_refresh: options?.refresh ?? false,
    });
    if (error) return { data: null, error: error.message || 'rpc_failed' };
    return { data: asSnapshot(data), error: null };
  } catch (e: unknown) {
    return { data: null, error: e instanceof Error ? e.message : 'unknown_error' };
  }
}

/**
 * RPC: Home warm strip source. Returns only homeEligible chats (server filtered).
 * Frontend must not re-apply member/message/demo thresholds.
 */
export async function fetchHomeWarmChats(
  supabase: SynthSupabaseClient,
  limit = 5
): Promise<{ data: HomeWarmChatsResponse | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('get_home_warm_chats', {
      p_limit: limit,
    });
    if (error) return { data: null, error: error.message || 'rpc_failed' };
    const raw = (data ?? {}) as Record<string, unknown>;
    const items = Array.isArray(raw.items)
      ? (raw.items.map(asSnapshot).filter(Boolean) as ChatWarmthSnapshot[])
      : [];
    return {
      data: {
        items,
        fetchedAt: String(raw.fetchedAt ?? new Date().toISOString()),
      },
      error: null,
    };
  } catch (e: unknown) {
    return { data: null, error: e instanceof Error ? e.message : 'unknown_error' };
  }
}

/** Community: publish live-set keys; clears demoSeedLive off anything not listed. */
export async function publishDemoSeedLiveSet(
  supabase: SynthSupabaseClient,
  chatKeys: string[]
): Promise<{ data: DemoSeedLiveSetResult | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('set_demo_seed_live_set', {
      p_chat_keys: chatKeys,
    });
    if (error) return { data: null, error: error.message || 'rpc_failed' };
    const raw = (data ?? {}) as Record<string, unknown>;
    return {
      data: {
        liveKeys: Array.isArray(raw.liveKeys) ? (raw.liveKeys as string[]) : [],
        updatedChatIds: Array.isArray(raw.updatedChatIds)
          ? (raw.updatedChatIds as string[])
          : [],
        clearedCount: Number(raw.clearedCount ?? 0),
        appliedAt: String(raw.appliedAt ?? new Date().toISOString()),
      },
      error: null,
    };
  } catch (e: unknown) {
    return { data: null, error: e instanceof Error ? e.message : 'unknown_error' };
  }
}

/** Ensure scene + FIX-SHOW-01..12 crew chats exist. */
export async function ensureDensityDemoChats(
  supabase: SynthSupabaseClient
): Promise<{ data: Record<string, string> | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('ensure_density_demo_chats');
    if (error) return { data: null, error: error.message || 'rpc_failed' };
    return { data: (data as Record<string, string>) ?? {}, error: null };
  } catch (e: unknown) {
    return { data: null, error: e instanceof Error ? e.message : 'unknown_error' };
  }
}

/** Community: toggle demoSeedLive on one chat key (msgs OR seed-live gate). */
export async function setChatSeedLive(
  supabase: SynthSupabaseClient,
  chatKey: string,
  live = true
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('set_chat_seed_live', {
      p_chat_key: chatKey,
      p_live: live,
    });
    if (error) return { data: null, error: error.message || 'rpc_failed' };
    return { data: (data as Record<string, unknown>) ?? null, error: null };
  } catch (e: unknown) {
    return { data: null, error: e instanceof Error ? e.message : 'unknown_error' };
  }
}

/** Tag a user as demo seed proxy (membership/co-presence only). */
export async function setUserSeedProxy(
  supabase: SynthSupabaseClient,
  userId: string,
  isProxy = true
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('set_user_seed_proxy', {
      p_user_id: userId,
      p_is_proxy: isProxy,
    });
    if (error) return { data: null, error: error.message || 'rpc_failed' };
    return { data: (data as Record<string, unknown>) ?? null, error: null };
  } catch (e: unknown) {
    return { data: null, error: e instanceof Error ? e.message : 'unknown_error' };
  }
}

/** Sync featured-show chats 1:1 with published Curator pins. */
export async function syncFeaturedShowChatsForWeek(
  supabase: SynthSupabaseClient,
  weekId?: string | null
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('sync_featured_show_chats_for_week', {
      p_week_id: weekId ?? null,
      p_metro: 'dc',
    });
    if (error) return { data: null, error: error.message || 'rpc_failed' };
    return { data: (data as Record<string, unknown>) ?? null, error: null };
  } catch (e: unknown) {
    return { data: null, error: e instanceof Error ? e.message : 'unknown_error' };
  }
}

/** Archive featured-show chats whose doors were >48h ago. */
export async function archiveFeaturedShowChatsPastDoors(
  supabase: SynthSupabaseClient
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('archive_featured_show_chats_past_doors');
    if (error) return { data: null, error: error.message || 'rpc_failed' };
    return { data: (data as Record<string, unknown>) ?? null, error: null };
  } catch (e: unknown) {
    return { data: null, error: e instanceof Error ? e.message : 'unknown_error' };
  }
}

/** Hosting directory: live scene + featured room ids. */
export async function fetchDemoWarmthRoomDirectory(
  supabase: SynthSupabaseClient
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('get_demo_warmth_room_directory');
    if (error) return { data: null, error: error.message || 'rpc_failed' };
    return { data: (data as Record<string, unknown>) ?? null, error: null };
  } catch (e: unknown) {
    return { data: null, error: e instanceof Error ? e.message : 'unknown_error' };
  }
}
